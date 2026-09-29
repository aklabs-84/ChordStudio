// 곡 편집용 순수 함수. 원본을 바꾸지 않고 새 Song을 돌려주며, 결과는 항상 validateSong을 통과한다.
// 할 수 없는 편집(잘못된 코드, 범위 밖 박자 등)은 같은 song을 그대로 돌려준다.
import { isValidChord } from "./theory";
import {
  BEATS_PER_BAR,
  SONG_LIMITS,
  STEPS_PER_BAR,
  resolveBarPattern,
  type ChordSlot,
  type DrumLane,
  type PianoStyle,
  type Section,
  type Song,
  type StepPattern,
  validateSong,
} from "./schema";

const MAX_CHORD_BEATS = 16;

function withSection(song: Song, sectionId: string, edit: (s: Section) => Section | null): Song {
  const at = song.sections.findIndex((s) => s.id === sectionId);
  const current = song.sections[at];
  if (!current) return song;
  const next = edit(current);
  if (!next) return song;
  const sections = song.sections.slice();
  sections[at] = next;
  return { ...song, sections };
}

/** 코드 목록을 새 값으로 바꾸고, 박자 합이 마디 단위가 되도록 마지막 코드를 늘린 뒤 마디 수를 다시 센다. */
function withChords(section: Section, chords: ChordSlot[]): Section {
  const sum = chords.reduce((s, c) => s + c.beats, 0);
  const rest = (BEATS_PER_BAR - (sum % BEATS_PER_BAR)) % BEATS_PER_BAR;
  const padded = rest === 0 ? chords : chords.map((c, i) => (i === chords.length - 1 ? { ...c, beats: c.beats + rest } : c));
  return { ...section, chords: padded, bars: (sum + rest) / BEATS_PER_BAR };
}

/** 코드 기호 바꾸기. 해석할 수 없는 기호면 그대로 둔다. */
export function setChordSymbol(song: Song, sectionId: string, index: number, symbol: string): Song {
  const next = symbol.trim();
  if (!isValidChord(next)) return song;
  return withSection(song, sectionId, (s) => {
    const chord = s.chords[index];
    if (!chord || chord.symbol === next) return null;
    return { ...s, chords: s.chords.map((c, i) => (i === index ? { ...c, symbol: next } : c)) };
  });
}

/**
 * 코드 하나의 박자를 delta만큼 늘리거나 줄인다. 섹션 길이는 그대로 두고 옆 코드(마지막이면 앞 코드)가 그만큼 줄거나 는다.
 * 옆 코드가 1박 미만이 되거나 한 코드가 16박을 넘으면 바꾸지 않는다.
 */
export function shiftChordBeats(song: Song, sectionId: string, index: number, delta: number): Song {
  return withSection(song, sectionId, (s) => {
    const neighbor = index < s.chords.length - 1 ? index + 1 : index - 1;
    const a = s.chords[index];
    const b = s.chords[neighbor];
    if (!a || !b || !Number.isInteger(delta) || delta === 0) return null;
    const nextA = a.beats + delta;
    const nextB = b.beats - delta;
    if (nextA < 1 || nextB < 1 || nextA > MAX_CHORD_BEATS || nextB > MAX_CHORD_BEATS) return null;
    return {
      ...s,
      chords: s.chords.map((c, i) => (i === index ? { ...c, beats: nextA } : i === neighbor ? { ...c, beats: nextB } : c)),
    };
  });
}

/** 곡을 키우는 편집이 크기 상한(SONG_LIMITS)을 넘으면 원래 곡을 그대로 돌려준다. */
function capped(before: Song, after: Song): Song {
  return after === before || validateSong(after).length === 0 ? after : before;
}

/** index 뒤에 4박짜리 코드를 넣는다(섹션이 1마디 길어진다). index가 -1이면 맨 앞. 상한을 넘으면 무시한다. */
export function addChord(song: Song, sectionId: string, index: number, symbol: string): Song {
  const next = symbol.trim();
  if (!isValidChord(next)) return song;
  return capped(song, withSection(song, sectionId, (s) => {
    if (index < -1 || index >= s.chords.length) return null;
    const chords = s.chords.slice();
    chords.splice(index + 1, 0, { symbol: next, beats: BEATS_PER_BAR });
    return withChords(s, chords);
  }));
}

/** 코드를 지운다. 박자 합이 마디에 안 맞으면 마지막 코드를 늘려 맞춘다. 마지막 하나는 지울 수 없다. */
export function removeChord(song: Song, sectionId: string, index: number): Song {
  return withSection(song, sectionId, (s) => {
    if (s.chords.length <= 1 || !s.chords[index]) return null;
    return withChords(s, s.chords.filter((_, i) => i !== index));
  });
}

