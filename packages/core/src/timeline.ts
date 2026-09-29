// 재생 위치(박) → 지금 어떤 섹션의 몇 번째 코드인지. UI가 "연주 중인 코드"를 표시할 때 쓴다.
import { BEATS_PER_BAR, STEPS_PER_BAR, type Song } from "./schema";

export interface Playhead {
  /** arrangement 안의 순서 (0부터) */
  arrangementIndex: number;
  sectionId: string;
  /** 섹션 안 코드 순서 (0부터) */
  chordIndex: number;
  /** 섹션 안 마디 (0부터) */
  bar: number;
  /** 마디 안 16분음표 칸 (0~15) */
  step: number;
}

/** beat 위치의 Playhead. 곡 범위 밖이면 null. */
export function locate(song: Song, beat: number): Playhead | null {
  if (!(beat >= 0)) return null;
  let start = 0;
  for (let i = 0; i < song.arrangement.length; i++) {
    const section = song.sections.find((s) => s.id === song.arrangement[i]);
    if (!section) continue;
    const length = section.bars * BEATS_PER_BAR;
    if (beat < start + length) {
      const inSection = beat - start;
      let at = 0;
      for (let c = 0; c < section.chords.length; c++) {
        at += section.chords[c]!.beats;
        if (inSection < at) {
          return { arrangementIndex: i, sectionId: section.id, chordIndex: c, bar: Math.floor(inSection / BEATS_PER_BAR), step: Math.floor(((inSection % BEATS_PER_BAR) / BEATS_PER_BAR) * STEPS_PER_BAR) };
        }
      }
      return null;
    }
    start += length;
  }
  return null;
}
