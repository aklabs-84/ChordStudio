// Song → 재생 이벤트 변환. 소리(Tone.js)와 분리된 순수 함수라서 테스트할 수 있고,
// 나중에 MIDI 내보내기(단계 6)도 같은 이벤트를 그대로 쓴다.
// 시간 단위는 "박"(4분음표 = 1). 초 단위 변환은 엔진이 BPM으로 한다.
import { mulberry32 } from "./generator";
import { voiceProgression, type Voicing } from "./voicing";
import {
  BEATS_PER_BAR,
  resolveBarPattern,
  type ChordSlot,
  type DrumLane,
  type Section,
  type Song,
  type TrackId,
} from "./schema";
import { parseChord, type ParsedChord } from "./theory";

const STEP_BEATS = 0.25; // 16분음표 = 0.25박

export interface NoteEvent {
  track: TrackId;
  /** 시작 시각 (박, 곡 처음부터) */
  time: number;
  /** 길이 (박) */
  duration: number;
  /** 피치 음: MIDI 번호. 드럼은 없음 */
  midi?: number;
  /** 드럼: 레인 이름 */
  lane?: DrumLane;
  /** 0~1 */
  velocity: number;
}

export interface EventOptions {
  /** false면 스윙만 적용하고 타이밍/세기 흔들림을 끈다 ("기계 소리" 비교용). 기본 true */
  humanize?: boolean;
}

export interface SongEvents {
  events: NoteEvent[];
  totalBeats: number;
}

/**
 * 스윙: 박 안의 위치(0~1)를 비틀어 8분 뒷박(0.5)을 뒤로 민다.
 * swing=0 이면 그대로, 1이면 뒷박이 3연음 위치(2/3)까지 밀린다. 16분음표도 비례해서 따라간다.
 */
export function swingWarp(p: number, swing: number): number {
  const offbeat = 0.5 + swing / 6;
  return p < 0.5 ? p * (offbeat / 0.5) : offbeat + ((p - 0.5) * (1 - offbeat)) / 0.5;
}

interface Segment {
  start: number; // 절대 박
  beats: number;
  chord: ParsedChord;
  voicing: Voicing;
}

