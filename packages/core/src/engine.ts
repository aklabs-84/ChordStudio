// 재생 엔진: Song → songToEvents → Tone.Transport 스케줄. 악기는 TrackInstrument로 갈아끼운다.
// 브라우저 전용(오디오 컨텍스트 필요). 사용자 클릭 뒤에 play()를 불러야 소리가 난다.
import * as Tone from "tone";
import { songToEvents, type NoteEvent } from "./events";
import { BEATS_PER_BAR, TRACK_IDS, type Song, type TrackId } from "./schema";
import { createInstruments } from "./samplers";
import { chordToMidiNotes, isValidChord } from "./theory";
export { STRINGS_VOICES, type StringsVoiceId } from "./samplers";
import type { TrackInstrument } from "./synths";

export interface EngineOptions {
  /** 악기 묶음을 직접 넘길 때 (테스트/교체용). 생략하면 sampleBaseUrl로 만든다 */
  instruments?: Record<TrackId, TrackInstrument>;
  /** 샘플 폴더 주소 (예: "/samples/"). 생략하면 전부 신스 */
  sampleBaseUrl?: string;
  /** 반복 없이 끝까지 재생되어 멈췄을 때 */
  onEnded?: () => void;
}

export interface Engine {
  /** 샘플 로딩이 끝나면 이행. 그 전에도 재생은 되지만 해당 악기는 신스로 나온다 */
  ready: Promise<void>;
  setSong(song: Song): void;
  /** false면 타이밍/세기 흔들림을 끈다 (스윙은 유지) */
  setHumanize(on: boolean): void;
  setLoop(loop: boolean): void;
  /** 재생 중 메트로놈 클릭음을 같이 들려줄지 (곡 데이터에는 저장되지 않는 로컬 재생 설정) */
  setMetronome(on: boolean): void;
  /** 메트로놈 음량 (dB) */
  setMetronomeVolume(db: number): void;
  setMixer(mixer: Song["mixer"]): void;
  /** 스트링 음색 바꾸기 (다음 음부터 적용) */
  setStringsVoice(id: string): void;
  /** 코드 기호의 화음을 피아노로 짧게 미리듣기 (재생/편집과 무관, 전개 스케줄을 건드리지 않는다) */
  previewChord(symbol: string): void;
  play(): Promise<void>;
  /** 현재 위치에서 멈춤 */
  pause(): void;
  /** 처음으로 되감으며 멈춤 */
  stop(): void;
  isPlaying(): boolean;
  /** 곡 처음부터 지금까지의 박 */
  getBeat(): number;
  dispose(): void;
}

/** 트랙별 리버브 보내는 양 (0~1). 드럼·피아노·스트링에 약간의 공간감. */
const REVERB_SEND: Record<TrackId, number> = { piano: 0.2, bass: 0, drums: 0.08, strings: 0.35 };

const MASTER_BOOST_DB = 11;

