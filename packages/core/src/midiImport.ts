// 표준 MIDI 파일(.mid) → Song 부분 추출. 패턴·섹션 구조는 MIDI에 남지 않으므로
// 템포와 "코드로 추정되는 진행"만 읽어 들이고, 비트/악기 패턴은 장르 생성기 기본값을 쓴다.
// 외부에서 만든 임의의 MIDI 파일도 들어오므로 예외를 던지지 않고 결과 객체로 돌려준다.
import { generateSong } from "./generator";
import { BEATS_PER_BAR, SONG_LIMITS, validateSong, type ChordSlot, type Genre, type Section, type Song } from "./schema";
import { CHORD_INTERVALS, formatChord, mod12, type ChordQuality } from "./theory";

/** 이보다 큰 파일은 MIDI 파일이 아니라고 본다 */
export const MAX_MIDI_FILE_BYTES = 2_000_000;

export type MidiImportResult = { ok: true; song: Song; warning?: string } | { ok: false; error: string };

interface RawNote {
  tick: number;
  channel: number;
  note: number;
}

interface ParsedMidi {
  ppq: number;
  microsecondsPerQuarter: number;
  notes: RawNote[];
}

function ascii(bytes: Uint8Array, start: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[start + i] ?? 0);
  return s;
}

const readU32 = (bytes: Uint8Array, o: number): number =>
  (((bytes[o]! << 24) | (bytes[o + 1]! << 16) | (bytes[o + 2]! << 8) | bytes[o + 3]!) >>> 0);

