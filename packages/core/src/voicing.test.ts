import { describe, expect, it } from "vitest";
import { parseChord, mod12 } from "./theory";
import {
  BASS_LOW,
  bassMidi,
  rootPositionVoicing,
  thinIntervals,
  voiceChord,
  voicingPitchClasses,
  voiceProgression,
} from "./voicing";

const chords = (...symbols: string[]) => symbols.map(parseChord);

/** 인접 코드 사이 음 이동량 합 (음 개수가 같을 때, 오름차순 정렬끼리 대응). */
function movement(a: number[], b: number[]): number {
  return a.reduce((s, n, i) => s + Math.abs(n - b[i]!), 0);
}
const totalMovement = (voicings: number[][]) =>
  voicings.slice(1).reduce((s, v, i) => s + movement(voicings[i]!, v), 0);

describe("bassMidi", () => {
  it("항상 E1~D#2 범위이고 피치클래스가 맞는다", () => {
    for (let pc = 0; pc < 12; pc++) {
      const m = bassMidi(pc);
      expect(m).toBeGreaterThanOrEqual(BASS_LOW);
      expect(m).toBeLessThan(BASS_LOW + 12);
      expect(mod12(m)).toBe(pc);
    }
  });
  it("슬래시 코드는 슬래시 뒤 음을 베이스로 쓴다", () => {
    expect(mod12(voiceChord(parseChord("C/E")).bass)).toBe(4);
    expect(mod12(voiceChord(parseChord("C")).bass)).toBe(0);
  });
});

describe("thinIntervals", () => {
  it("4음 이하 코드는 그대로 둔다", () => {
    expect(thinIntervals([0, 4, 7])).toEqual([0, 4, 7]);
    expect(thinIntervals([0, 4, 7, 11])).toEqual([0, 4, 7, 11]);
  });
  it("확장 코드는 5도→근음→11도 순으로 솎아 4음으로 만든다", () => {
    expect(thinIntervals([0, 4, 7, 10, 14])).toEqual([0, 4, 10, 14]); // 9
    expect(thinIntervals([0, 4, 7, 10, 14, 17])).toEqual([4, 10, 14, 17]); // 11
    expect(thinIntervals([0, 4, 7, 10, 14, 17, 21])).toEqual([4, 10, 14, 21]); // 13
  });
  it("3음(가이드 톤)과 7음은 항상 남는다", () => {
    for (const s of ["C9", "C11", "C13", "Cm9", "Cm11", "Cmaj9"]) {
      const chord = parseChord(s);
      const pcs = voicingPitchClasses(chord);
      const third = mod12(chord.root + (chord.quality.startsWith("m") && !chord.quality.startsWith("maj") ? 3 : 4));
      expect(pcs, s).toContain(third);
      expect(pcs.length, s).toBeLessThanOrEqual(4);
    }
  });
});

describe("voiceChord", () => {
  it("결과는 오름차순이고 허용 음역 안이다", () => {
    for (const s of ["C", "Am7", "G13", "F#m7b5", "Bbmaj9", "E7#9", "Dsus4"]) {
      const { notes } = voiceChord(parseChord(s));
      expect([...notes].sort((a, b) => a - b), s).toEqual(notes);
      expect(notes[0]!, s).toBeGreaterThanOrEqual(50);
      expect(notes[notes.length - 1]!, s).toBeLessThanOrEqual(76);
    }
  });

  it("구성음 피치클래스가 빠짐없이 들어 있다", () => {
    const chord = parseChord("Dm7");
    const got = new Set(voiceChord(chord).notes.map(mod12));
    expect(got).toEqual(new Set(voicingPitchClasses(chord)));
  });

  it("같은 입력이면 같은 결과 (결정적)", () => {
    const c = chords("C", "G", "Am", "F");
    expect(voiceProgression(c)).toEqual(voiceProgression(c));
  });

  it("음역이 너무 좁아도 위로 넓혀 결과를 돌려준다", () => {
    const { notes } = voiceChord(parseChord("C"), undefined, { min: 60, max: 61 });
    expect(notes.length).toBe(3);
  });
});

describe("voice leading", () => {
  it("C→G→Am→F: 근음 고정보다 음 이동량이 훨씬 적다", () => {
    const prog = chords("C", "G", "Am", "F");
    const led = voiceProgression(prog).map((v) => v.notes);
    const fixed = prog.map((c) => rootPositionVoicing(c));

    expect(totalMovement(led)).toBeLessThan(totalMovement(fixed) / 2);
    // 인접 코드 사이 이동량이 항상 작다
    for (let i = 1; i < led.length; i++) expect(movement(led[i - 1]!, led[i]!)).toBeLessThanOrEqual(6);
  });

  it("공통음은 그대로 유지한다 (C→Am의 C, E)", () => {
    const [c, am] = voiceProgression(chords("C", "Am")).map((v) => v.notes);
    const held = c!.filter((n) => am!.includes(n));
    expect(held.length).toBeGreaterThanOrEqual(2);
  });

  it("재즈 ii–V–I(Dm9→G13→Cmaj9): 각 이동량이 작고 4음을 유지한다", () => {
    const led = voiceProgression(chords("Dm9", "G13", "Cmaj9")).map((v) => v.notes);
    expect(led.every((n) => n.length === 4)).toBe(true);
    for (let i = 1; i < led.length; i++) expect(movement(led[i - 1]!, led[i]!)).toBeLessThanOrEqual(8);
  });

  it("긴 진행에서도 음역 중심에서 멀어지지 않는다 (12개 코드)", () => {
    const prog = chords("C", "Am", "F", "G", "Em", "Am", "Dm", "G7", "C", "F", "Bb", "G");
    for (const v of voiceProgression(prog)) {
      const mean = v.notes.reduce((s, n) => s + n, 0) / v.notes.length;
      expect(Math.abs(mean - 62)).toBeLessThanOrEqual(8);
    }
  });

  it("prev를 넘기면 섹션 경계에서도 이어진다", () => {
    const first = voiceProgression(chords("C", "G"));
    const next = voiceProgression(chords("Am"), {}, first[1]!.notes);
    const alone = voiceProgression(chords("Am"));
    expect(movement(first[1]!.notes, next[0]!.notes)).toBeLessThanOrEqual(
      movement(first[1]!.notes, alone[0]!.notes),
    );
  });
});