export function createEngine(options: EngineOptions = {}): Engine {
  const transport = Tone.getTransport();
  const ppq = transport.PPQ;
  const built = options.instruments
    ? { instruments: options.instruments, ready: Promise.resolve() }
    : createInstruments(options.sampleBaseUrl);
  const instruments = built.instruments;

  // 전체 음량을 키우고(+MASTER_BOOST_DB) 리미터가 찌그러짐을 막는다
  const limiter = new Tone.Limiter(-1).toDestination();
  const master = new Tone.Gain(Tone.dbToGain(MASTER_BOOST_DB)).connect(limiter);
  const reverb = new Tone.Reverb({ decay: 2.2, wet: 1 }).connect(master);
  // 메트로놈은 리버브·마스터 부스트를 거치지 않고 리미터로 바로 간다 (곡 음량과 독립적으로 들리게)
  const metronomeGain = new Tone.Gain(Tone.dbToGain(-12)).connect(limiter);
  const metronomeSynth = new Tone.Synth({
    oscillator: { type: "square" },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
  }).connect(metronomeGain);
  const channels = {} as Record<TrackId, Tone.Channel>;
  const sends: Tone.Gain[] = [];
  for (const id of TRACK_IDS) {
    channels[id] = new Tone.Channel().connect(master);
    instruments[id].output.connect(channels[id]);
    if (REVERB_SEND[id] > 0) {
      const send = new Tone.Gain(REVERB_SEND[id]);
      // 리버브 보냄은 채널(볼륨·뮤트·솔로) 뒤에서 갈라야, 뮤트/솔로한 악기의 잔향이 남지 않는다
      channels[id].connect(send);
      send.connect(reverb);
      sends.push(send);
    }
  }

  let song: Song | undefined;
  let humanize = true;
  let loop = true;
  let metronomeOn = false;
  let playing = false;

  const ticks = (beats: number): string => `${Math.round(beats * ppq)}i`;

  function schedule(): void {
    transport.cancel(0);
    if (!song) return;
    transport.bpm.value = song.meta.bpm;
    const { events, totalBeats } = songToEvents(song, { humanize });
    for (const e of events) {
      transport.schedule((time) => {
        const durationSec = (e.duration * 60) / transport.bpm.value;
        instruments[e.track].play(e, durationSec, time);
      }, ticks(e.time));
    }
    transport.loop = loop;
    transport.loopStart = 0;
    transport.loopEnd = ticks(totalBeats);
    if (!loop) {
      transport.schedule(() => {
        transport.stop();
        playing = false;
        options.onEnded?.();
      }, ticks(totalBeats));
    }
    if (metronomeOn) {
      // 매 박(4분음표)마다 클릭. 마디 첫 박(절대 박수가 BEATS_PER_BAR의 배수)만 높은 음으로 악센트.
      transport.scheduleRepeat((time) => {
        const beatIndex = Math.round(transport.getTicksAtTime(time) / ppq);
        const accent = beatIndex % BEATS_PER_BAR === 0;
        metronomeSynth.triggerAttackRelease(accent ? "C6" : "G5", 0.03, time);
      }, "4n", 0);
    }
  }

  function applyMixer(mixer: Song["mixer"]): void {
    for (const id of TRACK_IDS) {
      const c = mixer[id];
      channels[id].volume.value = c.volume;
      channels[id].mute = c.mute;
      channels[id].solo = c.solo;
    }
  }

  return {
    ready: built.ready,
    setSong(next) {
      song = next;
      applyMixer(next.mixer);
      schedule();
    },
    setHumanize(on) {
      humanize = on;
      schedule();
    },
    setLoop(on) {
      loop = on;
      schedule();
    },
    setMetronome(on) {
      metronomeOn = on;
      schedule();
    },
    setMetronomeVolume(db) {
      metronomeGain.gain.value = Tone.dbToGain(db);
    },
    setMixer: applyMixer,
    setStringsVoice: (id) => instruments.strings.setVoice?.(id),
    previewChord(symbol) {
      if (!isValidChord(symbol)) return;
      void Tone.start();
      const time = Tone.now();
      const durationSec = 0.7;
      for (const midi of chordToMidiNotes(symbol)) {
        const e: NoteEvent = { track: "piano", time: 0, duration: 0, midi, velocity: 0.8 };
        instruments.piano.play(e, durationSec, time);
      }
    },
    async play() {
      await Tone.start();
      await reverb.ready;
      if (!song || playing) return;
      playing = true;
      transport.start("+0.05");
    },
    pause() {
      transport.pause();
      playing = false;
    },
    stop() {
      transport.stop();
      playing = false;
    },
    isPlaying: () => playing,
    getBeat: () => transport.ticks / ppq,
    dispose() {
      transport.stop();
      transport.cancel(0);
      for (const id of TRACK_IDS) {
        instruments[id].dispose();
        channels[id].dispose();
      }
      sends.forEach((s) => s.dispose());
      reverb.dispose();
      master.dispose();
      limiter.dispose();
      metronomeSynth.dispose();
      metronomeGain.dispose();
    },
  };
}
