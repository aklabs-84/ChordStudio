import { describe, expect, it } from "vitest";
import { songToEvents, swingWarp } from "./events";
import { generateSong } from "./generator";
import { pat } from "./patterns";
import { defaultMixer, GENRES, type Song } from "./schema";

const ZERO = ".... .... .... ....";

/** 2마디 C→F, 패턴을 마음대로 넣을 수 있는 최소 곡. */
function makeSong(over: Partial<Song["meta"]> = {}, tracks?: Partial<Song["sections"][number]["tracks"]>): Song {
  return {
    version: 1,
    meta: { title: "t", key: "C", bpm: 120, genre: "pop", swing: 0, humanizeMs: 0, seed: 1, ...over },
    sections: [
      {
        id: "A",
        name: "A",
        bars: 2,
        chords: [
          { symbol: "C", beats: 4 },
          { symbol: "F", beats: 4 },
        ],
        tracks: {
          piano: { style: "chord", pattern: pat("X... .... .... ....") },
          bass: { approach: false, pattern: pat("X... .... x... ....") },
          drums: { lanes: { kick: pat("X... .... .... ....") } },
          ...tracks,
        },
      },
    ],
    arrangement: ["A"],
    mixer: defaultMixer(),
  };
}

describe("swingWarp", () => {
  it("swing 0이면 그대로", () => {
    for (const p of [0, 0.25, 0.5, 0.75]) expect(swingWarp(p, 0)).toBeCloseTo(p);
  });
  it("swing 1이면 8분 뒷박이 3연음 위치(2/3)로", () => {
    expect(swingWarp(0.5, 1)).toBeCloseTo(2 / 3);
  });
  it("박 머리는 고정, 순서는 뒤집히지 않고 0~1 안에 머문다", () => {
    for (const s of [0.4, 0.65, 1]) {
      expect(swingWarp(0, s)).toBe(0);
      let prev = -1;
      for (let i = 0; i < 16; i++) {
        const w = swingWarp(i / 16, s);
        expect(w).toBeGreaterThan(prev);
        expect(w).toBeLessThan(1);
        prev = w;
      }
    }
  });
});

