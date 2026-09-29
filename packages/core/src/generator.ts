// 곡 생성기: 장르·조성·시드를 받아 Song을 만든다. 같은 입력이면 항상 같은 곡(결정적).
import { getPreset, type Intensity, type SectionTracks } from "./patterns";
import { degreesToChords, modeOf, templatesFor, type Mode } from "./progressions";
import { BEATS_PER_BAR, defaultMixer, type ChordSlot, type Genre, type Section, type Song } from "./schema";

/** 작은 시드 난수 생성기 (mulberry32). 0 이상 1 미만. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
/** 벌스→코러스로 넘어가는 긴장감을 주는 공용 4마디 전환 진행 (장르 진행표와 별개로 조성 모드만으로 결정). */
const PRE_CHORUS_DEGREES: Record<Mode, string[]> = {
  major: ["IV", "V", "vi", "V7"],
  minor: ["iv", "bVI", "V7", "V7"],
};
/** 시드가 정해 주는 조성이 단조일 확률 (장르 상관없이 장조가 더 흔하다) */
const MINOR_CHANCE = 0.25;

export interface GenerateOptions {
  genre: Genre;
  /** 생략하면 시드로 고른다. "Am"처럼 단조 표기 가능 */
  key?: string;
  /** key가 없을 때만 의미: 장/단조 강제 */
  mode?: Mode;
  /** 생략하면 장르 범위에서 시드로 고른다 */
  bpm?: number;
  seed?: number;
  /** 재생 순서 (섹션 id "A"=벌스, "B"=코러스). 기본 A B A B */
  arrangement?: string[];
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  const item = list[Math.floor(rng() * list.length)];
  if (item === undefined) throw new Error("빈 목록에서 고를 수 없습니다");
  return item;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function barsOf(chords: ChordSlot[]): number {
  return Math.ceil(chords.reduce((s, c) => s + c.beats, 0) / BEATS_PER_BAR);
}

/** 코드 박자 합이 마디 단위로 딱 떨어지지 않으면 마지막 코드를 늘려 맞춘다. */
function padToBars(chords: ChordSlot[]): ChordSlot[] {
  const beats = chords.reduce((s, c) => s + c.beats, 0);
  const rest = barsOf(chords) * BEATS_PER_BAR - beats;
  if (rest === 0) return chords;
  const out = chords.map((c) => ({ ...c }));
  out[out.length - 1]!.beats += rest;
  return out;
}

function makeSection(
  id: string,
  name: string,
  degrees: string[],
  key: string,
  tracks: SectionTracks,
): Section {
  const chords = padToBars(degreesToChords(degrees, key));
  return { id, name, bars: barsOf(chords), chords, tracks: clone(tracks) };
}

export function generateSong(options: GenerateOptions): Song {
  const seed = options.seed ?? Math.floor(Math.random() * 0x7fffffff);
  const rng = mulberry32(seed);
  const preset = getPreset(options.genre);

  // 조성: 호출자가 준 값 우선, 없으면 시드로 (항상 같은 순서로 난수를 소비해 재현성을 지킨다)
  const drawnMode: Mode = rng() < MINOR_CHANCE ? "minor" : "major";
  const drawnKey = pick(rng, (options.mode ?? drawnMode) === "minor" ? MINOR_KEYS : MAJOR_KEYS);
  const key = options.key ?? drawnKey;
  const mode = modeOf(key);

  const template = pick(rng, templatesFor(options.genre, mode));
  const pickTracks = (level: Intensity) => pick(rng, preset.variants[level]);
  const bpmDrawn = preset.bpm[0] + Math.floor(rng() * (preset.bpm[1] - preset.bpm[0] + 1));
  const bpm = options.bpm ?? bpmDrawn;

  // 인트로/아웃트로는 코러스 진행 앞·뒷절반을 가져와 곡 전체와 조화를 이루게 하되, 조용한(low) 트랙으로 시작·마무리한다.
  const half = Math.ceil(template.B.length / 2);
  const sections = [
    makeSection("A", "벌스", template.A, key, pickTracks("low")),
    makeSection("B", "코러스", template.B, key, pickTracks("high")),
    makeSection("Intro", "인트로", template.B.slice(0, half), key, pickTracks("low")),
    makeSection("PreChorus", "프리코러스", PRE_CHORUS_DEGREES[mode], key, pickTracks("low")),
    makeSection("Outro", "아웃트로", template.B.slice(half), key, pickTracks("low")),
  ];

  return {
    version: 1,
    meta: {
      title: `${preset.label} ${key} · ${template.name}`,
      key,
      bpm,
      genre: options.genre,
      swing: preset.swing,
      humanizeMs: preset.humanizeMs,
      seed,
    },
    sections,
    arrangement: options.arrangement ?? ["Intro", "A", "PreChorus", "B", "Outro"],
    mixer: defaultMixer(),
  };
}
