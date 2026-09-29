import { describe, expect, it } from "vitest";
import { generateSong } from "./generator";
import { GENRES } from "./schema";
import { LONG_LINK_CHARS, hasShareHash, songFromShareHash, songToShareHash } from "./share";

describe("공유 링크", () => {
  it("곡(믹서 포함)이 링크를 거쳐 그대로 돌아온다", async () => {
    const song = { ...generateSong({ genre: "jazz", seed: 5 }) };
    song.mixer = { ...song.mixer, strings: { volume: -20, mute: true, solo: false } };
    const hash = await songToShareHash(song);
    expect(hash).toMatch(/^s=[A-Za-z0-9_-]+$/);
    expect(hasShareHash("#" + hash)).toBe(true);
    const r = await songFromShareHash("#" + hash);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.song).toEqual(song);
  });

  it("모든 장르의 링크가 너무 길지 않다", async () => {
    for (const genre of GENRES) {
      const hash = await songToShareHash(generateSong({ genre, seed: 7 }));
      expect(hash.length).toBeLessThan(LONG_LINK_CHARS);
    }
  });

  it("잘리거나 엉뚱한 링크는 예외 없이 실패한다", async () => {
    const hash = await songToShareHash(generateSong({ genre: "pop", seed: 1 }));
    expect((await songFromShareHash("#" + hash.slice(0, hash.length / 2))).ok).toBe(false);
    expect((await songFromShareHash("#s=!!!")).ok).toBe(false);
    expect((await songFromShareHash("#s=")).ok).toBe(false);
    expect((await songFromShareHash("#other")).ok).toBe(false);
  });
});
