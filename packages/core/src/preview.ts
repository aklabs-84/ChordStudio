// 레슨 예제음 재생: 곡 전체 스케줄(engine.ts)과 무관하게, 코드 하나·짧은 리듬 몇 박처럼
// 아주 짧은 예제를 즉석에서 재생한다. Transport 없이 Tone.now() 기준으로 악기를 직접 트리거한다.
// 브라우저 전용(오디오 컨텍스트 필요) — 반드시 사용자 클릭 안에서 호출해야 소리가 난다.
import * as Tone from "tone";
import { createInstruments } from "./samplers";
import { TRACK_IDS, type DrumLane, type TrackId } from "./schema";
import type { TrackInstrument } from "./synths";

export interface PreviewNote {
  track: TrackId;
  /** 시작 시각 (초, 재생 시작 시점부터) */
  at: number;
  /** 길이 (초) */
  dur: number;
  /** 피치 음: MIDI 번호. 드럼은 없음 */
  midi?: number;
  /** 드럼: 레인 이름 */
  lane?: DrumLane;
  /** 0~1, 기본 0.8 */
  velocity?: number;
}

let instruments: Record<TrackId, TrackInstrument> | null = null;

/** 레슨 패널과 같은 sampleBaseUrl로 한 번만 만들어 재사용한다(버튼마다 새로 만들지 않음). */
function getInstruments(sampleBaseUrl?: string): Record<TrackId, TrackInstrument> {
  if (!instruments) {
    const built = createInstruments(sampleBaseUrl);
    const limiter = new Tone.Limiter(-1).toDestination();
    // 레슨1·2 같은 성긴 단일음 예제는 크게 키워야 들리지만, 레슨3 장르 예제(genreListenNotes)처럼
    // 피아노+베이스+드럼이 동시에 겹치는 경우 그대로 +11dB를 더하면 리미터 앞에서 클리핑이 났다.
    // 컴프레서로 겹칠 때만 압축한 뒤 더 낮은 메이크업 게인을 더해, 단일음은 여전히 들릴 만큼 키우면서
    // 다중 트랙 합주는 찌그러지지 않게 한다.
    const compressor = new Tone.Compressor({ threshold: -18, ratio: 4, attack: 0.003, release: 0.15 }).connect(
      limiter,
    );
    const master = new Tone.Gain(Tone.dbToGain(6)).connect(compressor);
    for (const id of TRACK_IDS) built.instruments[id].output.connect(master);
    instruments = built.instruments;
  }
  return instruments;
}

export async function playPreview(notes: PreviewNote[], sampleBaseUrl?: string): Promise<void> {
  await Tone.start();
  const insts = getInstruments(sampleBaseUrl);
  const start = Tone.now() + 0.05;
  for (const n of notes) {
    const event = { track: n.track, time: n.at, duration: n.dur, midi: n.midi, lane: n.lane, velocity: n.velocity ?? 0.8 };
    insts[n.track].play(event, n.dur, start + n.at);
  }
}
