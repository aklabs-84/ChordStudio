// 장르별 리듬 프리셋 (직접 작성한 초안 — 엔진이 붙은 뒤 귀로 들으며 다듬는다).
// 패턴 표기: 16글자 = 1마디(16분음표). 공백은 무시(4글자=1박 단위로 읽기 편하게).
//   .=쉼  g=고스트(0.3)  o=약(0.5)  x=보통(0.75)  X=강(1.0)
import type { DrumLane, Genre, Section, StepPattern } from "./schema";
import { STEPS_PER_BAR } from "./schema";

const LEVELS: Record<string, number> = { ".": 0, g: 0.3, o: 0.5, x: 0.75, X: 1 };

function steps(text: string): number[] {
  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length !== STEPS_PER_BAR) throw new Error(`패턴은 ${STEPS_PER_BAR}글자여야 합니다: "${text}"`);
  return chars.map((c) => {
    const v = LEVELS[c];
    if (v === undefined) throw new Error(`알 수 없는 패턴 문자 "${c}": "${text}"`);
    return v;
  });
}

/** 문자열 패턴 → StepPattern. */
export function pat(main: string, last?: string, first?: string): StepPattern {
  const out: StepPattern = { main: steps(main) };
  if (last !== undefined) out.last = steps(last);
  if (first !== undefined) out.first = steps(first);
  return out;
}

export type Intensity = "low" | "high";
export type SectionTracks = Section["tracks"];

export interface GenrePreset {
  genre: Genre;
  label: string;
  /** 생성기가 고르는 BPM 범위 [최소, 최대] */
  bpm: [number, number];
  swing: number;
  humanizeMs: number;
  /** 인텐시티별 리듬 후보. low = 벌스(가볍게), high = 코러스(꽉 차게) */
  variants: Record<Intensity, SectionTracks[]>;
}

type DrumSpec = Partial<Record<DrumLane, StepPattern>>;
const drums = (lanes: DrumSpec) => ({ lanes });
const Z = ".... .... .... ....";
/** 코러스 첫 박 크래시 */
const crash = pat(Z, undefined, "X... .... .... ....");

