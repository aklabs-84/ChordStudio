// 음악 이론: 코드 기호 파싱, 구성음 계산, 전조. React/Tone.js 의존 없음.

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;
const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 코드 성질(canonical) → 근음 기준 반음 간격. 9도 이상은 옥타브 위(14 = 9th). */
export const CHORD_INTERVALS = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "5": [0, 7],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  "7sus4": [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  "9": [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  "11": [0, 4, 7, 10, 14, 17],
  m11: [0, 3, 7, 10, 14, 17],
  "13": [0, 4, 7, 10, 14, 17, 21],
  "7b9": [0, 4, 7, 10, 13],
  "7#9": [0, 4, 7, 10, 15],
} as const satisfies Record<string, readonly number[]>;

export type ChordQuality = keyof typeof CHORD_INTERVALS;

/** 입력 표기 → canonical 성질. canonical 이름 자체도 포함한다. */
const QUALITY_ALIASES: Record<string, ChordQuality> = {
  ...(Object.fromEntries(Object.keys(CHORD_INTERVALS).map((q) => [q, q])) as Record<string, ChordQuality>),
  maj: "",
  M: "",
  min: "m",
  "-": "m",
  "+": "aug",
  sus: "sus4",
  Maj7: "maj7",
  M7: "maj7",
  "Δ": "maj7",
  "Δ7": "maj7",
  min7: "m7",
  "-7": "m7",
  "°": "dim",
  "°7": "dim7",
  "ø": "m7b5",
  "ø7": "m7b5",
  "m7-5": "m7b5",
  "m7♭5": "m7b5",
  "mM7": "mMaj7",
  Maj9: "maj9",
  M9: "maj9",
};

export interface ParsedChord {
  /** 근음 피치클래스 0~11 (C=0) */
  root: number;
  quality: ChordQuality;
  /** 슬래시 코드의 베이스 피치클래스 (없으면 undefined) */
  bass?: number;
}

export class ChordParseError extends Error {
  constructor(public readonly symbol: string) {
    super(`알 수 없는 코드 기호: "${symbol}"`);
    this.name = "ChordParseError";
  }
}

/** "C#", "Bb", "F♯" 같은 음 이름 → 피치클래스. 잘못된 입력이면 null. */
export function parseNoteName(name: string): number | null {
  const m = /^([A-G])([#b♯♭]?)$/.exec(name.trim());
  if (!m) return null;
  const base = NATURAL_PC[m[1]!]!;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return mod12(base + acc);
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function pcName(pc: number, useFlats = false): string {
  return (useFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)]!;
}

/** "Cmaj7", "F#m7b5", "C/E", "Bb" 파싱. 실패하면 ChordParseError. */
export function parseChord(symbol: string): ParsedChord {
  const text = symbol.trim();
  const m = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/.exec(text);
  if (!m) throw new ChordParseError(symbol);
  const root = parseNoteName(m[1]!);
  const quality = QUALITY_ALIASES[m[2]!];
  if (root === null || quality === undefined) throw new ChordParseError(symbol);
  let bass: number | undefined;
  if (m[3]) {
    const b = parseNoteName(m[3]);
    if (b === null) throw new ChordParseError(symbol);
    bass = b;
  }
  return bass === undefined ? { root, quality } : { root, quality, bass };
}

export function isValidChord(symbol: string): boolean {
  try {
    parseChord(symbol);
    return true;
  } catch {
    return false;
  }
}

/** 근음 기준 반음 간격 (9도 이상은 12 이상 값). */
export function chordIntervals(chord: ParsedChord): readonly number[] {
  return CHORD_INTERVALS[chord.quality];
}

/** 구성음의 피치클래스(중복 제거, 근음부터 쌓은 순서). 슬래시 베이스가 구성음 밖이면 맨 앞에 추가. */
export function chordPitchClasses(chord: ParsedChord): number[] {
  const pcs = [...new Set(chordIntervals(chord).map((i) => mod12(chord.root + i)))];
  if (chord.bass !== undefined && !pcs.includes(chord.bass)) pcs.unshift(chord.bass);
  return pcs;
}

/** 코드 기호 → 미리듣기용 MIDI 노트 배열 (근음이 baseOctave에 놓이는 block-chord 보이싱). */
export function chordToMidiNotes(symbol: string, baseOctave = 4): number[] {
  const chord = parseChord(symbol);
  const rootMidi = (baseOctave + 1) * 12 + chord.root;
  const notes = [...new Set(chordIntervals(chord).map((iv) => rootMidi + iv))];
  if (chord.bass !== undefined) notes.unshift(baseOctave * 12 + chord.bass);
  return notes;
}

/** 파싱된 코드 → canonical 기호. */
export function formatChord(chord: ParsedChord, useFlats = false): string {
  const base = pcName(chord.root, useFlats) + chord.quality;
  return chord.bass === undefined ? base : `${base}/${pcName(chord.bass, useFlats)}`;
}

export function transposeChord(chord: ParsedChord, semitones: number): ParsedChord {
  const root = mod12(chord.root + semitones);
  return chord.bass === undefined
    ? { root, quality: chord.quality }
    : { root, quality: chord.quality, bass: mod12(chord.bass + semitones) };
}

/** 조성 기호("F", "Bb", "Dm", "F#m")가 플랫 표기를 쓰는 조인지. */
export function keyUsesFlats(key: string): boolean {
  const minor = /m$/.test(key) && !/^[A-G][#b]?$/.test(key);
  const tonic = parseNoteName(minor ? key.slice(0, -1) : key);
  if (tonic === null) throw new ChordParseError(key);
  // 플랫 조성: 장조 F Bb Eb Ab Db Gb / 단조 Dm Gm Cm Fm Bbm Ebm
  // 으뜸음을 #/b로 적었으면 그 표기를 따르고(F# vs Gb), 아니면 조표로 판단한다.
  if (/^[A-G][b♭]/.test(key)) return true;
  if (/^[A-G][#♯]/.test(key)) return false;
  const flatMajor = [5, 10, 3, 8, 1, 6];
  const relativeMajor = minor ? mod12(tonic + 3) : tonic;
  return flatMajor.includes(relativeMajor);
}

/** 코드 기호를 반음 단위로 전조. useFlats 미지정 시 입력 기호의 임시표(b)를 따른다. */
export function transposeSymbol(symbol: string, semitones: number, useFlats?: boolean): string {
  const chord = parseChord(symbol);
  const flats = useFlats ?? /^[A-G][b♭]|\/[A-G][b♭]/.test(symbol.trim());
  return formatChord(transposeChord(chord, semitones), flats);
}

/** fromKey → toKey 로 전조하는 반음 수 (-5~+6 범위로 정규화). */
export function semitonesBetweenKeys(fromKey: string, toKey: string): number {
  const strip = (k: string) => parseNoteName(/m$/.test(k) && !/^[A-G][#b]?$/.test(k) ? k.slice(0, -1) : k);
  const a = strip(fromKey);
  const b = strip(toKey);
  if (a === null) throw new ChordParseError(fromKey);
  if (b === null) throw new ChordParseError(toKey);
  const d = mod12(b - a);
  return d > 6 ? d - 12 : d;
}
