import { describe, expect, it } from "vitest";
import { generateSong } from "./generator";
import { setDrumsMuted, setPatternMuted, setStringsOn } from "./edit";
import { songFromShareHash, songToShareHash } from "./share";
import { MAX_SONG_FILE_BYTES, parseSongJson, serializeSong } from "./songfile";

const song = generateSong({ genre: "pop", seed: 3 });

describe("곡 파일", () => {
  it("저장한 곡을 그대로 다시 읽는다 (믹서 포함)", () => {
    const withMixer = { ...song, mixer: { ...song.mixer, bass: { volume: -9, mute: true, solo: false } } };
    const r = parseSongJson(serializeSong(withMixer));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.song).toEqual(withMixer);
  });

  it("믹서가 없거나 일부만 있으면 기본값으로 채운다", () => {
    const { mixer: _m, ...rest } = song;
    const r = parseSongJson(JSON.stringify(rest));
    expect(r.ok && r.song.mixer.piano).toEqual({ volume: -6, mute: false, solo: false });
    const part = parseSongJson(JSON.stringify({ ...rest, mixer: { drums: { volume: -3 } } }));
    expect(part.ok && part.song.mixer.drums).toEqual({ volume: -3, mute: false, solo: false });
  });

  it("깨진 파일은 예외 없이 이유를 돌려준다", () => {
    const bad = (t: string) => parseSongJson(t);
    expect(bad("{잘못")).toEqual({ ok: false, error: "JSON 형식이 아닙니다" });
    expect(bad("[]").ok).toBe(false);
    expect(bad("null").ok).toBe(false);
    expect(bad(JSON.stringify({ ...song, version: 2 })).ok).toBe(false);
    expect(bad(JSON.stringify({ ...song, arrangement: ["Z"] })).ok).toBe(false);
    expect(bad(JSON.stringify({ ...song, mixer: { piano: { volume: "큼" } } })).ok).toBe(false);
    expect(bad(JSON.stringify({ ...song, sections: [{ id: "A" }] })).ok).toBe(false);
    expect(bad(" ".repeat(MAX_SONG_FILE_BYTES + 1)).ok).toBe(false);
  });
});

describe("알 수 없는 필드 정리", () => {
  it("파일에 섞인 알 수 없는 필드는 버리고 곡 내용은 그대로 둔다", () => {
    const song = generateSong({ genre: "jazz", seed: 3 });
    const dirty = JSON.parse(serializeSong(song));
    dirty.junk = "x".repeat(10_000);
    dirty.meta.extra = { a: 1 };
    dirty.sections[0].tracks.piano.extra = [1, 2, 3];
    dirty.sections[0].chords[0].extra = true;
    const r = parseSongJson(JSON.stringify(dirty));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.song).toEqual(song);
      expect(JSON.stringify(r.song)).not.toContain("junk");
    }
  });
});

describe("악기 끄기 상태", () => {
  it("파일과 공유 링크를 거쳐도 꺼진 악기·스트링이 유지된다", async () => {
    let s = setPatternMuted(song, "A", { track: "piano" }, true);
    s = setDrumsMuted(s, "A", true);
    s = setStringsOn(s, "B", true);
    const r = parseSongJson(serializeSong(s));
    expect(r.ok && r.song).toEqual(s);
    const link = await songToShareHash(s);
    const back = await songFromShareHash(link);
    expect(back.ok && back.song).toEqual(s);
  });

  it("muted가 true/false가 아니면 거부한다", () => {
    const bad = JSON.parse(serializeSong(song));
    bad.sections[0].tracks.piano.pattern.muted = "yes";
    expect(parseSongJson(JSON.stringify(bad)).ok).toBe(false);
  });
});