export const PRESETS: Record<Genre, GenrePreset> = {
  pop: {
    genre: "pop",
    label: "팝",
    bpm: [92, 124],
    swing: 0,
    humanizeMs: 6,
    variants: {
      low: [
        {
          piano: { style: "chord", pattern: pat("X... ..o. x... ..o.", "X... ..o. x... o.x.") },
          bass: { approach: true, pattern: pat("X... ..x. x... ..o.", "X... ..x. x... x.x.") },
          drums: drums({
            kick: pat("X... .... ..x. ....", "X... .... ..x. x..."),
            snare: pat(".... X... .... X...", ".... X... ..o. xxXX"),
            hhClosed: pat("X.o. x.o. x.o. x.o."),
          }),
          strings: {},
        },
        {
          piano: { style: "arp-up", pattern: pat("X.x. x.x. x.x. x.x.") },
          bass: { approach: false, pattern: pat("X... .... x... ....", "X... .... x... x.x.") },
          drums: drums({
            kick: pat("X... .... x... ....", "X... .... x... ..x."),
            rim: pat(".... x... .... x..."),
            hhClosed: pat("o... x... o... x..."),
          }),
        },
      ],
      high: [
        {
          piano: { style: "chord", pattern: pat("X..x ..x. x..x ..x.", "X..x ..x. x... x.x.") },
          bass: { approach: true, pattern: pat("X.x. x.x. x.x. x.x.", "X.x. x.x. x.x. xxx.") },
          drums: drums({
            kick: pat("X... ..x. x... ..x.", "X... ..x. x... x.x."),
            snare: pat(".... X... .... X...", ".... X... ..x. xxXX"),
            hhClosed: pat("X.o. x.o. x.o. x.o."),
            hhOpen: pat(".... .... .... ..o."),
            crash,
          }),
          strings: {},
        },
        {
          piano: { style: "arp-updown", pattern: pat("X.x. x.x. x.x. x.x.") },
          bass: { approach: false, pattern: pat("X... x... X... x...", "X... x... X... xxx.") },
          drums: drums({
            kick: pat("X... x... x... x...", "X... x... x... xxxx"),
            snare: pat(".... X... .... X...", ".... X... .... xxXX"),
            hhOpen: pat("..o. ..o. ..o. ..o."),
            crash,
          }),
          strings: {},
        },
      ],
    },
  },

  rock: {
    genre: "rock",
    label: "록",
    bpm: [110, 150],
    swing: 0,
    humanizeMs: 5,
    variants: {
      low: [
        {
          piano: { style: "chord", pattern: pat("X... x... x... x...") },
          bass: { approach: false, pattern: pat("X... x... x... x...", "X... x... x... xxx.") },
          drums: drums({
            kick: pat("X... ..x. x... ....", "X... ..x. x... x..."),
            snare: pat(".... X... .... X...", ".... X... ..x. xxXX"),
            hhClosed: pat("x.x. x.x. x.x. x.x."),
          }),
        },
        {
          piano: { style: "chord", pattern: pat("X... .... x... ....") },
          bass: { approach: false, pattern: pat("X... .... x... ..o.") },
          drums: drums({
            kick: pat("X... .... .... ..x.", "X... .... .... xxXX"),
            snare: pat(".... .... X... ....", ".... .... X... xxXX"),
            hhClosed: pat("x... x... x... x..."),
          }),
        },
      ],
      high: [
        {
          piano: { style: "chord", pattern: pat("X.x. x.x. x.x. x.x.") },
          bass: { approach: false, pattern: pat("X.x. x.x. x.x. x.x.", "X.x. x.x. x.x. xxxx") },
          drums: drums({
            kick: pat("X... ..x. x... ..x.", "X... ..x. x... x.xX"),
            snare: pat(".... X... .... X...", ".... X... ..x. xxXX"),
            ride: pat("x.x. x.x. x.x. x.x."),
            hhOpen: pat("o... .... o... ...."),
            crash,
          }),
        },
      ],
    },
  },

  lofi: {
    genre: "lofi",
    label: "로파이",
    bpm: [68, 88],
    swing: 0.4,
    humanizeMs: 12,
    variants: {
      low: [
        {
          piano: { style: "chord", pattern: pat("X... ..o. ...x ..o.", "X... ..o. ...x ....") },
          bass: { approach: false, pattern: pat("X... ..o. ..x. ....", "X... ..o. ..x. ...x") },
          drums: drums({
            kick: pat("X... ...x ..x. ....", "X... ...x ..x. ..x."),
            snare: pat(".... X..g .... X.g.", ".... X..g ..g. xxXg"),
            hhClosed: pat("x.o. x.o. x.o. x.o."),
          }),
          strings: {},
        },
        {
          piano: { style: "broken", pattern: pat("x... x... x... x...") },
          bass: { approach: false, pattern: pat("X... .... x... ....") },
          drums: drums({
            kick: pat("X... .... ..x. ....", "X... .... ..x. x..."),
            snare: pat(".... X... .... X..."),
            hhClosed: pat("o.o. o.o. o.o. o.o."),
          }),
        },
      ],
      high: [
        {
          piano: { style: "chord", pattern: pat("X... ..x. .x.. ..x.", "X... ..x. .x.. x.x.") },
          bass: { approach: true, pattern: pat("X... ..x. x... ..x.", "X... ..x. x... x.x.") },
          drums: drums({
            kick: pat("X... ..x. ..x. ..o.", "X... ..x. ..x. x.xx"),
            snare: pat(".... X..g .... X.g.", ".... X..g ..g. xxXg"),
            hhClosed: pat("x.o. x.o. x.o. x.oo"),
            hhOpen: pat(".... .... .... ..o."),
          }),
          strings: {},
        },
      ],
    },
  },

  jazz: {
    genre: "jazz",
    label: "재즈",
    bpm: [96, 140],
    swing: 0.65,
    humanizeMs: 10,
    variants: {
      low: [
        {
          piano: { style: "chord", pattern: pat("X... ..x. .... ....", "X... ..x. .... ..x.") },
          bass: { approach: true, pattern: pat("X... x... x... x...") },
          drums: drums({
            ride: pat("x... x.x. x... x.x."),
            hhClosed: pat(".... o... .... o..."),
            kick: pat("o... o... o... o..."),
            snare: pat("..g. .... ...g ....", "..g. .... ..x. x.xx"),
          }),
        },
      ],
      high: [
        {
          piano: { style: "chord", pattern: pat("X.x. ..x. .x.. ..x.", "X.x. ..x. .x.. x.xx") },
          bass: { approach: true, pattern: pat("X... x... x... x...") },
          drums: drums({
            ride: pat("X... x.x. x... x.x."),
            hhClosed: pat(".... o... .... o..."),
            kick: pat("o... o... o... o..."),
            snare: pat("..g. ..g. ...x ..g.", "..g. ..g. ..x. x.xX"),
          }),
        },
      ],
    },
  },
};

export function getPreset(genre: Genre): GenrePreset {
  return PRESETS[genre];
}
