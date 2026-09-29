// 진행 템플릿: 조성에 독립적인 도수(로마 숫자)로 적고, 조성이 정해지면 코드 기호로 바꾼다.
// 도수 표기: 으뜸음(장조든 단조든)을 I로 보고 b/#로 반음 이동. 대문자=장, 소문자=단.
//   "I" "V7" "vi" "ii7" "IVmaj7" "bVII" "iim7b5" "Vsus4" — 뒤에 ":2"를 붙이면 2박(기본 4박).
import type { ChordSlot, Genre } from "./schema";
import { BEATS_PER_BAR } from "./schema";
import { keyUsesFlats, mod12, parseChord, parseNoteName, pcName } from "./theory";

export type Mode = "major" | "minor";

export interface ProgressionTemplate {
  id: string;
  name: string;
  genre: Genre;
  mode: Mode;
  /** 벌스 진행 */
  A: string[];
  /** 코러스 진행 */
  B: string[];
}

const DEGREE_OFFSET: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
const DEGREE_RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;

/** 조성 기호("C", "Bb", "Am")의 으뜸음 피치클래스. */
export function tonicOf(key: string): number {
  const minor = /^[A-G][#b]?m$/.test(key);
  const pc = parseNoteName(minor ? key.slice(0, -1) : key);
  if (pc === null) throw new Error(`알 수 없는 조성: ${key}`);
  return pc;
}

export function modeOf(key: string): Mode {
  return /^[A-G][#b]?m$/.test(key) ? "minor" : "major";
}

/** 도수 하나를 코드 슬롯으로. 결과 기호는 항상 parseChord로 검증한다. */
export function degreeToChordSlot(degree: string, key: string): ChordSlot {
  const [name, beatsText] = degree.split(":") as [string, string | undefined];
  const m = DEGREE_RE.exec(name);
  if (!m) throw new Error(`알 수 없는 도수: "${degree}"`);
  const accidental = m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0;
  const roman = m[2]!;
  const suffix = m[3]!;
  const lower = roman === roman.toLowerCase();
  // 소문자면 단조 성질을 붙인다. 접미사가 이미 단조/감화음(m7b5, dim)이면 중복하지 않는다.
  const quality = lower && !/^(m|dim)/.test(suffix) ? `m${suffix}` : suffix;
  const root = mod12(tonicOf(key) + DEGREE_OFFSET[roman.toUpperCase()]! + accidental);
  const symbol = pcName(root, keyUsesFlats(key)) + quality;
  parseChord(symbol); // 잘못된 조합이면 여기서 에러
  const beats = beatsText === undefined ? BEATS_PER_BAR : Number(beatsText);
  if (!(beats > 0)) throw new Error(`잘못된 박자 수: "${degree}"`);
  return { symbol, beats };
}

export function degreesToChords(degrees: string[], key: string): ChordSlot[] {
  return degrees.map((d) => degreeToChordSlot(d, key));
}

export const PROGRESSIONS: ProgressionTemplate[] = [
  // ── 팝 ──
  {
    id: "pop-axis", name: "축 진행", genre: "pop", mode: "major",
    A: ["I", "V", "vi", "IV", "I", "V", "vi", "IV"],
    B: ["IV", "I", "V", "vi", "IV", "I", "V:2", "V7:2"],
  },
  {
    id: "pop-50s", name: "50년대 진행", genre: "pop", mode: "major",
    A: ["I", "vi", "IV", "V", "I", "vi", "IV", "V"],
    B: ["IV", "V", "iii", "vi", "IV", "V", "Isus4:2", "I:2"],
  },
  {
    id: "pop-ii-v", name: "투파이브 팝", genre: "pop", mode: "major",
    A: ["Imaj7", "vi7", "ii7", "V7", "Imaj7", "vi7", "ii7", "V7"],
    B: ["IVmaj7", "V7", "iii7", "vi7", "IVmaj7", "V7", "Imaj7", "Imaj7"],
  },
  {
    id: "pop-vi-start", name: "vi부터 시작", genre: "pop", mode: "major",
    A: ["vi", "IV", "I", "V", "vi", "IV", "I", "V"],
    B: ["I", "V", "vi", "iii", "IV", "I", "IV", "V"],
  },
  {
    id: "pop-minor", name: "단조 팝", genre: "pop", mode: "minor",
    A: ["i", "bVI", "bIII", "bVII", "i", "bVI", "bIII", "bVII"],
    B: ["bVI", "bVII", "i", "i", "bVI", "bVII", "V7", "V7"],
  },
  // ── 록 ──
  {
    id: "rock-mixolydian", name: "믹솔리디안 록", genre: "rock", mode: "major",
    A: ["I", "bVII", "IV", "I", "I", "bVII", "IV", "IV"],
    B: ["IV", "I", "V", "V", "IV", "I", "V", "V"],
  },
  {
    id: "rock-power", name: "파워 코드 진행", genre: "rock", mode: "major",
    A: ["I", "IV", "V", "V", "I", "IV", "V", "IV"],
    B: ["vi", "IV", "I", "V", "vi", "IV", "V", "V"],
  },
  {
    id: "rock-minor", name: "단조 록", genre: "rock", mode: "minor",
    A: ["i", "bVII", "bVI", "bVII", "i", "bVII", "bVI", "V"],
    B: ["bVI", "bVII", "i", "i", "bVI", "bVII", "iv", "V"],
  },
  // ── 로파이 ──
  {
    id: "lofi-ii-v", name: "로파이 투파이브", genre: "lofi", mode: "major",
    A: ["ii7", "V7", "Imaj7", "vi7", "ii7", "V7", "Imaj7", "Imaj7"],
    B: ["IVmaj7", "iii7", "vi7", "ii7", "IVmaj7", "V7", "iii7", "vi7"],
  },
  {
    id: "lofi-maj9", name: "부드러운 9th", genre: "lofi", mode: "major",
    A: ["Imaj9", "IVmaj7", "iii7", "vi9", "Imaj9", "IVmaj7", "ii9", "V7"],
    B: ["IVmaj7", "V7", "iii7", "vi7", "IVmaj7", "V7", "Imaj7", "Imaj7"],
  },
  {
    id: "lofi-minor", name: "로파이 단조", genre: "lofi", mode: "minor",
    A: ["i7", "bVII", "bVImaj7", "V7", "i7", "bVII", "bVImaj7", "V7"],
    B: ["bVImaj7", "bVII", "i7", "i7", "bVImaj7", "bVII", "iv7", "V7"],
  },
  // ── 재즈 ──
  {
    id: "jazz-ii-v-i", name: "투파이브원", genre: "jazz", mode: "major",
    A: ["ii7", "V7", "Imaj7", "VI7", "ii7", "V7", "Imaj7", "Imaj7"],
    B: ["iii7", "VI7", "ii7", "V7", "iii7", "VI7", "ii7:2", "V7:2"],
  },
  {
    id: "jazz-turnaround", name: "턴어라운드", genre: "jazz", mode: "major",
    A: ["Imaj7:2", "vi7:2", "ii7:2", "V7:2", "iii7:2", "VI7:2", "ii7:2", "V7:2"],
    B: ["Imaj7", "I7", "IVmaj7", "iv7", "iii7", "VI7", "ii7", "V7"],
  },
  {
    id: "jazz-minor", name: "재즈 단조", genre: "jazz", mode: "minor",
    A: ["iim7b5", "V7", "i7", "i7", "iv7", "bVII7", "bIIImaj7", "bVImaj7"],
    B: ["iim7b5", "V7", "i7", "i7", "iim7b5:2", "V7:2", "i7", "V7"],
  },
];

/** 장르·조성 모드에 맞는 템플릿 후보. */
export function templatesFor(genre: Genre, mode: Mode): ProgressionTemplate[] {
  return PROGRESSIONS.filter((t) => t.genre === genre && t.mode === mode);
}
