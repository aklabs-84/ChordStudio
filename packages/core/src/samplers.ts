// 샘플 악기. 로딩이 끝나기 전에는 신스가 대신 소리를 내서 재생이 끊기지 않는다.
// 샘플 파일은 public/samples/ 아래에 직접 호스팅한다 (출처·라이선스: SAMPLES.md, 각 폴더의 CREDITS.txt).
import * as Tone from "tone";
import type { DrumLane, TrackId } from "./schema";
import { createSynthInstruments, type TrackInstrument } from "./synths";

/** Salamander Grand Piano: 3반음 간격 30개 (파일명의 s = 샵). */
const PIANO_FILES = [
  "A0", "C1", "Ds1", "Fs1", "A1", "C2", "Ds2", "Fs2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4",
  "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6", "A6", "C7", "Ds7", "Fs7", "A7", "C8",
];
const pianoUrls = (): Record<string, string> =>
  Object.fromEntries(PIANO_FILES.map((f) => [f.replace("s", "#"), `${f}.mp3`]));

interface Loadable {
  instrument: TrackInstrument;
  ready: Promise<void>;
}

/** 샘플러가 준비되면 샘플러로, 아니면 fallback으로 소리를 낸다. */
function sampled(sampler: Tone.Sampler, fallback: TrackInstrument, volume: number, mono = false): Loadable {
  const out = new Tone.Gain(1);
  fallback.output.connect(out);
  sampler.connect(out);
  sampler.volume.value = volume;
  const ready = Tone.loaded().then(() => undefined);
  return {
    ready,
    instrument: {
      output: out,
      play: (e, dur, time) => {
        if (sampler.loaded) {
          if (mono) sampler.releaseAll(time);
          sampler.triggerAttackRelease(Tone.Frequency(e.midi!, "midi").toFrequency(), dur, time, e.velocity);
        } else fallback.play(e, dur, time);
      },
      dispose: () => {
        sampler.dispose();
        fallback.dispose();
        out.dispose();
      },
    },
  };
}

export function createPianoSampler(baseUrl: string, fallback: TrackInstrument): Loadable {
  const sampler = new Tone.Sampler({ urls: pianoUrls(), baseUrl, release: 1 });
  return sampled(sampler, fallback, -4);
}

/** Black and Blue Basses(darkblack, mf): 흰 건반 13개(B1~G3) × 라운드로빈 4개. 파일명은 `${음}_${번호}.mp3`. */
const BASS_NOTES = ["B1", "C2", "D2", "E2", "F2", "G2", "A2", "B2", "C3", "D3", "E3", "F3", "G3"];
const BASS_RR = 4;
/** 노트는 E1~D#2(41~78Hz)라 노트북 스피커로는 안 들리고 샘플 범위(B1~)보다도 낮다.
 *  재생 때만 한 옥타브 올린다 (곡 데이터·MIDI 내보내기는 그대로). */
const BASS_PLAY_OCTAVE = 1;
const BASS_GAIN_DB = 3;

export function createBassSampler(baseUrl: string, fallback: TrackInstrument): Loadable {
  const urls: Record<string, string> = {};
  for (const n of BASS_NOTES) for (let r = 1; r <= BASS_RR; r++) urls[`${n}_${r}`] = `${n.toLowerCase()}_${r}.mp3`;
  const buffers = new Tone.ToneAudioBuffers({ urls, baseUrl });
  const out = new Tone.Gain(1);
  fallback.output.connect(out);
  const sampleMidi = BASS_NOTES.map((n) => Tone.Frequency(n).toMidi());
  const ready = Tone.loaded().then(() => undefined);
  let lastRr = 0;
  let current: { src: Tone.ToneBufferSource; gain: Tone.Gain } | undefined;

  return {
    ready,
    instrument: {
      output: out,
      play: (e, dur, time) => {
        if (!buffers.loaded) return fallback.play(e, dur, time);
        const midi = e.midi! + BASS_PLAY_OCTAVE * 12;
        // 가장 가까운 샘플 음을 골라 나머지는 피치를 옮긴다
        let idx = 0;
        sampleMidi.forEach((m, i) => {
          if (Math.abs(m - midi) < Math.abs(sampleMidi[idx]! - midi)) idx = i;
        });
        // 같은 녹음이 연달아 나오지 않게 번호를 돌린다
        lastRr = (lastRr % BASS_RR) + 1;
        const src = new Tone.ToneBufferSource(buffers.get(`${BASS_NOTES[idx]}_${lastRr}`));
        src.playbackRate.value = 2 ** ((midi - sampleMidi[idx]!) / 12);
        const gain = new Tone.Gain(Tone.dbToGain(BASS_GAIN_DB) * (0.55 + 0.45 * e.velocity));
        src.connect(gain);
        gain.connect(out);
        // 단음 악기: 새 음이 오면 앞 음을 짧게 줄여 끊는다
        if (current) {
          current.gain.gain.cancelScheduledValues(time);
          current.gain.gain.setTargetAtTime(0, time, 0.02);
          current.src.stop(time + 0.15);
        }
        // 음 길이가 끝나면 릴리스
        gain.gain.setValueAtTime(gain.gain.value, time + dur);
        gain.gain.setTargetAtTime(0, time + dur, 0.06);
        src.start(time);
        src.stop(time + dur + 0.4);
        const mine = { src, gain };
        current = mine;
        src.onended = () => {
          if (current === mine) current = undefined;
          src.dispose();
          gain.dispose();
        };
      },
      dispose: () => {
        buffers.dispose();
        fallback.dispose();
        out.dispose();
      },
    },
  };
}