/** 재생 순서에서 index번째 항목을 delta칸(−1 = 앞, +1 = 뒤) 옮긴다. 범위를 벗어나면 그대로 둔다. */
export function moveArrangementItem(song: Song, index: number, delta: number): Song {
  const to = index + delta;
  if (!Number.isInteger(delta) || delta === 0 || index < 0 || index >= song.arrangement.length) return song;
  if (to < 0 || to >= song.arrangement.length) return song;
  const arrangement = song.arrangement.slice();
  const [item] = arrangement.splice(index, 1);
  arrangement.splice(to, 0, item!);
  return { ...song, arrangement };
}

/** 재생 순서에서 항목을 뺀다. 마지막 하나는 뺄 수 없다. */
export function removeArrangementItem(song: Song, index: number): Song {
  if (song.arrangement.length <= 1 || index < 0 || index >= song.arrangement.length) return song;
  return { ...song, arrangement: song.arrangement.filter((_, i) => i !== index) };
}

/** 재생 순서 끝에 섹션을 하나 더한다. 없는 섹션 id나 상한 초과는 무시한다. */
export function appendArrangementItem(song: Song, sectionId: string): Song {
  if (!song.sections.some((s) => s.id === sectionId)) return song;
  return capped(song, { ...song, arrangement: [...song.arrangement, sectionId] });
}

function nextSectionId(song: Song): string {
  let i = song.sections.length + 1;
  let id = `section${i}`;
  while (song.sections.some((s) => s.id === id)) {
    i++;
    id = `section${i}`;
  }
  return id;
}

/** 마지막 섹션을 복사해 새 섹션을 만들고 재생 순서 끝에 붙인다. 이름이 비었거나 상한을 넘으면 무시한다. */
export function addSection(song: Song, name: string): Song {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > SONG_LIMITS.textChars) return song;
  const source = song.sections[song.sections.length - 1];
  if (!source) return song;
  const id = nextSectionId(song);
  const section: Section = { ...structuredClone(source), id, name: trimmed };
  return capped(song, { ...song, sections: [...song.sections, section], arrangement: [...song.arrangement, id] });
}

// ---- 16스텝 패턴 편집 (드럼·피아노·베이스) ----

/** 편집할 패턴 하나: 피아노, 베이스, 또는 드럼의 레인 하나 */
export type PatternRef = { track: "piano" } | { track: "bass" } | { track: "drums"; lane: DrumLane };
/** main = 일반 마디, first = 섹션 첫 마디, last = 섹션 마지막 마디(필인) */
export type PatternScope = "main" | "first" | "last";

/** 스텝 세기 3단계. 0 = 꺼짐, 1 = 보통, 2 = 세게 */
export const STEP_LEVEL_VALUES = [0, 0.6, 1] as const;

/** 저장된 세기(0~1)를 3단계로 본다. 생성기가 만든 미세한 값(예: 0.35)도 소리가 나면 "보통"이다. */
export function stepLevel(velocity: number): 0 | 1 | 2 {
  if (!(velocity > 0)) return 0;
  return velocity < 0.8 ? 1 : 2;
}

function nextLevelValue(velocity: number): number {
  return STEP_LEVEL_VALUES[(stepLevel(velocity) + 1) % STEP_LEVEL_VALUES.length]!;
}

/** 섹션에서 편집 대상 패턴을 찾는다. 아직 없는 드럼 레인은 undefined. */
export function getStepPattern(section: Section, ref: PatternRef): StepPattern | undefined {
  if (ref.track === "piano") return section.tracks.piano.pattern;
  if (ref.track === "bass") return section.tracks.bass.pattern;
  return section.tracks.drums.lanes[ref.lane];
}

/**
 * 화면에 보여줄 16스텝. first/last가 없으면 main을 그대로 보여준다.
 * bars가 1이면(첫 마디 = 마지막 마디) 엔진처럼 last → first → main 순으로 고른다.
 */
export function stepsOf(pattern: StepPattern | undefined, scope: PatternScope, bars?: number): number[] {
  if (pattern && bars === 1 && scope !== "main") return resolveBarPattern(pattern, 0, 1);
  return pattern?.[scope] ?? pattern?.main ?? new Array<number>(STEPS_PER_BAR).fill(0);
}

function withPattern(section: Section, ref: PatternRef, pattern: StepPattern): Section {
  if (ref.track === "piano") return { ...section, tracks: { ...section.tracks, piano: { ...section.tracks.piano, pattern } } };
  if (ref.track === "bass") return { ...section, tracks: { ...section.tracks, bass: { ...section.tracks.bass, pattern } } };
  const drums = { ...section.tracks.drums, lanes: { ...section.tracks.drums.lanes, [ref.lane]: pattern } };
  return { ...section, tracks: { ...section.tracks, drums } };
}

