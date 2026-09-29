// 곡 파일(.json) 저장/불러오기. 남이 만든 파일도 들어오므로 예외를 던지지 않고 결과 객체로 돌려준다.
import { TRACK_IDS, defaultMixer, validateSong, type Section, type Song, type StepPattern } from "./schema";

/** 이보다 큰 파일은 곡 파일이 아니라고 본다 (실제 곡은 수십 KB) */
export const MAX_SONG_FILE_BYTES = 2_000_000;

export type ParseResult = { ok: true; song: Song } | { ok: false; error: string };

export function serializeSong(song: Song): string {
  return JSON.stringify(song, null, 2);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** 믹서는 없거나 일부만 있어도 기본값으로 채운다. 값이 잘못됐으면 null. */
function normalizeMixer(raw: unknown): Song["mixer"] | null {
  const base = defaultMixer();
  if (raw === undefined) return base;
  if (!isObject(raw)) return null;
  for (const id of TRACK_IDS) {
    const ch = raw[id];
    if (ch === undefined) continue;
    if (!isObject(ch)) return null;
    const volume = ch.volume ?? base[id].volume;
    if (typeof volume !== "number" || !Number.isFinite(volume) || volume < -60 || volume > 12) return null;
    base[id] = { volume, mute: ch.mute === true, solo: ch.solo === true };
  }
  return base;
}

const pattern = (p: StepPattern): StepPattern => ({
  main: [...p.main],
  ...(p.first ? { first: [...p.first] } : {}),
  ...(p.last ? { last: [...p.last] } : {}),
  ...(p.muted ? { muted: true } : {}),
});

/** 검사를 통과한 곡에서 알려진 필드만 새 객체로 옮긴다. 파일에 섞인 알 수 없는 값(거대한 junk 등)은 버려진다. */
function pickKnown(s: Song): Song {
  const { meta } = s;
  const sections = s.sections.map(
    (sec): Section => ({
      id: sec.id,
      name: sec.name,
      bars: sec.bars,
      chords: sec.chords.map((c) => ({ symbol: c.symbol, beats: c.beats })),
      tracks: {
        piano: { style: sec.tracks.piano.style, pattern: pattern(sec.tracks.piano.pattern) },
        bass: { approach: sec.tracks.bass.approach, pattern: pattern(sec.tracks.bass.pattern) },
        drums: { lanes: Object.fromEntries(Object.entries(sec.tracks.drums.lanes).map(([k, v]) => [k, pattern(v)])) },
        ...(sec.tracks.strings ? { strings: sec.tracks.strings.pattern ? { pattern: pattern(sec.tracks.strings.pattern) } : {} } : {}),
      },
    }),
  );
  return {
    version: 1,
    meta: {
      title: meta.title,
      key: meta.key,
      bpm: meta.bpm,
      genre: meta.genre,
      swing: meta.swing,
      humanizeMs: meta.humanizeMs,
      ...(meta.seed !== undefined ? { seed: meta.seed } : {}),
    },
    sections,
    arrangement: [...s.arrangement],
    mixer: s.mixer,
  };
}

export function parseSongJson(text: string): ParseResult {
  if (text.length > MAX_SONG_FILE_BYTES) return { ok: false, error: "파일이 너무 큽니다" };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "JSON 형식이 아닙니다" };
  }
  if (!isObject(raw) || !isObject(raw.meta) || !Array.isArray(raw.sections) || !Array.isArray(raw.arrangement)) {
    return { ok: false, error: "곡 파일의 구조가 아닙니다 (meta·sections·arrangement 필요)" };
  }
  const mixer = normalizeMixer(raw.mixer);
  if (!mixer) return { ok: false, error: "믹서 값이 올바르지 않습니다" };
  const song = { ...raw, mixer } as unknown as Song;
  try {
    const errors = validateSong(song);
    if (errors.length > 0) return { ok: false, error: errors[0]! + (errors.length > 1 ? ` (외 ${errors.length - 1}건)` : "") };
  } catch {
    return { ok: false, error: "곡 데이터가 올바르지 않습니다" };
  }
  return { ok: true, song: pickKnown(song) };
}