/** 스트링 음색 후보. 폴더는 public/samples/strings/<id>/, 음마다 `${음}.mp3` (소문자, 실제 음높이).
 *  현악 앙상블 1: FluidR3 GM (CC BY 3.0).
 *  샘플 가운데 구간을 반복(루프)해서 긴 코드도 이어 낸다. */
export const STRINGS_VOICES = {
  ensemble1: { label: "현악 앙상블 1", top: "A6", loop: [1.0, 2.9], attack: 0.2, release: 0.8 },
} as const satisfies Record<string, { label: string; top: string; loop: [number, number]; attack: number; release: number }>;
export type StringsVoiceId = keyof typeof STRINGS_VOICES;
const STRINGS_NOTES = ["C", "Eb", "Gb", "A"].flatMap((n) => [2, 3, 4, 5, 6].map((o) => `${n}${o}`));
STRINGS_NOTES.sort((a, b) => Tone.Frequency(a).toMidi() - Tone.Frequency(b).toMidi());
const STRINGS_GAIN_DB = 0;

export function createStringsSampler(baseUrl: string, fallback: TrackInstrument): Loadable {
  const ids = Object.keys(STRINGS_VOICES) as StringsVoiceId[];
  // 음색마다 가진 음이 다르다 (첼로는 C6까지)
  const notesOf = (id: StringsVoiceId): string[] => {
    const top = Tone.Frequency(STRINGS_VOICES[id].top).toMidi();
    return STRINGS_NOTES.filter((n) => Tone.Frequency(n).toMidi() <= top);
  };
  const buffers = Object.fromEntries(
    ids.map((id) => [
      id,
      new Tone.ToneAudioBuffers({
        urls: Object.fromEntries(notesOf(id).map((n) => [n, `${n.toLowerCase()}.mp3`])),
        baseUrl: `${baseUrl}${id}/`,
      }),
    ]),
  ) as Record<StringsVoiceId, Tone.ToneAudioBuffers>;
  let voice: StringsVoiceId = "ensemble1";
  const out = new Tone.Gain(Tone.dbToGain(STRINGS_GAIN_DB));
  fallback.output.connect(out);
  const ready = Tone.loaded().then(() => undefined);

  return {
    ready,
    instrument: {
      output: out,
      setVoice: (id) => {
        if (id in STRINGS_VOICES) voice = id as StringsVoiceId;
      },
      play: (e, dur, time) => {
        const bufs = buffers[voice];
        if (!bufs.loaded) return fallback.play(e, dur, time);
        const cfg = STRINGS_VOICES[voice];
        const midi = e.midi!;
        const notes = notesOf(voice);
        let best = notes[0]!;
        for (const n of notes) {
          if (Math.abs(Tone.Frequency(n).toMidi() - midi) < Math.abs(Tone.Frequency(best).toMidi() - midi)) best = n;
        }
        const src = new Tone.ToneBufferSource(bufs.get(best));
        src.playbackRate.value = 2 ** ((midi - Tone.Frequency(best).toMidi()) / 12);
        src.loop = true;
        src.loopStart = cfg.loop[0];
        src.loopEnd = cfg.loop[1];
        const peak = 0.4 + 0.6 * e.velocity;
        const gain = new Tone.Gain(0);
        src.connect(gain);
        gain.connect(out);
        // 페이드인 후 음 길이가 끝나면 릴리스
        const end = time + Math.max(dur, cfg.attack);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(peak, time + cfg.attack);
        gain.gain.setValueAtTime(peak, end);
        gain.gain.linearRampToValueAtTime(0, end + cfg.release);
        src.start(time);
        src.stop(end + cfg.release + 0.05);
        src.onended = () => {
          src.dispose();
          gain.dispose();
        };
      },
      dispose: () => {
        ids.forEach((id) => buffers[id].dispose());
        fallback.dispose();
        out.dispose();
      },
    },
  };
}

