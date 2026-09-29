import { describe, expect, it } from "vitest";
import { resetSection, restoreStructure, setPatternMuted, setDrumsMuted, setStringsOn, addChord, addSection, appendArrangementItem, clearPatternVariant, cycleStep, getStepPattern, setBassApproach, setPianoStyle, stepLevel, stepsOf, moveArrangementItem, removeArrangementItem, removeChord, setChordSymbol, shiftChordBeats } from "./edit";
import { generateSong } from "./generator";
import { validateSong } from "./schema";
import { songToEvents } from "./events";

const song = generateSong({ genre: "pop", seed: 1 });
const A = song.sections[0]!;
const beatsOf = (s: typeof A) => s.chords.reduce((n, c) => n + c.beats, 0);

describe("코드 편집", () => {
  it("코드 기호를 바꾸고 원본은 건드리지 않는다", () => {
    const next = setChordSymbol(song, "A", 0, "Dm7");
    expect(next.sections[0]!.chords[0]!.symbol).toBe("Dm7");
    expect(A.chords[0]!.symbol).not.toBe("Dm7");
    expect(validateSong(next)).toEqual([]);
  });

  it("해석할 수 없는 기호는 무시한다", () => {
    expect(setChordSymbol(song, "A", 0, "H#zz")).toBe(song);
    expect(setChordSymbol(song, "A", 99, "C")).toBe(song);
    expect(setChordSymbol(song, "없는섹션", 0, "C")).toBe(song);
  });

  it("박자 이동은 섹션 길이를 유지하고 옆 코드가 줄어든다", () => {
    const two = { ...song, sections: [{ ...A, chords: [{ symbol: "C", beats: 2 }, { symbol: "G", beats: 2 }], bars: 1 }, ...song.sections.slice(1)] };
    const next = shiftChordBeats(two, "A", 0, 1);
    expect(next.sections[0]!.chords.map((c) => c.beats)).toEqual([3, 1]);
    expect(validateSong(next)).toEqual([]);
    // 옆 코드가 1박 밑으로 못 내려간다
    expect(shiftChordBeats(next, "A", 0, 1)).toBe(next);
    // 마지막 코드는 앞 코드와 주고받는다
    expect(shiftChordBeats(next, "A", 1, 1).sections[0]!.chords.map((c) => c.beats)).toEqual([2, 2]);
  });

  it("코드를 추가하면 1마디 늘고, 지우면 다시 준다", () => {
    const added = addChord(song, "A", 0, "F");
    const s = added.sections[0]!;
    expect(s.chords[1]!.symbol).toBe("F");
    expect(s.bars).toBe(A.bars + 1);
    expect(beatsOf(s)).toBe(s.bars * 4);
    expect(validateSong(added)).toEqual([]);
    const removed = removeChord(added, "A", 1);
    expect(removed.sections[0]!.bars).toBe(A.bars);
    expect(validateSong(removed)).toEqual([]);
  });

  it("맨 앞에 넣을 수 있고, 마지막 하나는 지울 수 없다", () => {
    expect(addChord(song, "A", -1, "F").sections[0]!.chords[0]!.symbol).toBe("F");
    const one = { ...song, sections: [{ ...A, chords: [{ symbol: "C", beats: 4 }], bars: 1 }, ...song.sections.slice(1)] };
    expect(removeChord(one, "A", 0)).toBe(one);
  });

  it("박자가 어긋나는 코드를 지우면 마지막 코드가 늘어 마디에 맞는다", () => {
    const odd = { ...song, sections: [{ ...A, chords: [{ symbol: "C", beats: 3 }, { symbol: "G", beats: 1 }, { symbol: "F", beats: 4 }], bars: 2 }, ...song.sections.slice(1)] };
    const next = removeChord(odd, "A", 0);
    expect(next.sections[0]!.chords.map((c) => c.beats)).toEqual([1, 7]);
    expect(next.sections[0]!.bars).toBe(2);
    expect(validateSong(next)).toEqual([]);
  });

  it("편집한 곡이 이벤트로 바뀌고 마디가 늘면 곡이 길어진다", () => {
    const before = songToEvents(song).totalBeats;
    const after = songToEvents(addChord(song, "A", 0, "F")).totalBeats;
    expect(after).toBeGreaterThan(before);
  });

  it("코드가 바뀌는 박에 패턴 타격이 없어도 새 코드가 그 박에 울린다 (3박/5박)", () => {
    const sparse = Array.from({ length: 16 }, (_, i) => (i === 0 || i === 8 ? 1 : 0));
    const tracks = { ...A.tracks, piano: { style: "chord" as const, pattern: { main: sparse } }, bass: { ...A.tracks.bass, pattern: { main: sparse } } };
    const two = { ...A, chords: [{ symbol: "C", beats: 3 }, { symbol: "F", beats: 5 }], bars: 2, tracks };
    const custom = { ...song, sections: [two, ...song.sections.slice(1)], arrangement: ["A"] };
    expect(validateSong(custom)).toEqual([]);
    const { events } = songToEvents(custom, { humanize: false });
    const piano = events.filter((e) => e.track === "piano" && Math.abs(e.time - 3) < 1e-9);
    const bass = events.filter((e) => e.track === "bass" && Math.abs(e.time - 3) < 1e-9);
    expect(piano.length).toBeGreaterThan(0);
    expect(bass).toHaveLength(1);
    // 3박 직전 코드(C)는 3박에서 끝난다
    const before = events.filter((e) => e.track === "piano" && e.time < 3);
    for (const e of before) expect(e.time + e.duration).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe("재생 순서 편집", () => {
  // 기본: A B A B
  it("항목을 앞뒤로 옮긴다", () => {
    expect(moveArrangementItem(song, 1, -1).arrangement).toEqual(["B", "A", "A", "B"]);
    expect(moveArrangementItem(song, 0, 1).arrangement).toEqual(["B", "A", "A", "B"]);
    expect(song.arrangement).toEqual(["A", "B", "A", "B"]);
  });

  it("범위를 벗어나는 이동은 무시한다", () => {
    expect(moveArrangementItem(song, 0, -1)).toBe(song);
    expect(moveArrangementItem(song, 3, 1)).toBe(song);
    expect(moveArrangementItem(song, 9, 1)).toBe(song);
  });

  it("항목을 빼고, 마지막 하나는 남긴다", () => {
    const fewer = removeArrangementItem(song, 0);
    expect(fewer.arrangement).toEqual(["B", "A", "B"]);
    let one = fewer;
    while (one.arrangement.length > 1) one = removeArrangementItem(one, 0);
    expect(removeArrangementItem(one, 0)).toBe(one);
    expect(validateSong(one)).toEqual([]);
  });

  it("끝에 섹션을 더하면 곡이 길어지고, 없는 섹션은 무시한다", () => {
    const more = appendArrangementItem(song, "B");
    expect(more.arrangement).toEqual(["A", "B", "A", "B", "B"]);
    expect(songToEvents(more).totalBeats).toBeGreaterThan(songToEvents(song).totalBeats);
    expect(appendArrangementItem(song, "Z")).toBe(song);
    expect(validateSong(more)).toEqual([]);
  });

  it("새 섹션을 마지막 섹션 복사로 만들고 재생 순서 끝에 붙인다", () => {
    const last = song.sections[song.sections.length - 1]!;
    const next = addSection(song, "브릿지");
    expect(next.sections).toHaveLength(song.sections.length + 1);
    const added = next.sections[next.sections.length - 1]!;
    expect(added.name).toBe("브릿지");
    expect(added.id).not.toBe(last.id);
    expect(added.chords).toEqual(last.chords);
    expect(added.tracks).toEqual(last.tracks);
    expect(next.arrangement).toEqual([...song.arrangement, added.id]);
    expect(validateSong(next)).toEqual([]);
  });

  it("이름이 비었거나 공백뿐이면 무시한다", () => {
    expect(addSection(song, "")).toBe(song);
    expect(addSection(song, "   ")).toBe(song);
  });

  it("섹션 상한에 닿으면 더 추가하지 않는다", () => {
    let s = song;
    for (let i = 0; i < 20; i++) s = addSection(s, `섹션${i}`);
    expect(s.sections.length).toBeLessThanOrEqual(16);
    expect(validateSong(s)).toEqual([]);
  });
});

describe("패턴 편집", () => {
  const kick = { track: "drums", lane: "kick" } as const;

  it("세기 단계: 꺼짐 → 보통 → 세게 → 꺼짐", () => {
    expect(stepLevel(0)).toBe(0);
    expect(stepLevel(0.35)).toBe(1);
    expect(stepLevel(0.6)).toBe(1);
    expect(stepLevel(0.9)).toBe(2);
    const step = A.tracks.piano.pattern.main.findIndex((v) => v === 0);
    const values: number[] = [];
    let s = song;
    for (let i = 0; i < 3; i++) {
      s = cycleStep(s, "A", { track: "piano" }, "main", step);
      values.push(s.sections[0]!.tracks.piano.pattern.main[step]!);
    }
    expect(values).toEqual([0.6, 1, 0]);
    expect(validateSong(s)).toEqual([]);
  });

  it("원본은 바뀌지 않고, 범위 밖 스텝은 무시한다", () => {
    const before = JSON.stringify(A);
    cycleStep(song, "A", kick, "main", 0);
    expect(JSON.stringify(A)).toBe(before);
    expect(cycleStep(song, "A", kick, "main", 16)).toBe(song);
    expect(cycleStep(song, "A", kick, "main", -1)).toBe(song);
    expect(cycleStep(song, "없음", kick, "main", 0)).toBe(song);
  });

  it("first를 처음 고치면 main을 복사해서 시작하고, main은 그대로다", () => {
    const main = stepsOf(getStepPattern(A, kick), "main").slice();
    const next = cycleStep(song, "A", { track: "bass" }, "first", 0);
    const bass = next.sections[0]!.tracks.bass.pattern;
    expect(bass.first).toBeDefined();
    expect(bass.main).toEqual(A.tracks.bass.pattern.main);
    expect(bass.first!.slice(1)).toEqual(A.tracks.bass.pattern.main.slice(1));
    expect(stepsOf(getStepPattern(next.sections[0]!, kick), "main")).toEqual(main);
    const cleared = clearPatternVariant(next, "A", { track: "bass" }, "first");
    expect(cleared.sections[0]!.tracks.bass.pattern.first).toBeUndefined();
    expect(clearPatternVariant(cleared, "A", { track: "bass" }, "first")).toBe(cleared);
  });

  it("없던 드럼 레인은 빈 패턴에서 시작한다", () => {
    const ride = { track: "drums", lane: "ride" } as const;
    const bare = { ...song, sections: [{ ...A, tracks: { ...A.tracks, drums: { lanes: {} } } }, ...song.sections.slice(1)] };
    const next = cycleStep(bare, "A", ride, "main", 4);
    expect(next.sections[0]!.tracks.drums.lanes.ride!.main[4]).toBe(0.6);
    expect(next.sections[0]!.tracks.drums.lanes.ride!.main.filter((v) => v > 0)).toHaveLength(1);
    expect(validateSong(next)).toEqual([]);
  });

  it("편집한 스텝이 실제 소리(이벤트)에 반영된다", () => {
    const count = (s: typeof song) => songToEvents(s, { humanize: false }).events.filter((e) => e.track === "drums" && e.lane === "kick").length;
    const off = stepsOf(getStepPattern(A, kick), "main").findIndex((v) => v === 0);
    const on = cycleStep(song, "A", kick, "main", off);
    expect(count(on)).toBeGreaterThan(count(song));
  });

  it("피아노 스타일과 베이스 접근음 설정", () => {
    const style = A.tracks.piano.style === "broken" ? "chord" : "broken";
    expect(setPianoStyle(song, "A", style).sections[0]!.tracks.piano.style).toBe(style);
    expect(setPianoStyle(song, "A", A.tracks.piano.style)).toBe(song);
    expect(setBassApproach(song, "A", !A.tracks.bass.approach).sections[0]!.tracks.bass.approach).toBe(!A.tracks.bass.approach);
  });
});

describe("되돌리기", () => {
  it("섹션 하나만 원래 생성 결과로 되돌린다", () => {
    let edited = cycleStep(song, "A", { track: "piano" }, "main", 0);
    edited = cycleStep(edited, "B", { track: "bass" }, "main", 1);
    edited = setChordSymbol(edited, "A", 0, "Dm7");
    const reset = resetSection(edited, song, "A");
    expect(reset.sections[0]).toEqual(song.sections[0]);
    expect(reset.sections[0]).not.toBe(song.sections[0]);
    // B는 그대로 (고친 상태 유지)
    expect(reset.sections[1]).toBe(edited.sections[1]);
    expect(validateSong(reset)).toEqual([]);
    // 이미 원래대로면 그대로, 없는 섹션도 그대로
    expect(resetSection(song, song, "A")).toBe(song);
    expect(resetSection(edited, song, "없음")).toBe(edited);
  });

  it("구조만 되돌리고 BPM·믹서는 유지한다", () => {
    const edited = { ...appendArrangementItem(song, "B"), meta: { ...song.meta, bpm: 77 } };
    const back = restoreStructure(edited, song);
    expect(back.arrangement).toEqual(song.arrangement);
    expect(back.meta.bpm).toBe(77);
    expect(back.mixer).toBe(edited.mixer);
  });
});

describe("크기 상한", () => {
  it("순서·마디가 상한에 닿으면 더 늘리지 않는다", () => {
    let s = song;
    for (let i = 0; i < 200; i++) s = appendArrangementItem(s, "A");
    expect(s.arrangement.length).toBeLessThanOrEqual(64);
    expect(validateSong(s)).toEqual([]);
    let t = song;
    for (let i = 0; i < 200; i++) t = addChord(t, "A", 0, "F");
    expect(validateSong(t)).toEqual([]);
    expect(t.sections[0]!.bars).toBeLessThanOrEqual(64);
  });
});

describe("1마디 섹션의 패턴", () => {
  const one = { ...song, sections: [{ ...A, chords: [{ symbol: "C", beats: 4 }], bars: 1 }, ...song.sections.slice(1)] };
  const kick = { track: "drums", lane: "kick" } as const;

  it("first만 있는 레인도 엔진처럼 first를 보여준다", () => {
    const firstOnly = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const p = { main: new Array<number>(16).fill(0), first: firstOnly };
    expect(stepsOf(p, "last", 1)).toEqual(firstOnly);
    expect(stepsOf(p, "first", 1)).toEqual(firstOnly);
    expect(stepsOf(p, "last", 4)).toEqual(p.main);
  });

  it("1마디 섹션에서 first를 고치면 소리가 나는 last에 기록된다", () => {
    const next = cycleStep(one, "A", kick, "first", 3);
    const lane = next.sections[0]!.tracks.drums.lanes.kick!;
    expect(lane.last).toBeDefined();
    expect(lane.first).toBe(getStepPattern(one.sections[0]!, kick)!.first);
    expect(validateSong(next)).toEqual([]);
  });
});

describe("악기 켜기/끄기", () => {
  const count = (s: typeof song, track: string) => songToEvents(s, { humanize: false }).events.filter((e) => e.track === track).length;
  const kick = { track: "drums", lane: "kick" } as const;

  it("피아노·베이스를 끄면 그 섹션 소리가 빠지고, 켜면 칸 값 그대로 돌아온다", () => {
    const solo = { ...song, arrangement: ["A"] };
    const pianoOff = setPatternMuted(solo, "A", { track: "piano" }, true);
    expect(count(pianoOff, "piano")).toBe(0);
    expect(count(pianoOff, "bass")).toBe(count(solo, "bass"));
    expect(validateSong(pianoOff)).toEqual([]);
    const back = setPatternMuted(pianoOff, "A", { track: "piano" }, false);
    expect(back).toEqual(solo);
    expect(setPatternMuted(solo, "A", { track: "piano" }, false)).toBe(solo);
  });

  it("끈 섹션만 조용해지고 다른 섹션은 그대로다", () => {
    const off = setPatternMuted(song, "A", { track: "bass" }, true);
    expect(count(off, "bass")).toBeLessThan(count(song, "bass"));
    expect(off.sections[1]).toBe(song.sections[1]);
  });

  it("끈 패턴을 고쳐도 꺼진 상태가 유지된다", () => {
    const off = setPatternMuted(song, "A", kick, true);
    const edited = cycleStep(off, "A", kick, "main", 1);
    expect(edited.sections[0]!.tracks.drums.lanes.kick!.muted).toBe(true);
    expect(clearPatternVariant(edited, "A", kick, "last").sections[0]!.tracks.drums.lanes.kick!.muted).toBe(true);
  });

  it("드럼 전체를 끄고 켠다", () => {
    const solo = { ...song, arrangement: ["A"] };
    const off = setDrumsMuted(solo, "A", true);
    expect(count(off, "drums")).toBe(0);
    expect(setDrumsMuted(off, "A", true)).toBe(off);
    expect(setDrumsMuted(off, "A", false)).toEqual(solo);
  });

  it("스트링 패드를 넣고 뺀다", () => {
    const on = setStringsOn(song, "A", true);
    expect(on.sections[0]!.tracks.strings).toBeDefined();
    expect(count({ ...on, arrangement: ["A"] }, "strings")).toBeGreaterThan(0);
    const off = setStringsOn(on, "A", false);
    expect(off.sections[0]!.tracks.strings).toBeUndefined();
    expect(setStringsOn(off, "A", false)).toBe(off);
    expect(validateSong(on)).toEqual([]);
  });

  it("없는 섹션·레인은 무시한다", () => {
    expect(setPatternMuted(song, "없음", kick, true)).toBe(song);
    const bare = { ...song, sections: [{ ...A, tracks: { ...A.tracks, drums: { lanes: {} } } }, ...song.sections.slice(1)] };
    expect(setPatternMuted(bare, "A", { track: "drums", lane: "ride" }, true)).toBe(bare);
  });
});