function readVlq(bytes: Uint8Array, pos: { i: number }): number {
  let value = 0;
  for (let guard = 0; guard < 5; guard++) {
    const byte = bytes[pos.i++] ?? 0;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return value >>> 0;
}

/** SMF format 0/1 파싱. 노트온 시작 시점만 모은다(코드 추정에는 지속시간이 필요 없음). */
function parseStandardMidi(bytes: Uint8Array): ParsedMidi | { error: string } {
  if (bytes.length < 14 || ascii(bytes, 0, 4) !== "MThd") return { error: "표준 MIDI 파일(.mid)이 아닙니다" };
  const headerLen = readU32(bytes, 4);
  if (headerLen !== 6) return { error: "지원하지 않는 MIDI 헤더 형식입니다" };
  const ntrks = (bytes[10]! << 8) | bytes[11]!;
  const division = (bytes[12]! << 8) | bytes[13]!;
  if (division & 0x8000) return { error: "SMPTE 타임코드 방식의 MIDI 파일은 지원하지 않습니다" };
  const ppq = division || 480;

  const notes: RawNote[] = [];
  let microsecondsPerQuarter = 500_000; // 기본 120bpm
  let tempoFound = false;
  let offset = 14;

  for (let t = 0; t < ntrks && offset + 8 <= bytes.length; t++) {
    if (ascii(bytes, offset, 4) !== "MTrk") break;
    const trackLen = readU32(bytes, offset + 4);
    const trackStart = offset + 8;
    const trackEnd = Math.min(trackStart + trackLen, bytes.length);
    let pos = trackStart;
    let tick = 0;
    let runningStatus = 0;

    while (pos < trackEnd) {
      const p = { i: pos };
      tick += readVlq(bytes, p);
      pos = p.i;

      let statusByte = bytes[pos] ?? 0;
      if (statusByte < 0x80) {
        statusByte = runningStatus;
      } else {
        pos++;
        if (statusByte < 0xf0) runningStatus = statusByte;
      }

      if (statusByte === 0xff) {
        const metaType = bytes[pos++] ?? 0;
        const p2 = { i: pos };
        const len = readVlq(bytes, p2);
        pos = p2.i;
        if (metaType === 0x51 && len === 3 && !tempoFound) {
          microsecondsPerQuarter = (bytes[pos]! << 16) | (bytes[pos + 1]! << 8) | bytes[pos + 2]!;
          tempoFound = true;
        }
        pos += len;
      } else if (statusByte === 0xf0 || statusByte === 0xf7) {
        const p2 = { i: pos };
        const len = readVlq(bytes, p2);
        pos = p2.i + len;
      } else {
        const type = statusByte & 0xf0;
        const channel = statusByte & 0x0f;
        if (type === 0xc0 || type === 0xd0) {
          pos += 1;
        } else {
          const d1 = bytes[pos] ?? 0;
          const d2 = bytes[pos + 1] ?? 0;
          pos += 2;
          if (type === 0x90 && d2 > 0) notes.push({ tick, channel, note: d1 });
        }
      }
    }
    offset = trackEnd;
  }

  return { ppq, microsecondsPerQuarter, notes };
}

const ALL_QUALITIES = Object.keys(CHORD_INTERVALS) as ChordQuality[];

/** 코드 음과 실제 울린 음이 얼마나 겹치는지로 점수를 매긴다. 겹침은 가산, 코드에 없는 음·안 울린 코드음은 감산. */
function scoreChord(root: number, quality: ChordQuality, pcs: ReadonlySet<number>): number {
  const chordPcs = new Set(CHORD_INTERVALS[quality].map((iv) => mod12(root + iv)));
  let inCommon = 0;
  for (const pc of chordPcs) if (pcs.has(pc)) inCommon++;
  let extra = 0;
  for (const pc of pcs) if (!chordPcs.has(pc)) extra++;
  const missing = chordPcs.size - inCommon;
  return inCommon * 2 - extra - missing - chordPcs.size * 0.01;
}

/** 피치클래스 집합(과 최저음)에 가장 가까운 코드 기호를 고른다. 완전히 정확하진 않은 근사치. */
function bestChordSymbol(pcs: number[], bassPc: number): string {
  const set = new Set(pcs);
  let best: { root: number; quality: ChordQuality; score: number } | null = null;
  for (let root = 0; root < 12; root++) {
    for (const quality of ALL_QUALITIES) {
      const score = scoreChord(root, quality, set);
      if (!best || score > best.score) best = { root, quality, score };
    }
  }
  const chord = best!;
  const bassInChord = CHORD_INTERVALS[chord.quality].some((iv) => mod12(chord.root + iv) === bassPc);
  const useBass = bassPc !== chord.root && bassInChord;
  return formatChord(useBass ? { root: chord.root, quality: chord.quality, bass: bassPc } : { root: chord.root, quality: chord.quality });
}

function chordsFromBeats(symbols: string[]): ChordSlot[] {
  const slots: ChordSlot[] = [];
  for (const symbol of symbols) {
    const last = slots[slots.length - 1];
    if (last && last.symbol === symbol) last.beats += 1;
    else slots.push({ symbol, beats: 1 });
  }
  return slots;
}

export interface MidiImportOptions {
  /** 비트/악기 패턴은 MIDI에 없어 이 장르의 기본 패턴을 대신 쓴다 (기본 "pop") */
  genre?: Genre;
  title?: string;
}

/** 표준 MIDI 파일 바이트 → Song. 코드 진행은 피치클래스 매칭으로 추정한 근사치, 패턴은 장르 기본값. */
export function midiToSong(bytes: Uint8Array, options: MidiImportOptions = {}): MidiImportResult {
  if (bytes.byteLength === 0) return { ok: false, error: "빈 파일입니다" };
  if (bytes.byteLength > MAX_MIDI_FILE_BYTES) return { ok: false, error: "파일이 너무 큽니다" };

  const parsed = parseStandardMidi(bytes);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const pitchedNotes = parsed.notes.filter((n) => n.channel !== 9); // 채널10(인덱스9) = 드럼, 코드 추정에서 제외
  if (pitchedNotes.length === 0) {
    return { ok: false, error: "코드로 쓸 수 있는 음표를 찾지 못했습니다 (드럼 전용이거나 빈 파일일 수 있습니다)" };
  }

  const beatOf = (tick: number) => Math.max(0, Math.round(tick / parsed.ppq));
  const maxBeat = pitchedNotes.reduce((m, n) => Math.max(m, beatOf(n.tick)), 0);
  let warning: string | undefined;

  const maxBeatsAllowed = SONG_LIMITS.sectionBars * BEATS_PER_BAR;
  let totalBeats = maxBeat + 1;
  if (totalBeats > maxBeatsAllowed) {
    totalBeats = maxBeatsAllowed;
    warning = `곡이 너무 길어 앞부분 ${SONG_LIMITS.sectionBars}마디만 불러왔습니다.`;
  }
  const bars = Math.ceil(totalBeats / BEATS_PER_BAR);
  totalBeats = bars * BEATS_PER_BAR;

  const byBeat = new Map<number, number[]>();
  for (const n of pitchedNotes) {
    const b = beatOf(n.tick);
    if (b >= totalBeats) continue;
    const list = byBeat.get(b);
    if (list) list.push(n.note);
    else byBeat.set(b, [n.note]);
  }

  const symbols: string[] = [];
  let lastSymbol = "C";
  for (let b = 0; b < totalBeats; b++) {
    const notesAtBeat = byBeat.get(b);
    if (notesAtBeat && notesAtBeat.length > 0) {
      const pcs = notesAtBeat.map(mod12);
      const bassPc = mod12(Math.min(...notesAtBeat));
      lastSymbol = bestChordSymbol(pcs, bassPc);
    }
    symbols.push(lastSymbol);
  }

  let chords = chordsFromBeats(symbols);
  if (chords.length > SONG_LIMITS.sectionChords) {
    const kept = chords.slice(0, SONG_LIMITS.sectionChords);
    const overflow = chords.slice(SONG_LIMITS.sectionChords).reduce((s, c) => s + c.beats, 0);
    kept[kept.length - 1]!.beats += overflow;
    chords = kept;
    warning = (warning ? warning + " " : "") + "코드 변화가 많아 일부는 이전 코드로 합쳐졌습니다.";
  }

  const bpm = Math.min(240, Math.max(40, Math.round(60_000_000 / parsed.microsecondsPerQuarter)));
  const genre = options.genre ?? "pop";
  const donor = generateSong({ genre, bpm, seed: 1 });
  const donorSection = donor.sections[0]!;

  const section: Section = {
    id: "imported",
    name: "가져온 코드",
    bars,
    chords,
    tracks: JSON.parse(JSON.stringify(donorSection.tracks)) as Section["tracks"],
  };

  const song: Song = {
    version: 1,
    meta: {
      title: options.title ?? "가져온 MIDI",
      key: donor.meta.key,
      bpm,
      genre,
      swing: donor.meta.swing,
      humanizeMs: donor.meta.humanizeMs,
    },
    sections: [section],
    arrangement: [section.id],
    mixer: donor.mixer,
  };

  const errors = validateSong(song);
  if (errors.length > 0) return { ok: false, error: `불러온 MIDI로 곡을 만들지 못했습니다: ${errors[0]}` };

  return warning ? { ok: true, song, warning } : { ok: true, song };
}