/** Virtuosity Drums: 레인마다 세기 3단계(약/중/강) × 라운드로빈 파일 수. 파일명은 `${lane}_${세기}_${번호}.mp3`. */
const DRUM_FILES: Record<DrumLane, number[]> = {
  kick: [2, 2, 2], snare: [1, 1, 1], rim: [1, 1, 1], hhClosed: [2, 2, 2], hhOpen: [2, 2, 2],
  ride: [2, 2, 2], crash: [2, 2, 2], tomHi: [1, 1, 1], tomLow: [1, 1, 1],
};
/** 레인별 음량 보정(dB). 샘플 원본 음량 차이를 맞춘다. */
const DRUM_TRIM: Record<DrumLane, number> = {
  kick: 0, snare: 0, rim: 0, hhClosed: -3, hhOpen: -3, ride: -4, crash: -4, tomHi: -1, tomLow: -1,
};

export function createDrumSampler(baseUrl: string, fallback: TrackInstrument): Loadable {
  const urls: Record<string, string> = {};
  for (const [lane, layers] of Object.entries(DRUM_FILES)) {
    layers.forEach((count, l) => {
      for (let r = 1; r <= count; r++) urls[`${lane}_${l + 1}_${r}`] = `${lane}_${l + 1}_${r}.mp3`;
    });
  }
  const buffers = new Tone.ToneAudioBuffers({ urls, baseUrl });
  const out = new Tone.Gain(1);
  fallback.output.connect(out);
  const lastRr: Partial<Record<DrumLane, number>> = {};
  const ready = Tone.loaded().then(() => undefined);

  return {
    ready,
    instrument: {
      output: out,
      play: (e, dur, time) => {
        const lane = e.lane!;
        if (!buffers.loaded) return fallback.play(e, dur, time);
        const counts = DRUM_FILES[lane];
        const layer = e.velocity < 0.45 ? 0 : e.velocity < 0.78 ? 1 : 2;
        // 같은 소리가 연달아 나오지 않게 번호를 돌린다
        const rr = ((lastRr[lane] ?? 0) % counts[layer]!) + 1;
        lastRr[lane] = rr;
        const src = new Tone.ToneBufferSource(buffers.get(`${lane}_${layer + 1}_${rr}`));
        const gain = new Tone.Gain(Tone.dbToGain(DRUM_TRIM[lane]) * (0.6 + 0.4 * e.velocity)).connect(out);
        src.connect(gain);
        src.onended = () => {
          src.dispose();
          gain.dispose();
        };
        src.start(time);
      },
      dispose: () => {
        buffers.dispose();
        fallback.dispose();
        out.dispose();
      },
    },
  };
}

/** 트랙별 악기 묶음. 샘플이 있는 악기는 샘플로, 없는 악기는 신스로. */
export function createInstruments(sampleBaseUrl?: string): {
  instruments: Record<TrackId, TrackInstrument>;
  ready: Promise<void>;
} {
  const instruments = createSynthInstruments();
  if (!sampleBaseUrl) return { instruments, ready: Promise.resolve() };
  const piano = createPianoSampler(`${sampleBaseUrl}piano/`, instruments.piano);
  instruments.piano = piano.instrument;
  const bass = createBassSampler(`${sampleBaseUrl}bass/`, instruments.bass);
  instruments.bass = bass.instrument;
  const drums = createDrumSampler(`${sampleBaseUrl}drums/`, instruments.drums);
  instruments.drums = drums.instrument;
  const strings = createStringsSampler(`${sampleBaseUrl}strings/`, instruments.strings);
  instruments.strings = strings.instrument;
  return {
    instruments,
    ready: Promise.all([piano.ready, bass.ready, drums.ready, strings.ready]).then(() => undefined),
  };
}
