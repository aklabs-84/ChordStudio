import { describe, expect, it } from "vitest";
import { defaultMixer, resolveBarPattern, totalBars, validateSong, type Song } from "./schema";

const bar = (...hits: number[]) => Array.from({ length: 16 }, (_, i) => (hits.includes(i) ? 0.8 : 0));

function makeSong(): Song {
  return {
    version: 1,
    meta: { title: "테스트", key: "C", bpm: 100, genre: "pop", swing: 0, humanizeMs: 6, seed: 1 },
    sections: [
      {
        id: "A",
        name: "Verse",
        bars: 4,
        chords: [
          { symbol: "C", beats: 4 },
          { symbol: "G/B", beats: 4 },
          { symbol: "Am7", beats: 4 },
          { symbol: "F", beats: 2 },
          { symbol: "G7", beats: 2 },
        ],
        tracks: {
          piano: { style: "chord", pattern: { main: bar(0, 6, 10) } },
          bass: { approach: true, pattern: { main: bar(0, 8), last: bar(0, 8, 14) } },
          drums: { lanes: { kick: { main: bar(0, 8) }, snare: { main: bar(4, 12) } } },
        },
      },
      {
        id: "B",
        name: "Chorus",
        bars: 2,
        chords: [
          { symbol: "F", beats: 4 },
          { symbol: "G", beats: 4 },
        ],
        tracks: {
          piano: { style: "arp-up", pattern: { main: bar(0, 4, 8, 12) } },
          bass: { approach: false, pattern: { main: bar(0) } },
          drums: { lanes: { kick: { main: bar(0) } } },
        },
      },
    ],
    arrangement: ["A", "B", "A", "B"],
    mixer: defaultMixer(),
  };
}

describe("resolveBarPattern", () => {
  const main = bar(0);
  const first = bar(1);
  const last = bar(2);

  it("첫 마디는 first, 마지막 마디는 last, 나머지는 main", () => {
    const p = { main, first, last };
    expect(resolveBarPattern(p, 0, 4)).toBe(first);
    expect(resolveBarPattern(p, 1, 4)).toBe(main);
    expect(resolveBarPattern(p, 3, 4)).toBe(last);
  });
  it("first/last가 없으면 main", () => {
    expect(resolveBarPattern({ main }, 0, 4)).toBe(main);
    expect(resolveBarPattern({ main }, 3, 4)).toBe(main);
  });
  it("1마디 섹션에서 겹치면 last가 우선", () => {
    expect(resolveBarPattern({ main, first, last }, 0, 1)).toBe(last);
    expect(resolveBarPattern({ main, first }, 0, 1)).toBe(first);
  });
});

describe("validateSong", () => {
  it("올바른 곡은 오류가 없다", () => {
    expect(validateSong(makeSong())).toEqual([]);
  });

  it("섹션마다 마디 수가 달라도(가변 길이) 유효하다", () => {
    const song = makeSong();
    expect(song.sections.map((s) => s.bars)).toEqual([4, 2]);
    expect(totalBars(song)).toBe(12);
  });

  it("코드 박자 합이 마디 수와 다르면 오류", () => {
    const song = makeSong();
    song.sections[0]!.chords[0]!.beats = 3;
    expect(validateSong(song).join("\n")).toMatch(/박자 합/);
  });

  it("해석할 수 없는 코드를 찾아낸다", () => {
    const song = makeSong();
    song.sections[1]!.chords[0]!.symbol = "Hmaj7";
    expect(validateSong(song).join("\n")).toMatch(/Hmaj7/);
  });

  it("패턴 길이/세기 범위를 검사한다", () => {
    const song = makeSong();
    song.sections[0]!.tracks.piano.pattern.main = [1, 0, 1];
    song.sections[0]!.tracks.bass.pattern.last = bar(0).map((v) => v + 2);
    const msg = validateSong(song).join("\n");
    expect(msg).toMatch(/스텝은 16개/);
    expect(msg).toMatch(/0~1 범위/);
  });

  it("arrangement가 없는 섹션을 가리키면 오류", () => {
    const song = makeSong();
    song.arrangement.push("Z");
    expect(validateSong(song).join("\n")).toMatch(/"Z"/);
  });

  it("섹션 id 중복, bpm 범위, 조성 형식을 검사한다", () => {
    const song = makeSong();
    song.sections[1]!.id = "A";
    song.meta.bpm = 500;
    song.meta.key = "H";
    const msg = validateSong(song).join("\n");
    expect(msg).toMatch(/중복/);
    expect(msg).toMatch(/bpm/);
    expect(msg).toMatch(/meta.key/);
  });

  it("first 패턴도 길이를 검사한다", () => {
    const song = makeSong();
    song.sections[0]!.tracks.drums.lanes.kick = { main: bar(0), first: [1, 0] };
    expect(validateSong(song).join("\n")).toMatch(/kick\.first/);
  });

  it("JSON 왕복 후에도 유효하다 (저장/공유용)", () => {
    const restored = JSON.parse(JSON.stringify(makeSong())) as Song;
    expect(validateSong(restored)).toEqual([]);
  });
});

describe("validateSong: 외부에서 온 곡 방어", () => {
  const bad = (edit: (s: Song) => void) => {
    const s = structuredClone(makeSong());
    edit(s);
    return validateSong(s);
  };

  it("정상 곡은 통과한다", () => {
    expect(validateSong(makeSong())).toEqual([]);
  });

  it("너무 큰 곡을 거부한다 (마디·코드·순서 상한)", () => {
    expect(bad((s) => { s.sections[0]!.bars = 10_000_000; s.sections[0]!.chords = [{ symbol: "C", beats: 40_000_000 }]; })).not.toEqual([]);
    expect(bad((s) => { s.arrangement = Array.from({ length: 300_000 }, () => "A"); })).not.toEqual([]);
    expect(bad((s) => { s.sections[0]!.chords = Array.from({ length: 65 }, () => ({ symbol: "C", beats: 0.5 })); s.sections[0]!.bars = 9; })).not.toEqual([]);
  });

  it("곡 전체 마디 수 상한을 넘으면 거부한다", () => {
    const errors = bad((s) => { s.sections[0]!.bars = 64; s.sections[0]!.chords = [{ symbol: "C", beats: 256 }]; s.arrangement = Array.from({ length: 9 }, () => "A"); });
    expect(errors.some((e) => e.includes("512"))).toBe(true);
  });

  it("패턴·main이 없거나 잘못된 곡을 예외 없이 거부한다", () => {
    expect(bad((s) => { delete (s.sections[0]!.tracks.piano as { pattern?: unknown }).pattern; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]!.tracks.bass as { pattern: unknown }).pattern = {}; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]!.tracks.drums.lanes as Record<string, unknown>).kick = {}; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]! as { tracks: unknown }).tracks = null; })).not.toEqual([]);
    expect(validateSong(null as unknown as Song)).not.toEqual([]);
    expect(validateSong({} as Song)).not.toEqual([]);
  });

  it("타입이 틀린 필드를 거부한다 (title·seed·name·style·approach)", () => {
    expect(bad((s) => { (s.meta as { title: unknown }).title = {}; })).not.toEqual([]);
    expect(bad((s) => { (s.meta as { seed: unknown }).seed = "abc"; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]! as { name: unknown }).name = { x: 1 }; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]!.tracks.piano as { style: unknown }).style = "weird"; })).not.toEqual([]);
    expect(bad((s) => { (s.sections[0]!.tracks.bass as { approach: unknown }).approach = "yes"; })).not.toEqual([]);
  });
});
