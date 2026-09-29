import { describe, expect, it } from "vitest";
import { GM_DRUM_NOTE, dbToCc7, songToMidi } from "./midi";
import { generateSong } from "./generator";
import { songToEvents } from "./events";
import { defaultMixer } from "./schema";

interface Parsed {
  format: number;
  ppq: number;
  tracks: { name: string; ons: { tick: number; key: number; vel: number; ch: number }[]; offs: number; bytes: number[] }[];
  tempoUs: number;
}

/** 테스트용 최소 SMF 파서 */
function parse(data: Uint8Array): Parsed {
  let p = 0;
  const u32 = () => ((data[p++]! << 24) | (data[p++]! << 16) | (data[p++]! << 8) | data[p++]!) >>> 0;
  const u16 = () => (data[p++]! << 8) | data[p++]!;
  const tag = () => String.fromCharCode(data[p++]!, data[p++]!, data[p++]!, data[p++]!);
  expect(tag()).toBe("MThd");
  expect(u32()).toBe(6);
  const format = u16();
  const n = u16();
  const ppq = u16();
  const out: Parsed = { format, ppq, tracks: [], tempoUs: 0 };
  for (let t = 0; t < n; t++) {
    expect(tag()).toBe("MTrk");
    const len = u32();
    const end = p + len;
    const tr: Parsed["tracks"][number] = { name: "", ons: [], offs: 0, bytes: [] };
    let tick = 0;
    let running = 0;
    while (p < end) {
      let d = 0;
      let b: number;
      do {
        b = data[p++]!;
        d = (d << 7) | (b & 0x7f);
      } while (b & 0x80);
      tick += d;
      let st = data[p]!;
      if (st === 0xff) {
        p++;
        const type = data[p++]!;
        let l = 0;
        do {
          b = data[p++]!;
          l = (l << 7) | (b & 0x7f);
        } while (b & 0x80);
        const payload = Array.from(data.slice(p, p + l));
        p += l;
        if (type === 0x03) tr.name = new TextDecoder().decode(Uint8Array.from(payload));
        if (type === 0x51) out.tempoUs = (payload[0]! << 16) | (payload[1]! << 8) | payload[2]!;
        continue;
      }
      if (st & 0x80) {
        running = st;
        p++;
      } else st = running;
      const kind = st & 0xf0;
      const ch = st & 0x0f;
      if (kind === 0x90) {
        const key = data[p++]!;
        const vel = data[p++]!;
        if (vel > 0) tr.ons.push({ tick, key, vel, ch });
        else tr.offs++;
      } else if (kind === 0x80) {
        p += 2;
        tr.offs++;
      } else if (kind === 0xc0) p += 1;
      else if (kind === 0xb0) tr.bytes.push(data[p + 1]!), (p += 2);
      else throw new Error(`알 수 없는 상태 바이트 ${st}`);
    }
    out.tracks.push(tr);
  }
  expect(p).toBe(data.length);
  return out;
}

describe("songToMidi", () => {
  const song = generateSong({ genre: "pop", seed: 7 });

  it("format 1, PPQ 480, 템포가 BPM과 일치, 트랙 5개(템포+4악기)", () => {
    const m = parse(songToMidi(song));
    expect(m.format).toBe(1);
    expect(m.ppq).toBe(480);
    expect(m.tempoUs).toBe(Math.round(60_000_000 / song.meta.bpm));
    expect(m.tracks.map((t) => t.name)).toEqual([song.meta.title, "Piano", "Bass", "Drums", "Strings"]);
  });

  it("음 개수가 이벤트와 같고 note on/off가 짝을 이룬다", () => {
    const { events } = songToEvents(song, { humanize: true });
    const m = parse(songToMidi(song));
    for (const [i, id] of ["piano", "bass", "drums", "strings"].entries()) {
      const t = m.tracks[i + 1]!;
      expect(t.ons.length).toBe(events.filter((e) => e.track === id).length);
      expect(t.offs).toBe(t.ons.length);
    }
  });

  it("드럼은 채널 10(9)이고 GM 번호만 쓴다", () => {
    const drums = parse(songToMidi(song)).tracks[3]!;
    const gm = new Set(Object.values(GM_DRUM_NOTE));
    expect(drums.ons.every((o) => o.ch === 9 && gm.has(o.key))).toBe(true);
  });

  it("음높이·세기가 범위 안이고 같은 입력이면 같은 파일", () => {
    const m = parse(songToMidi(song));
    for (const t of m.tracks.slice(1)) expect(t.ons.every((o) => o.key >= 0 && o.key <= 127 && o.vel >= 1 && o.vel <= 127)).toBe(true);
    expect(songToMidi(song)).toEqual(songToMidi(song));
  });

  it("뮤트한 트랙은 빠지고, 솔로가 있으면 솔로만 남는다 (respectMixer)", () => {
    const muted = { ...song, mixer: { ...defaultMixer(), drums: { ...defaultMixer().drums, mute: true } } };
    expect(parse(songToMidi(muted)).tracks.map((t) => t.name)).not.toContain("Drums");
    const solo = { ...song, mixer: { ...defaultMixer(), bass: { ...defaultMixer().bass, solo: true } } };
    expect(parse(songToMidi(solo)).tracks.map((t) => t.name)).toEqual([song.meta.title, "Bass"]);
    expect(parse(songToMidi(muted, { respectMixer: false })).tracks.map((t) => t.name)).toContain("Drums");
  });

  it("dbToCc7: 0dB=100, 위/아래로 0~127에 묶인다", () => {
    expect(dbToCc7(0)).toBe(100);
    expect(dbToCc7(-60)).toBe(0);
    expect(dbToCc7(6)).toBe(127);
  });
});