/**
 * 스텝 하나의 세기를 한 단계 올린다(꺼짐 → 보통 → 세게 → 꺼짐).
 * first/last를 처음 고치면 main을 복사해서 만든다. 없던 드럼 레인은 빈 패턴에서 시작한다.
 */
export function cycleStep(song: Song, sectionId: string, ref: PatternRef, scope: PatternScope, step: number): Song {
  if (!Number.isInteger(step) || step < 0 || step >= STEPS_PER_BAR) return song;
  return withSection(song, sectionId, (s) => {
    const pattern = getStepPattern(s, ref) ?? { main: new Array<number>(STEPS_PER_BAR).fill(0) };
    // 1마디 섹션은 첫 마디 = 마지막 마디이고 엔진은 last를 먼저 쓰므로 first 편집도 last에 기록한다
    const target: PatternScope = s.bars === 1 && scope === "first" ? "last" : scope;
    const values = stepsOf(pattern, target, s.bars).slice();
    values[step] = nextLevelValue(values[step]!);
    return withPattern(s, ref, { ...pattern, [target]: values });
  });
}

/** first/last를 지워 main과 같게 되돌린다. main은 지울 수 없다. */
export function clearPatternVariant(song: Song, sectionId: string, ref: PatternRef, scope: "first" | "last"): Song {
  return withSection(song, sectionId, (s) => {
    const pattern = getStepPattern(s, ref);
    if (!pattern || !pattern[scope]) return null;
    const { [scope]: _removed, ...rest } = pattern;
    return withPattern(s, ref, rest);
  });
}

export function setPianoStyle(song: Song, sectionId: string, style: PianoStyle): Song {
  return withSection(song, sectionId, (s) =>
    s.tracks.piano.style === style ? null : { ...s, tracks: { ...s.tracks, piano: { ...s.tracks.piano, style } } },
  );
}

export function setBassApproach(song: Song, sectionId: string, approach: boolean): Song {
  return withSection(song, sectionId, (s) =>
    s.tracks.bass.approach === approach ? null : { ...s, tracks: { ...s.tracks, bass: { ...s.tracks.bass, approach } } },
  );
}

/** 패턴 하나를 그 섹션에서 끄거나 켠다. 칸 값은 그대로 두고 소리만 뺀다. 없는 드럼 레인은 끌 것이 없으니 무시한다. */
export function setPatternMuted(song: Song, sectionId: string, ref: PatternRef, muted: boolean): Song {
  return withSection(song, sectionId, (s) => {
    const pattern = getStepPattern(s, ref);
    if (!pattern || (pattern.muted === true) === muted) return null;
    const { muted: _old, ...rest } = pattern;
    return withPattern(s, ref, muted ? { ...rest, muted: true } : rest);
  });
}

/** 드럼의 모든 레인을 한 번에 끄거나 켠다. */
export function setDrumsMuted(song: Song, sectionId: string, muted: boolean): Song {
  return withSection(song, sectionId, (s) => {
    const lanes = Object.entries(s.tracks.drums.lanes).filter(([, p]) => p && (p.muted === true) !== muted);
    if (lanes.length === 0) return null;
    return lanes.reduce((acc, [lane]) => setPatternMuted({ ...song, sections: [acc] }, sectionId, { track: "drums", lane: lane as DrumLane }, muted).sections[0]!, s);
  });
}

/** 섹션에 스트링 패드를 넣거나 뺀다. */
export function setStringsOn(song: Song, sectionId: string, on: boolean): Song {
  return withSection(song, sectionId, (s) => {
    if ((s.tracks.strings !== undefined) === on) return null;
    const { strings: _old, ...rest } = s.tracks;
    return { ...s, tracks: on ? { ...rest, strings: {} } : rest };
  });
}

// ---- 되돌리기 ----

/** 섹션 하나(코드·패턴)를 original(같은 설정으로 새로 만든 곡)의 같은 섹션으로 되돌린다. 재생 순서·믹서·메타는 그대로. */
export function resetSection(song: Song, original: Song, sectionId: string): Song {
  const source = original.sections.find((s) => s.id === sectionId);
  if (!source) return song;
  return withSection(song, sectionId, (s) => (JSON.stringify(s) === JSON.stringify(source) ? null : structuredClone(source)));
}

/** 이전 곡의 구조(섹션·재생 순서)로 되돌린다. 지금의 메타(BPM 등)와 믹서는 유지한다. */
export function restoreStructure(song: Song, previous: Pick<Song, "sections" | "arrangement">): Song {
  return { ...song, sections: previous.sections, arrangement: previous.arrangement };
}
