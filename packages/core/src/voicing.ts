// 보이싱: 코드 → 실제 연주할 MIDI 노트. 근음 고정(항상 같은 모양) 대신
// 이전 코드와 가장 가까운 전위를 골라 음이 튀지 않게 이어 준다(voice leading).
import { chordIntervals, mod12, type ParsedChord } from "./theory";

/** 베이스 음역의 최저음(E1). 베이스는 이 음부터 한 옥타브 안에서 고른다. */
export const BASS_LOW = 28;

export interface VoicingOptions {
  /** 상성부 최저 허용음 (기본 50 = D3) */
  min?: number;
  /** 상성부 최고 허용음 (기본 76 = E5) */
  max?: number;
  /** 화음 무게중심 목표 (기본 62 = D4). 스트링 패드는 높게 잡는다 */
  center?: number;
}

export interface Voicing {
  /** 오름차순 MIDI 노트 (베이스 제외) */
  notes: number[];
  /** 베이스 MIDI 노트 (슬래시 코드면 슬래시 뒤 음) */
  bass: number;
}

const DEFAULTS = { min: 50, max: 76, center: 62 };

export function bassMidi(pc: number): number {
  return BASS_LOW + mod12(pc - BASS_LOW);
}

/**
 * 4음을 넘는 확장 코드를 솎는다. 5도 → 근음(베이스가 연주) → 11도 순으로 뺀다.
 * 3·7음(가이드 톤)과 9·13음(색깔)은 남긴다.
 */
export function thinIntervals(intervals: readonly number[]): number[] {
  const out = [...intervals];
  for (const drop of [7, 0, 17]) {
    if (out.length <= 4) break;
    const i = out.indexOf(drop);
    if (i >= 0) out.splice(i, 1);
  }
  return out;
}

/** 솎은 뒤 상성부가 연주할 피치클래스 (중복 제거, 쌓은 순서). */
export function voicingPitchClasses(chord: ParsedChord): number[] {
  return [...new Set(thinIntervals(chordIntervals(chord)).map((i) => mod12(chord.root + i)))];
}

/** 근음 위치로 그냥 쌓은 보이싱 (비교 기준·기본 모양). low 이상 첫 근음부터 쌓는다. */
export function rootPositionVoicing(chord: ParsedChord, low = 60): number[] {
  const start = low + mod12(chord.root - low);
  return [...new Set(thinIntervals(chordIntervals(chord)))].map((i) => start + i);
}

/** 각 피치클래스를 최저음으로 하는 모든 밀집 배치(한 옥타브 안)를 만든다. */
function candidates(pcs: number[], min: number, max: number): number[][] {
  const out: number[][] = [];
  for (const pc of pcs) {
    for (let low = min; low <= max; low++) {
      if (mod12(low) !== pc) continue;
      const above = pcs
        .filter((p) => p !== pc)
        .map((p) => low + mod12(p - pc))
        .sort((a, b) => a - b);
      const notes = [low, ...above];
      if (notes[notes.length - 1]! <= max) out.push(notes);
    }
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const nearest = (n: number, pool: number[]) => Math.min(...pool.map((p) => Math.abs(n - p)));

function cost(voicing: number[], prev: number[] | undefined, center: number): number {
  let c = Math.abs(avg(voicing) - center) * 0.3;
  if (prev && prev.length > 0) {
    // 새 음마다 가장 가까운 이전 음까지의 거리 + 반대 방향. 공통음은 0이라 자연스럽게 유지된다.
    const move = voicing.reduce((s, n) => s + nearest(n, prev), 0) + prev.reduce((s, p) => s + nearest(p, voicing), 0);
    const topLeap = Math.abs(voicing[voicing.length - 1]! - prev[prev.length - 1]!);
    c += move + topLeap * 0.5;
  }
  return c;
}

/** 코드 하나를 보이싱. prev가 있으면 가장 가까운 배치를 고른다. */
export function voiceChord(chord: ParsedChord, prev?: number[], options: VoicingOptions = {}): Voicing {
  const { min, max, center } = { ...DEFAULTS, ...options };
  const pcs = voicingPitchClasses(chord);

  // 음역이 너무 좁아 후보가 없으면 위로 넓힌다.
  let list = candidates(pcs, min, max);
  for (let widen = 12; list.length === 0 && widen <= 36; widen += 12) list = candidates(pcs, min, max + widen);

  let best = list[0]!;
  let bestCost = Infinity;
  for (const cand of list) {
    const c = cost(cand, prev, center);
    if (c < bestCost) {
      bestCost = c;
      best = cand;
    }
  }
  return { notes: best, bass: bassMidi(chord.bass ?? chord.root) };
}

/** 진행 전체를 보이싱. 앞 코드의 결과를 다음 코드의 prev로 넘긴다. */
export function voiceProgression(chords: ParsedChord[], options: VoicingOptions = {}, prev?: number[]): Voicing[] {
  const result: Voicing[] = [];
  let last = prev;
  for (const chord of chords) {
    const v = voiceChord(chord, last, options);
    result.push(v);
    last = v.notes;
  }
  return result;
}
