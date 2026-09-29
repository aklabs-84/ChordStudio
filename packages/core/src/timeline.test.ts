import { describe, expect, it } from "vitest";
import { generateSong } from "./generator";
import { locate } from "./timeline";
import { totalBars } from "./schema";

describe("locate", () => {
  const song = generateSong({ genre: "pop", seed: 1 });
  const [A, B] = song.sections;
  const aBeats = A!.bars * 4;
  const bBeats = B!.bars * 4;

  it("곡 처음은 첫 섹션의 첫 코드", () => {
    expect(locate(song, 0)).toEqual({ arrangementIndex: 0, sectionId: "A", chordIndex: 0, bar: 0, step: 0 });
  });

  it("코드 경계에서 다음 코드로 넘어간다", () => {
    expect(locate(song, 3.99)!.chordIndex).toBe(0);
    expect(locate(song, 4)!.chordIndex).toBe(1);
    expect(locate(song, 4)!.bar).toBe(1);
  });

  it("2박짜리 코드가 있는 섹션도 정확하다", () => {
    let at = 0;
    A!.chords.forEach((c, i) => {
      expect(locate(song, at)!.chordIndex).toBe(i);
      expect(locate(song, at + c.beats - 0.01)!.chordIndex).toBe(i);
      at += c.beats;
    });
  });

  it("섹션 경계에서 다음 섹션 (arrangementIndex 증가), 반복 섹션은 다시 A", () => {
    expect(locate(song, aBeats)).toMatchObject({ arrangementIndex: 1, sectionId: "B", chordIndex: 0 });
    expect(locate(song, aBeats + bBeats)).toMatchObject({ arrangementIndex: 2, sectionId: "A", chordIndex: 0 });
  });

  it("곡 밖(음수, 끝 이후, NaN)은 null", () => {
    expect(locate(song, -1)).toBeNull();
    expect(locate(song, totalBars(song) * 4)).toBeNull();
    expect(locate(song, NaN)).toBeNull();
  });

  it("마디 안 16분음표 칸을 알려준다", () => {
    expect(locate(song, 1)!.step).toBe(4);
    expect(locate(song, 2.5)!.step).toBe(10);
    expect(locate(song, 4)!.step).toBe(0);
  });
});
