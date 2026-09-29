// 재생 엔진: Song → songToEvents → Tone.Transport 스케줄. 악기는 TrackInstrument로 갈아끼운다.
// 브라우저 전용(오디오 컨텍스트 필요). 사용자 클릭 뒤에 play()를 불러야 소리가 난다.
import * as Tone from "tone";
import { songToEvents } from "./events";
import { TRACK_IDS, type Song, type TrackId } from "./schema";
import { createInstruments } from "./samplers";
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
  setMixer(mixer: Song["mixer"]): void;
  /** 스트링 음색 바꾸기 (다음 음부터 적용) */
  setStringsVoice(id: string): void;
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
      transport.schedule((time) => {
        transport.stop();
        playing = false;
        Tone.getDraw().schedule(() => options.onEnded?.(), time);
      }, ticks(totalBeats));
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
    setMixer: applyMixer,
    setStringsVoice: (id) => instruments.strings.setVoice?.(id),
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
    },
  };
}
