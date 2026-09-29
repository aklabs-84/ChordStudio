// Song → 표준 MIDI 파일(SMF format 1). 재생과 같은 songToEvents 결과를 그대로 쓰므로
// 스윙·휴머나이즈가 들어간 "연주" 그대로 DAW(GarageBand 등)로 옮겨진다.
// 트랙: 템포 → 피아노(ch1) / 베이스(ch2) / 스트링(ch3) / 드럼(ch10, GM 매핑). 곡 전체를 1회 재생 분량으로 내보낸다.
import { songToEvents, type NoteEvent } from "./events";
import { TRACK_IDS, type DrumLane, type Song, type TrackId } from "./schema";

const PPQ = 480;

/** 트랙별 MIDI 채널(0부터)과 GM 프로그램 번호 */
const CHANNEL: Record<TrackId, number> = { piano: 0, bass: 1, strings: 2, drums: 9 };
const PROGRAM: Record<Exclude<TrackId, "drums">, number> = { piano: 0, bass: 33, strings: 48 };
const TRACK_NAME: Record<TrackId, string> = { piano: "Piano", bass: "Bass", strings: "Strings", drums: "Drums" };

/** GM 드럼 맵 */
export const GM_DRUM_NOTE: Record<DrumLane, number> = {
  kick: 36, snare: 38, rim: 37, hhClosed: 42, hhOpen: 46, tomHi: 50, tomLow: 45, ride: 51, crash: 49,
};
const DRUM_HIT_BEATS = 0.1;

export interface MidiOptions {
  /** 기본 true: 휴머나이즈 적용된 연주 그대로 */
  humanize?: boolean;
  /** 기본 true: 믹서의 뮤트/솔로를 반영해 소리 나는 트랙만 내보낸다 */
  respectMixer?: boolean;
}

interface RawEvent {
  tick: number;
  /** 같은 tick에서 정렬 순서: 0 = 메타/CC/프로그램, 1 = note off, 2 = note on */
  order: number;
  bytes: number[];
}

const vlq = (n: number): number[] => {
  const out = [n & 0x7f];
  for (let v = n >> 7; v > 0; v >>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
};
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0) & 0x7f);
const utf8 = (s: string): number[] => Array.from(new TextEncoder().encode(s));
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 믹서 dB(-60..+6) → CC7 볼륨(0~127). 0dB = 100 */
export function dbToCc7(db: number): number {
  return clamp(Math.round(100 * 10 ** (db / 20)), 0, 127);
}

function chunk(type: string, data: number[]): number[] {
  return [...ascii(type), ...u32(data.length), ...data];
}

function trackChunk(raw: RawEvent[]): number[] {
  const sorted = raw
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.tick - b.e.tick || a.e.order - b.e.order || a.i - b.i);
  const data: number[] = [];
  let last = 0;
  for (const { e } of sorted) {
    data.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  data.push(0, 0xff, 0x2f, 0); // 트랙 끝
  return chunk("MTrk", data);
}

const meta = (type: number, payload: number[]): number[] => [0xff, type, ...vlq(payload.length), ...payload];

function noteEvents(e: NoteEvent, channel: number): RawEvent[] {
  const key = e.track === "drums" ? GM_DRUM_NOTE[e.lane!] : e.midi!;
  const tick = Math.round(e.time * PPQ);
  const beats = e.track === "drums" ? DRUM_HIT_BEATS : e.duration;
  const end = tick + Math.max(1, Math.round(beats * PPQ));
  const velocity = clamp(Math.round(e.velocity * 127), 1, 127);
  return [
    { tick, order: 2, bytes: [0x90 | channel, key, velocity] },
    { tick: end, order: 1, bytes: [0x80 | channel, key, 0] },
  ];
}

export function songToMidi(song: Song, options: MidiOptions = {}): Uint8Array<ArrayBuffer> {
  const { events } = songToEvents(song, { humanize: options.humanize ?? true });
  const respectMixer = options.respectMixer ?? true;
  const anySolo = TRACK_IDS.some((id) => song.mixer[id].solo);
  const audible = (id: TrackId): boolean =>
    !respectMixer || (anySolo ? song.mixer[id].solo : !song.mixer[id].mute);

  const tempo: RawEvent[] = [
    { tick: 0, order: 0, bytes: meta(0x03, utf8(song.meta.title || "Chord Studio")) },
    { tick: 0, order: 0, bytes: meta(0x51, u32(Math.round(60_000_000 / song.meta.bpm)).slice(1)) },
    { tick: 0, order: 0, bytes: meta(0x58, [4, 2, 24, 8]) }, // 4/4
  ];

  const tracks = [trackChunk(tempo)];
  for (const id of TRACK_IDS) {
    if (!audible(id)) continue;
    const ch = CHANNEL[id];
    const raw: RawEvent[] = [{ tick: 0, order: 0, bytes: meta(0x03, ascii(TRACK_NAME[id])) }];
    if (id !== "drums") raw.push({ tick: 0, order: 0, bytes: [0xc0 | ch, PROGRAM[id]] });
    raw.push({ tick: 0, order: 0, bytes: [0xb0 | ch, 7, dbToCc7(song.mixer[id].volume)] });
    for (const e of events) if (e.track === id) raw.push(...noteEvents(e, ch));
    tracks.push(trackChunk(raw));
  }

  return Uint8Array.from([...chunk("MThd", [...u16(1), ...u16(tracks.length), ...u16(PPQ)]), ...tracks.flat()]);
}
