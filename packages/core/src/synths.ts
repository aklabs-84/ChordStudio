// 임시 신스 음색. 샘플을 붙이기 전에도 소리가 나고, 나중에 샘플 악기로 하나씩 갈아끼운다.
// 엔진은 TrackInstrument 인터페이스만 알기 때문에 교체해도 엔진 코드는 바뀌지 않는다.
// (Tone.js는 브라우저 오디오가 필요해서 index.ts에서 export하지 않는다 → "@chord-studio/core/engine"으로만 가져온다)
import * as Tone from "tone";
import type { DrumLane, TrackId } from "./schema";
import type { NoteEvent } from "./events";

export interface TrackInstrument {
  output: Tone.ToneAudioNode;
  play(event: NoteEvent, durationSec: number, time: number): void;
  /** 음색을 고를 수 있는 악기만 (예: 스트링) */
  setVoice?(id: string): void;
  dispose(): void;
}

const freq = (midi: number): number => Tone.Frequency(midi, "midi").toFrequency();

function piano(): TrackInstrument {
  const out = new Tone.Filter(4200, "lowpass");
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "triangle" },
    envelope: { attack: 0.004, decay: 0.7, sustain: 0.12, release: 1.1 },
  }).connect(out);
  synth.maxPolyphony = 32;
  synth.volume.value = -8;
  return {
    output: out,
    play: (e, dur, time) => synth.triggerAttackRelease(freq(e.midi!), dur, time, e.velocity),
    dispose: () => {
      synth.dispose();
      out.dispose();
    },
  };
}

function bass(): TrackInstrument {
  const out = new Tone.Filter(900, "lowpass");
  const synth = new Tone.MonoSynth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.25 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.3, baseFrequency: 150, octaves: 2 },
  }).connect(out);
  return {
    output: out,
    play: (e, dur, time) => synth.triggerAttackRelease(freq(e.midi!), dur, time, e.velocity),
    dispose: () => {
      synth.dispose();
      out.dispose();
    },
  };
}

function strings(): TrackInstrument {
  const out = new Tone.Filter(1800, "lowpass");
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 1.4 },
  }).connect(out);
  synth.maxPolyphony = 32;
  synth.volume.value = -16;
  return {
    output: out,
    play: (e, dur, time) => synth.triggerAttackRelease(freq(e.midi!), dur, time, e.velocity),
    dispose: () => {
      synth.dispose();
      out.dispose();
    },
  };
}

type DrumHit = (velocity: number, durationSec: number, time: number) => void;

function drums(): TrackInstrument {
  const out = new Tone.Gain(1);
  const disposables: Tone.ToneAudioNode[] = [out];
  const track = <T extends Tone.ToneAudioNode>(node: T): T => {
    disposables.push(node);
    return node;
  };

  const kick = track(new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.32, sustain: 0, release: 0.1 },
  })).connect(out);

  const snareNoise = track(new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.16, sustain: 0 },
  }));
  const snareFilter = track(new Tone.Filter(1800, "bandpass")).connect(out);
  snareNoise.connect(snareFilter);
  snareNoise.volume.value = -6;
  const snareBody = track(new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
  })).connect(out);
  snareBody.volume.value = -8;

  const rim = track(new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  })).connect(out);
  rim.volume.value = -6;

  const metal = (decay: number, frequency: number, volume: number) => {
    const m = track(new Tone.MetalSynth({
      envelope: { attack: 0.001, decay, release: 0.02 },
      harmonicity: 5.1,
      modulationIndex: 32,
      resonance: 4200,
      octaves: 1.5,
    })).connect(out);
    m.frequency.value = frequency;
    m.volume.value = volume;
    return m;
  };
  const hhClosed = metal(0.05, 250, -24);
  const hhOpen = metal(0.35, 250, -24);
  const ride = metal(0.9, 320, -26);
  const crash = metal(1.6, 220, -20);

  const tom = (pitch: string) => {
    const t = track(new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    })).connect(out);
    return (velocity: number, time: number) => t.triggerAttackRelease(pitch, "8n", time, velocity);
  };
  const tomHi = tom("G2");
  const tomLow = tom("D2");

  const hits: Record<DrumLane, DrumHit> = {
    kick: (v, _d, t) => kick.triggerAttackRelease("C1", "8n", t, v),
    snare: (v, _d, t) => {
      snareNoise.triggerAttackRelease("16n", t, v);
      snareBody.triggerAttackRelease("E2", "16n", t, v);
    },
    rim: (v, _d, t) => rim.triggerAttackRelease("A3", "32n", t, v),
    hhClosed: (v, _d, t) => hhClosed.triggerAttackRelease("32n", t, v),
    hhOpen: (v, _d, t) => hhOpen.triggerAttackRelease("8n", t, v),
    ride: (v, _d, t) => ride.triggerAttackRelease("8n", t, v),
    crash: (v, _d, t) => crash.triggerAttackRelease("4n", t, v),
    tomHi: (v, _d, t) => tomHi(v, t),
    tomLow: (v, _d, t) => tomLow(v, t),
  };

  return {
    output: out,
    play: (e, dur, time) => hits[e.lane!](e.velocity, dur, time),
    dispose: () => disposables.forEach((n) => n.dispose()),
  };
}

export function createSynthInstruments(): Record<TrackId, TrackInstrument> {
  return { piano: piano(), bass: bass(), drums: drums(), strings: strings() };
}