interface SectionInstance {
  section: Section;
  start: number;
  segments: Segment[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** arrangement를 펼쳐 섹션 인스턴스와 코드 구간을 만들고, 곡 전체에 걸쳐 보이싱을 잇는다. */
function flatten(song: Song): { instances: SectionInstance[]; totalBeats: number } {
  const byId = new Map(song.sections.map((s) => [s.id, s]));
  const flat: { chord: ParsedChord; slot: ChordSlot; start: number }[] = [];
  const shells: { section: Section; start: number; from: number; to: number }[] = [];
  let cursor = 0;
  for (const id of song.arrangement) {
    const section = byId.get(id);
    if (!section) continue;
    const from = flat.length;
    let at = cursor;
    for (const slot of section.chords) {
      flat.push({ chord: parseChord(slot.symbol), slot, start: at });
      at += slot.beats;
    }
    shells.push({ section, start: cursor, from, to: flat.length });
    cursor += section.bars * BEATS_PER_BAR;
  }
  const voicings = voiceProgression(flat.map((f) => f.chord));
  const segments: Segment[] = flat.map((f, i) => ({
    start: f.start,
    beats: f.slot.beats,
    chord: f.chord,
    voicing: voicings[i]!,
  }));
  return {
    instances: shells.map((s) => ({ section: s.section, start: s.start, segments: segments.slice(s.from, s.to) })),
    totalBeats: cursor,
  };
}

const LONG_DRUM_LANES: DrumLane[] = ["ride", "hhOpen", "crash"];

export function songToEvents(song: Song, options: EventOptions = {}): SongEvents {
  const humanize = options.humanize ?? true;
  const { instances, totalBeats } = flatten(song);
  const rng = mulberry32((song.meta.seed ?? 0) + 1);
  const msToBeats = song.meta.bpm / 60000;
  const events: NoteEvent[] = [];

  const push = (e: NoteEvent, jitterScale = 1): void => {
    let time = e.time;
    const whole = Math.floor(time);
    time = whole + swingWarp(time - whole, song.meta.swing);
    let velocity = e.velocity;
    if (humanize) {
      // 두 난수의 평균 → 가운데로 몰리는 흔들림. 박 머리는 덜 흔들어 리듬 축을 유지한다.
      const onBeat = Math.abs(e.time - Math.round(e.time)) < 1e-9;
      const spread = song.meta.humanizeMs * msToBeats * jitterScale * (onBeat ? 0.5 : 1);
      time += (rng() + rng() - 1) * spread;
      velocity *= 1 + (rng() - 0.5) * 0.16;
    }
    events.push({ ...e, time: Math.max(0, time), velocity: clamp(velocity, 0.05, 1) });
  };

  for (const { section, start, segments } of instances) {
    const segmentAt = (beat: number): { seg: Segment; next?: Segment } => {
      let i = segments.findIndex((s) => beat >= s.start && beat < s.start + s.beats);
      if (i < 0) i = segments.length - 1;
      return { seg: segments[i]!, next: segments[i + 1] };
    };

    for (let bar = 0; bar < section.bars; bar++) {
      const barStart = start + bar * BEATS_PER_BAR;
      const hitsOf = (values: number[]): { step: number; velocity: number }[] =>
        values.flatMap((velocity, step) => (velocity > 0 ? [{ step, velocity }] : []));
      // 코드가 바뀌는 박에 패턴 타격이 없으면 하나 더해서, 바뀐 코드가 제때 울리게 한다(세기는 바로 앞 타격을 따른다)
      const chordHitsOf = (values: number[]): { step: number; velocity: number }[] => {
        const hits = hitsOf(values);
        const extra: { step: number; velocity: number }[] = [];
        for (const seg of segments) {
          const rel = seg.start - barStart;
          if (rel < 0 || rel >= BEATS_PER_BAR) continue;
          const step = Math.round(rel / STEP_BEATS);
          if (hits.some((h) => h.step === step)) continue;
          const prev = hits.filter((h) => h.step < step).pop();
          extra.push({ step, velocity: prev?.velocity ?? 0.7 });
        }
        return extra.length ? [...hits, ...extra].sort((a, b) => a.step - b.step) : hits;
      };

      // 피아노
      const piano = section.tracks.piano;
      const pianoHits = piano.pattern.muted ? [] : chordHitsOf(resolveBarPattern(piano.pattern, bar, section.bars));
      pianoHits.forEach((hit, k) => {
        const time = barStart + hit.step * STEP_BEATS;
        const { seg } = segmentAt(time);
        const segEnd = seg.start + seg.beats;
        const nextHit = pianoHits[k + 1];
        const gap = (nextHit ? nextHit.step : 16) * STEP_BEATS + barStart - time;
        const notes = seg.voicing.notes;
        if (piano.style === "chord") {
          const duration = Math.min(gap, segEnd - time);
          notes.forEach((midi, i) => {
            // 아래 음부터 살짝 차례로 (손가락이 동시에 닿지 않는 느낌)
            push({ track: "piano", time: time + (humanize ? i * 0.006 : 0), duration, midi, velocity: hit.velocity });
          });
          return;
        }
        const sequence =
          piano.style === "arp-up"
            ? notes
            : piano.style === "arp-updown"
              ? [...notes, ...notes.slice(1, -1).reverse()]
              : [0, 2, 1, 2].map((i) => notes[i % notes.length]!);
        const midi = sequence[k % sequence.length]!;
        push({ track: "piano", time, duration: Math.min(gap * 2, segEnd - time), midi, velocity: hit.velocity });
      });

      // 베이스
      const bassHits = section.tracks.bass.pattern.muted ? [] : chordHitsOf(resolveBarPattern(section.tracks.bass.pattern, bar, section.bars));
      bassHits.forEach((hit, k) => {
        const time = barStart + hit.step * STEP_BEATS;
        const { seg, next } = segmentAt(time);
        const segEnd = seg.start + seg.beats;
        const nextHit = bassHits[k + 1];
        const nextTime = nextHit ? barStart + nextHit.step * STEP_BEATS : barStart + BEATS_PER_BAR;
        let midi = seg.voicing.bass;
        // 코드 바뀌기 직전 마지막 타격은 다음 근음을 반음으로 접근
        const isLastInChord = !nextHit || nextTime >= segEnd;
        if (section.tracks.bass.approach && next && isLastInChord && time > seg.start && segEnd - time <= 1) {
          const target = next.voicing.bass;
          if (target !== midi) midi = target + (midi > target ? 1 : -1);
        }
        push({
          track: "bass",
          time,
          duration: Math.max(0.1, Math.min(nextTime, segEnd) - time) * 0.9,
          midi,
          velocity: hit.velocity,
        });
      });

      // 드럼
      for (const [lane, pattern] of Object.entries(section.tracks.drums.lanes) as [DrumLane, NonNullable<Section["tracks"]["drums"]["lanes"][DrumLane]>][]) {
        if (pattern.muted) continue;
        for (const hit of hitsOf(resolveBarPattern(pattern, bar, section.bars))) {
          push(
            {
              track: "drums",
              time: barStart + hit.step * STEP_BEATS,
              duration: LONG_DRUM_LANES.includes(lane) ? 0.5 : 0.1,
              lane,
              velocity: hit.velocity,
            },
            0.6,
          );
        }
      }

      // 스트링: 패턴이 있으면 피아노 코드처럼, 없으면 아래 코드 단위 패드에서 처리
      const strings = section.tracks.strings;
      if (strings?.pattern && !strings.pattern.muted) {
        const hits = chordHitsOf(resolveBarPattern(strings.pattern, bar, section.bars));
        hits.forEach((hit, k) => {
          const time = barStart + hit.step * STEP_BEATS;
          const { seg } = segmentAt(time);
          const nextHit = hits[k + 1];
          const gap = (nextHit ? nextHit.step : 16) * STEP_BEATS + barStart - time;
          const duration = Math.min(gap, seg.start + seg.beats - time);
          for (const midi of seg.voicing.notes) {
            push({ track: "strings", time, duration, midi, velocity: hit.velocity * 0.7 });
          }
        });
      }
    }

    // 스트링 패드: 패턴이 없으면 코드 길이만큼 늘어지는 화음
    if (section.tracks.strings && !section.tracks.strings.pattern) {
      for (const seg of segments) {
        for (const midi of seg.voicing.notes) {
          push({ track: "strings", time: seg.start, duration: seg.beats, midi, velocity: 0.55 });
        }
      }
    }
  }

  events.sort((a, b) => a.time - b.time);
  return { events, totalBeats };
}