describe("songToEvents", () => {
  it("총 길이는 마디 수 × 4박, 이벤트는 시간순", () => {
    const { events, totalBeats } = songToEvents(makeSong());
    expect(totalBeats).toBe(8);
    for (let i = 1; i < events.length; i++) expect(events[i]!.time).toBeGreaterThanOrEqual(events[i - 1]!.time);
  });

  it("패턴의 타격이 정확한 박에 놓이고 마디마다 반복된다 (humanize 끔)", () => {
    const { events } = songToEvents(makeSong(), { humanize: false });
    expect(events.filter((e) => e.lane === "kick").map((e) => e.time)).toEqual([0, 4]);
    expect(events.filter((e) => e.track === "bass").map((e) => e.time)).toEqual([0, 2, 4, 6]);
  });

  it("piano chord 스타일은 보이싱의 모든 음을, 코드가 바뀌면 다른 음을 낸다", () => {
    const { events } = songToEvents(makeSong(), { humanize: false });
    const piano = events.filter((e) => e.track === "piano");
    const first = piano.filter((e) => e.time < 4).map((e) => e.midi!);
    const second = piano.filter((e) => e.time >= 4).map((e) => e.midi!);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(second.length).toBeGreaterThanOrEqual(3);
    expect(first.sort().join()).not.toBe(second.sort().join());
  });

  it("베이스는 근음(낮은 음역), 코드 근음이 바뀌면 음도 바뀐다", () => {
    const { events } = songToEvents(makeSong(), { humanize: false });
    const bass = events.filter((e) => e.track === "bass");
    expect(bass[0]!.midi! % 12).toBe(0); // C
    expect(bass[2]!.midi! % 12).toBe(5); // F
    for (const b of bass) expect(b.midi!).toBeLessThan(48);
  });

  it("approach: 코드 바뀌기 직전 마지막 타격은 다음 근음의 반음 옆", () => {
    const song = makeSong(
      {},
      { bass: { approach: true, pattern: pat("X... .... x... ...x") } }, // 마지막 타격이 3박 4스텝 안(스텝 15)
    );
    const bass = songToEvents(song, { humanize: false }).events.filter((e) => e.track === "bass" && e.time < 4);
    const last = bass[bass.length - 1]!;
    const targetPc = 5; // F
    const up = (((last.midi! - targetPc) % 12) + 12) % 12;
    const diff = Math.min(up, 12 - up);
    expect(diff).toBe(1);
  });

  it("arp-up은 타격마다 다른 음, 위로 올라간다", () => {
    const song = makeSong({}, { piano: { style: "arp-up", pattern: pat("X... X... X... X...") } });
    const notes = songToEvents(song, { humanize: false })
      .events.filter((e) => e.track === "piano" && e.time < 4)
      .map((e) => e.midi!);
    expect(notes.length).toBe(4);
    expect(notes[1]!).toBeGreaterThan(notes[0]!);
    expect(notes[2]!).toBeGreaterThan(notes[1]!);
  });

  it("스윙: 8분 뒷박이 뒤로 밀린다", () => {
    const song = makeSong({ swing: 0.65 }, { drums: { lanes: { hhClosed: pat("x.x. x.x. x.x. x.x.") } } });
    const hh = songToEvents(song, { humanize: false }).events.filter((e) => e.lane === "hhClosed");
    expect(hh[0]!.time).toBe(0);
    expect(hh[1]!.time).toBeGreaterThan(0.5);
    expect(hh[1]!.time).toBeLessThan(2 / 3 + 1e-9);
  });

  it("humanize: 켜면 시간·세기가 흔들리지만 같은 시드면 재현된다", () => {
    const song = makeSong({ humanizeMs: 15 }, { drums: { lanes: { hhClosed: pat("x.x. x.x. x.x. x.x.") } } });
    const on = songToEvents(song).events.filter((e) => e.lane === "hhClosed");
    const off = songToEvents(song, { humanize: false }).events.filter((e) => e.lane === "hhClosed");
    expect(on.some((e, i) => e.time !== off[i]!.time)).toBe(true);
    expect(new Set(on.map((e) => e.velocity)).size).toBeGreaterThan(1);
    expect(songToEvents(song).events).toEqual(songToEvents(song).events);
    // 흔들림은 humanizeMs 안쪽 (120bpm: 15ms = 0.03박)
    on.forEach((e, i) => expect(Math.abs(e.time - off[i]!.time)).toBeLessThanOrEqual(0.031));
  });

  it("스트링 패드는 코드 길이만큼 늘어진다", () => {
    const song = makeSong({}, { strings: {} });
    const strings = songToEvents(song, { humanize: false }).events.filter((e) => e.track === "strings");
    expect(strings.length).toBeGreaterThan(0);
    expect(strings.every((e) => e.duration === 4)).toBe(true);
  });

  it("섹션의 last 패턴이 마지막 마디에만 적용된다 (필인)", () => {
    const song = makeSong(
      {},
      { drums: { lanes: { snare: pat(ZERO, ".... .... .... xxXX") } } },
    );
    const snares = songToEvents(song, { humanize: false }).events.filter((e) => e.lane === "snare");
    expect(snares.length).toBe(4);
    expect(snares.every((e) => e.time >= 4)).toBe(true);
  });

  it("생성기 곡 전체: 모든 장르에서 유효한 이벤트(음역·세기·길이)", () => {
    for (const genre of GENRES) {
      for (let seed = 1; seed <= 15; seed++) {
        const song = generateSong({ genre, seed });
        const { events, totalBeats } = songToEvents(song);
        expect(events.length, `${genre} ${seed}`).toBeGreaterThan(50);
        for (const e of events) {
          expect(e.time).toBeGreaterThanOrEqual(0);
          expect(e.time).toBeLessThan(totalBeats + 0.5);
          expect(e.duration).toBeGreaterThan(0);
          expect(e.velocity).toBeGreaterThanOrEqual(0.05);
          expect(e.velocity).toBeLessThanOrEqual(1);
          if (e.track === "drums") expect(e.lane).toBeDefined();
          else {
            expect(e.midi, `${genre} ${seed}`).toBeGreaterThanOrEqual(24);
            expect(e.midi).toBeLessThanOrEqual(90);
          }
        }
      }
    }
  });
});
