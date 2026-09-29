import { describe, expect, it } from "vitest";
import { generateSong, mulberry32 } from "./generator";
import { PRESETS } from "./patterns";
import { GENRES, validateSong } from "./schema";

describe("mulberry32", () => {
  it("같은 시드는 같은 수열, 값은 [0,1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("다른 시드는 다른 수열", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("generateSong", () => {
  it("같은 시드·설정이면 완전히 같은 곡", () => {
    for (const genre of GENRES) {
      expect(generateSong({ genre, seed: 7 })).toEqual(generateSong({ genre, seed: 7 }));
    }
  });

  it("시드가 다르면 곡이 다양하게 나온다", () => {
    const titles = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) titles.add(generateSong({ genre: "pop", seed }).meta.title);
    expect(titles.size).toBeGreaterThan(5);
  });

  it("모든 장르 × 많은 시드에서 검증을 통과하고 JSON 왕복이 된다", () => {
    for (const genre of GENRES) {
      for (let seed = 1; seed <= 60; seed++) {
        const song = generateSong({ genre, seed });
        expect(validateSong(song), `${genre} seed=${seed}`).toEqual([]);
        expect(validateSong(JSON.parse(JSON.stringify(song)))).toEqual([]);
      }
    }
  });

  it("BPM·스윙이 장르 프리셋을 따른다", () => {
    for (const genre of GENRES) {
      const [lo, hi] = PRESETS[genre].bpm;
      for (let seed = 1; seed <= 30; seed++) {
        const { meta } = generateSong({ genre, seed });
        expect(meta.bpm).toBeGreaterThanOrEqual(lo);
        expect(meta.bpm).toBeLessThanOrEqual(hi);
        expect(meta.swing).toBe(PRESETS[genre].swing);
      }
    }
  });

  it("key/bpm을 지정하면 그대로 쓴다 (단조 포함)", () => {
    const major = generateSong({ genre: "pop", key: "G", bpm: 100, seed: 3 });
    expect(major.meta.key).toBe("G");
    expect(major.meta.bpm).toBe(100);
    const minor = generateSong({ genre: "rock", key: "Em", seed: 3 });
    expect(minor.meta.key).toBe("Em");
    expect(validateSong(minor)).toEqual([]);
  });

  it("mode를 지정하면 그 모드의 조성을 고른다", () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(generateSong({ genre: "lofi", mode: "minor", seed }).meta.key.endsWith("m")).toBe(true);
      expect(generateSong({ genre: "lofi", mode: "major", seed }).meta.key.endsWith("m")).toBe(false);
    }
  });

  it("인트로·벌스·프리코러스·코러스·아웃트로 다섯 섹션, 기본 재생 순서도 그 순서", () => {
    const song = generateSong({ genre: "pop", seed: 1 });
    expect(song.sections.map((s) => s.id)).toEqual(["A", "B", "Intro", "PreChorus", "Outro"]);
    expect(song.arrangement).toEqual(["Intro", "A", "PreChorus", "B", "Outro"]);
    expect(validateSong(song)).toEqual([]);
  });

  it("arrangement를 바꿀 수 있다", () => {
    const song = generateSong({ genre: "pop", seed: 1, arrangement: ["A", "A", "B"] });
    expect(song.arrangement).toEqual(["A", "A", "B"]);
    expect(validateSong(song)).toEqual([]);
  });

  it("섹션의 트랙은 프리셋과 별개 사본이다 (수정해도 프리셋이 안 바뀐다)", () => {
    const song = generateSong({ genre: "pop", seed: 1 });
    const before = JSON.stringify(PRESETS.pop);
    song.sections[0]!.tracks.piano.pattern.main[0] = 0.123;
    expect(JSON.stringify(PRESETS.pop)).toBe(before);
  });

  it("시드를 생략하면 결과 곡에 시드가 기록되어 재현할 수 있다", () => {
    const song = generateSong({ genre: "jazz" });
    expect(song.meta.seed).toBeTypeOf("number");
    expect(generateSong({ genre: "jazz", seed: song.meta.seed! })).toEqual(song);
  });
});
