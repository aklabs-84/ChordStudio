import { describe, expect, it } from "vitest";
import { GENRES } from "./schema";
import {
  degreeToChordSlot,
  degreesToChords,
  modeOf,
  PROGRESSIONS,
  templatesFor,
  tonicOf,
} from "./progressions";
import { isValidChord } from "./theory";

const sym = (degree: string, key: string) => degreeToChordSlot(degree, key).symbol;

describe("tonicOf / modeOf", () => {
  it("조성에서 으뜸음과 장/단조를 읽는다", () => {
    expect(tonicOf("C")).toBe(0);
    expect(tonicOf("Bb")).toBe(10);
    expect(tonicOf("F#m")).toBe(6);
    expect(modeOf("Am")).toBe("minor");
    expect(modeOf("G")).toBe("major");
    expect(() => tonicOf("H")).toThrow();
  });
});

describe("degreeToChordSlot", () => {
  it("장조 기본 도수", () => {
    expect(sym("I", "C")).toBe("C");
    expect(sym("vi", "C")).toBe("Am");
    expect(sym("IV", "C")).toBe("F");
    expect(sym("V7", "G")).toBe("D7");
    expect(sym("V", "Bb")).toBe("F");
  });
  it("소문자 도수는 단화음, 접미사와 결합한다", () => {
    expect(sym("ii7", "C")).toBe("Dm7");
    expect(sym("vi9", "C")).toBe("Am9");
    expect(sym("iii7", "C")).toBe("Em7");
  });
  it("m7b5는 m을 중복하지 않는다", () => {
    expect(sym("iim7b5", "Am")).toBe("Bm7b5");
  });
  it("대문자 + 접미사", () => {
    expect(sym("IVmaj7", "C")).toBe("Fmaj7");
    expect(sym("Isus4", "C")).toBe("Csus4");
    expect(sym("VI7", "C")).toBe("A7");
  });
  it("b/# 도수는 조성의 표기(플랫/샤프)를 따른다", () => {
    expect(sym("bVII", "F")).toBe("Eb");
    expect(sym("bVI", "Am")).toBe("F");
    expect(sym("bIII", "Am")).toBe("C");
  });
  it(":N으로 박자 수를 정한다 (기본 4)", () => {
    expect(degreeToChordSlot("I", "C").beats).toBe(4);
    expect(degreeToChordSlot("V7:2", "C").beats).toBe(2);
  });
  it("모르는 도수나 잘못된 박자는 에러", () => {
    expect(() => degreeToChordSlot("X", "C")).toThrow(/도수/);
    expect(() => degreeToChordSlot("I:0", "C")).toThrow(/박자/);
    expect(() => degreeToChordSlot("Izzz", "C")).toThrow();
  });
  it("degreesToChords는 순서를 유지한다", () => {
    expect(degreesToChords(["I", "V", "vi", "IV"], "G").map((c) => c.symbol)).toEqual(["G", "D", "Em", "C"]);
  });
});

describe("PROGRESSIONS", () => {
  it("id가 유일하다", () => {
    const ids = PROGRESSIONS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 장르에 장조 템플릿이 있고, 단조 템플릿도 있다", () => {
    for (const g of GENRES) {
      expect(templatesFor(g, "major").length, `${g} major`).toBeGreaterThan(0);
      expect(templatesFor(g, "minor").length, `${g} minor`).toBeGreaterThan(0);
    }
  });

  it("12개 조성 모두에서 해석되고 박자 합이 마디 단위(4의 배수)다", () => {
    const majors = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    for (const t of PROGRESSIONS) {
      const keys = t.mode === "major" ? majors : majors.map((k) => `${k}m`);
      for (const key of keys) {
        for (const part of ["A", "B"] as const) {
          const chords = degreesToChords(t[part], key);
          const beats = chords.reduce((s, c) => s + c.beats, 0);
          expect(beats % 4, `${t.id} ${key} ${part}`).toBe(0);
          for (const c of chords) expect(isValidChord(c.symbol), `${t.id} ${key}: ${c.symbol}`).toBe(true);
        }
      }
    }
  });

  it("코러스(B)는 벌스(A)와 다른 진행이다", () => {
    for (const t of PROGRESSIONS) expect(t.B.join(), t.id).not.toBe(t.A.join());
  });
});
