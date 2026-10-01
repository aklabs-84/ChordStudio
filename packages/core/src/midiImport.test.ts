import { describe, expect, it } from "vitest";
import { generateSong } from "./generator";
import { songToMidi } from "./midi";
import { midiToSong } from "./midiImport";
import { validateSong } from "./schema";

describe("midiToSong", () => {
  it("빈 파일은 오류를 돌려준다", () => {
    const result = midiToSong(new Uint8Array());
    expect(result.ok).toBe(false);
  });

  it("MIDI 헤더가 아니면 오류를 돌려준다", () => {
    const result = midiToSong(new TextEncoder().encode("not a midi file"));
    expect(result.ok).toBe(false);
  });

  it("이 앱이 내보낸 MIDI를 다시 불러오면 유효한 곡이 된다 (템포는 그대로 보존)", () => {
    const original = generateSong({ genre: "pop", seed: 7 });
    const bytes = songToMidi(original, { humanize: false });
    const result = midiToSong(bytes, { genre: "pop" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateSong(result.song)).toEqual([]);
    expect(result.song.meta.bpm).toBe(original.meta.bpm);
    expect(result.song.sections[0]!.chords.length).toBeGreaterThan(0);
  });

  it("드럼만 있는 MIDI는 코드를 추정할 수 없다고 오류를 돌려준다", () => {
    const silent = generateSong({ genre: "pop", seed: 1 });
    silent.mixer.piano.mute = true;
    silent.mixer.bass.mute = true;
    silent.mixer.strings.mute = true;
    const bytes = songToMidi(silent, { humanize: false });
    const result = midiToSong(bytes);
    expect(result.ok).toBe(false);
  });
});
