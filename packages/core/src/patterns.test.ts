import { describe, expect, it } from "vitest";
import { pat, PRESETS, type Intensity } from "./patterns";
import { GENRES, defaultMixer, validateSong, type Song } from "./schema";

describe("pat", () => {
  it("문자를 세기로 바꾸고 공백은 무시한다", () => {
    expect(pat("X... x... o... g...").main.filter((v) => v > 0)).toEqual([1, 0.75, 0.5, 0.3]);
  });
  it("first/last도 변환한다", () => {
    const p = pat("X... .... .... ....", ".... .... .... xxXX", "X... .... .... ....");
    expect(p.last![15]).toBe(1);
    expect(p.first![0]).toBe(1);
  });
  it("길이가 16이 아니거나 모르는 문자면 에러", () => {
    expect(() => pat("X...")).toThrow(/16글자/);
    expect(() => pat("X... .... .... ...Q")).toThrow(/Q/);
  });
});

/** 프리셋 variant 하나를 담은 최소 곡 (검증용). */
function songWith(genre: (typeof GENRES)[number], tracks: (typeof PRESETS)[typeof genre]["variants"]["low"][number]): Song {
  return {
    version: 1,
    meta: { title: "t", key: "C", bpm: 100, genre, swing: 0, humanizeMs: 0 },
    sections: [{ id: "A", name: "A", bars: 1, chords: [{ symbol: "C", beats: 4 }], tracks }],
    arrangement: ["A"],
    mixer: defaultMixer(),
  };
}

describe("PRESETS", () => {
  it("모든 장르가 low/high 후보를 가진다", () => {
    for (const genre of GENRES) {
      expect(PRESETS[genre].genre).toBe(genre);
      for (const level of ["low", "high"] as Intensity[]) {
        expect(PRESETS[genre].variants[level].length, `${genre}.${level}`).toBeGreaterThan(0);
      }
    }
  });

  it("모든 variant가 스키마 검증을 통과한다", () => {
    for (const genre of GENRES) {
      for (const level of ["low", "high"] as Intensity[]) {
        PRESETS[genre].variants[level].forEach((tracks, i) => {
          expect(validateSong(songWith(genre, tracks)), `${genre}.${level}[${i}]`).toEqual([]);
        });
      }
    }
  });

  it("벌스보다 코러스가 더 꽉 찬다 (드럼 타수 합계)", () => {
    const hits = (t: (typeof PRESETS)["pop"]["variants"]["low"][number]) =>
      Object.values(t.drums.lanes).reduce((s, p) => s + p!.main.filter((v) => v > 0).length, 0);
    for (const genre of GENRES) {
      const avg = (level: Intensity) => {
        const list = PRESETS[genre].variants[level];
        return list.reduce((s, t) => s + hits(t), 0) / list.length;
      };
      // 재즈는 리듬 밀도보다 앙상블 활동성이 늘어나므로 같거나 많으면 된다
      expect(avg("high"), genre).toBeGreaterThanOrEqual(avg("low"));
    }
  });

  it("장르 성격: 스윙/템포 범위", () => {
    expect(PRESETS.pop.swing).toBe(0);
    expect(PRESETS.rock.swing).toBe(0);
    expect(PRESETS.lofi.swing).toBeGreaterThan(0);
    expect(PRESETS.jazz.swing).toBeGreaterThan(PRESETS.lofi.swing);
    expect(PRESETS.lofi.bpm[1]).toBeLessThan(PRESETS.rock.bpm[0]);
    for (const g of GENRES) expect(PRESETS[g].bpm[0]).toBeLessThan(PRESETS[g].bpm[1]);
  });

  it("코러스에는 첫 박 크래시가 있다 (록·팝)", () => {
    for (const genre of ["pop", "rock"] as const) {
      for (const t of PRESETS[genre].variants.high) {
        expect(t.drums.lanes.crash?.first?.[0], genre).toBe(1);
      }
    }
  });

  it("마지막 마디에는 필인이 있다 (드럼 last가 main과 다른 레인이 있음)", () => {
    for (const genre of GENRES) {
      for (const level of ["low", "high"] as Intensity[]) {
        for (const t of PRESETS[genre].variants[level]) {
          const hasFill = Object.values(t.drums.lanes).some(
            (p) => p!.last && p!.last.join() !== p!.main.join(),
          );
          expect(hasFill, `${genre}.${level}`).toBe(true);
        }
      }
    }
  });
});
