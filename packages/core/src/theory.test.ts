import { describe, expect, it } from "vitest";
import {
  ChordParseError,
  chordIntervals,
  chordPitchClasses,
  formatChord,
  isValidChord,
  keyUsesFlats,
  parseChord,
  parseNoteName,
  pcName,
  semitonesBetweenKeys,
  transposeSymbol,
} from "./theory";

const names = (symbol: string, flats = false) => chordPitchClasses(parseChord(symbol)).map((pc) => pcName(pc, flats));

describe("parseNoteName", () => {
  it("음 이름을 피치클래스로 바꾼다", () => {
    expect(parseNoteName("C")).toBe(0);
    expect(parseNoteName("C#")).toBe(1);
    expect(parseNoteName("Db")).toBe(1);
    expect(parseNoteName("B")).toBe(11);
    expect(parseNoteName("Cb")).toBe(11);
  });
  it("잘못된 입력은 null", () => {
    expect(parseNoteName("H")).toBeNull();
    expect(parseNoteName("")).toBeNull();
  });
});

describe("parseChord", () => {
  it("Cmaj7 → C E G B", () => {
    expect(names("Cmaj7")).toEqual(["C", "E", "G", "B"]);
  });
  it("메이저/마이너/7th", () => {
    expect(names("C")).toEqual(["C", "E", "G"]);
    expect(names("Am")).toEqual(["A", "C", "E"]);
    expect(names("G7")).toEqual(["G", "B", "D", "F"]);
    expect(names("Dm7")).toEqual(["D", "F", "A", "C"]);
  });
  it("임시표가 있는 근음", () => {
    expect(names("Bb", true)).toEqual(["Bb", "D", "F"]);
    expect(names("F#m7b5")).toEqual(["F#", "A", "C", "E"]);
  });
  it("확장 코드는 9도 이상을 옥타브 안으로 접은 피치클래스를 준다", () => {
    expect(names("C9")).toEqual(["C", "E", "G", "A#", "D"]);
    expect(chordIntervals(parseChord("C13"))).toEqual([0, 4, 7, 10, 14, 17, 21]);
  });
  it("별칭 표기를 canonical로 통일한다", () => {
    expect(parseChord("CM7").quality).toBe("maj7");
    expect(parseChord("CMaj7").quality).toBe("maj7");
    expect(parseChord("C-7").quality).toBe("m7");
    expect(parseChord("Csus").quality).toBe("sus4");
    expect(parseChord("Cø").quality).toBe("m7b5");
  });
  it("슬래시 코드: 베이스가 구성음이면 유지, 밖이면 맨 앞에 추가", () => {
    const inside = parseChord("C/E");
    expect(inside.bass).toBe(4);
    expect(chordPitchClasses(inside)).toEqual([0, 4, 7]);
    expect(names("C/D")).toEqual(["D", "C", "E", "G"]);
  });
  it("잘못된 기호는 ChordParseError", () => {
    for (const bad of ["", "H", "Cxyz", "C/", "C/H", "maj7"]) {
      expect(() => parseChord(bad), bad).toThrow(ChordParseError);
      expect(isValidChord(bad)).toBe(false);
    }
  });
});

describe("formatChord / transposeSymbol", () => {
  it("파싱 → 포맷 왕복", () => {
    expect(formatChord(parseChord("Cmaj7"))).toBe("Cmaj7");
    expect(formatChord(parseChord("Bbm7"), true)).toBe("Bbm7");
    expect(formatChord(parseChord("C/E"))).toBe("C/E");
  });
  it("G → F 키 전조(-2)", () => {
    expect(["G", "Em", "C", "D7"].map((s) => transposeSymbol(s, -2, true))).toEqual(["F", "Dm", "Bb", "C7"]);
  });
  it("슬래시 코드 전조 시 베이스도 이동", () => {
    expect(transposeSymbol("C/E", 2)).toBe("D/F#");
  });
  it("useFlats 미지정 시 입력의 b 표기를 따른다", () => {
    expect(transposeSymbol("Bb", 2)).toBe("C");
    expect(transposeSymbol("Bb", 1)).toBe("B");
    expect(transposeSymbol("Ab", 2)).toBe("Bb");
    expect(transposeSymbol("C", 1)).toBe("C#");
  });
  it("12반음 전조는 항등", () => {
    expect(transposeSymbol("Am7", 12)).toBe("Am7");
    expect(transposeSymbol("Am7", -12)).toBe("Am7");
  });
});

describe("keyUsesFlats / semitonesBetweenKeys", () => {
  it("플랫 조성 판별", () => {
    expect(["F", "Bb", "Eb", "Gb", "Dm", "Gm", "Bbm"].every(keyUsesFlats)).toBe(true);
    expect(["C", "G", "D", "Am", "Em", "F#"].some(keyUsesFlats)).toBe(false);
  });
  it("전조 반음 수는 -5~+6 범위", () => {
    expect(semitonesBetweenKeys("C", "G")).toBe(-5);
    expect(semitonesBetweenKeys("G", "F")).toBe(-2);
    expect(semitonesBetweenKeys("C", "F#")).toBe(6);
    expect(semitonesBetweenKeys("Am", "Cm")).toBe(3);
  });
  it("잘못된 조성은 에러", () => {
    expect(() => keyUsesFlats("X")).toThrow(ChordParseError);
    expect(() => semitonesBetweenKeys("C", "X")).toThrow(ChordParseError);
  });
});
