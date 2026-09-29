// Song 스키마: 앱 1·앱 2·생성기·엔진·내보내기가 공유하는 곡 데이터 형식.
// 모든 패턴은 16분음표 16스텝(= 1마디, 4/4)이며 값은 세기(0=쉼, 0~1).
import { isValidChord } from "./theory";

export const STEPS_PER_BAR = 16;
export const BEATS_PER_BAR = 4;

export const TRACK_IDS = ["piano", "bass", "drums", "strings"] as const;
export type TrackId = (typeof TRACK_IDS)[number];

export const DRUM_LANES = ["kick", "snare", "rim", "hhClosed", "hhOpen", "tomHi", "tomLow", "ride", "crash"] as const;
export type DrumLane = (typeof DRUM_LANES)[number];

export const GENRES = ["pop", "lofi", "rock", "jazz"] as const;
export type Genre = (typeof GENRES)[number];

/**
 * 16스텝 세기 배열. main = 일반 마디, first = 섹션 첫 마디(크래시 등), last = 섹션 마지막 마디(필인).
 * first/last가 없으면 main을 쓰고, 1마디짜리 섹션처럼 겹치면 last가 우선한다.
 */
export interface StepPattern {
  main: number[];
  first?: number[];
  last?: number[];
  /** true면 이 섹션에서 소리를 내지 않는다(칸 값은 그대로 보존) */
  muted?: boolean;
}

/** 섹션 안 barIndex(0부터)번째 마디에 적용할 16스텝을 고른다. */
export function resolveBarPattern(p: StepPattern, barIndex: number, bars: number): number[] {
  if (barIndex === bars - 1 && p.last) return p.last;
  if (barIndex === 0 && p.first) return p.first;
  return p.main;
}

export type PianoStyle = "chord" | "arp-up" | "arp-updown" | "broken";

export interface PianoTrack {
  style: PianoStyle;
  pattern: StepPattern;
}

export interface BassTrack {
  pattern: StepPattern;
  /** 코드가 바뀌기 직전 스텝에 다음 근음으로 접근하는 경과음을 넣을지 */
  approach: boolean;
}

export interface DrumTrack {
  lanes: Partial<Record<DrumLane, StepPattern>>;
}

export interface StringsTrack {
  /** 코드 길이만큼 늘어지는 패드면 pattern 생략 가능 */
  pattern?: StepPattern;
}

export interface ChordSlot {
  /** 코드 기호 (예: "Cmaj7", "F#m7b5", "C/E") */
  symbol: string;
  /** 박자 수 (>0). 한 섹션의 합 = bars × 4 */
  beats: number;
}

export interface Section {
  id: string;
  name: string;
  bars: number;
  chords: ChordSlot[];
  tracks: {
    piano: PianoTrack;
    bass: BassTrack;
    drums: DrumTrack;
    strings?: StringsTrack;
  };
}

export interface MixerChannel {
  /** dB (-60 ~ +6) */
  volume: number;
  mute: boolean;
  solo: boolean;
}

export interface SongMeta {
  title: string;
  /** 조성 (예: "C", "Bb", "Dm") */
  key: string;
  bpm: number;
  genre: Genre;
  /** 0(스트레이트) ~ 1(최대 스윙) */
  swing: number;
  /** 타이밍 흔들림 최대 ms (0 = 정확) */
  humanizeMs: number;
  /** 생성기 시드. 같은 시드+설정이면 같은 곡 */
  seed?: number;
}

export interface Song {
  /** 스키마 버전. 형식이 바뀌면 올린다(저장/공유 링크 호환용) */
  version: 1;
  meta: SongMeta;
  sections: Section[];
  /** 재생 순서: 섹션 id 목록 (같은 섹션 반복 가능) */
  arrangement: string[];
  mixer: Record<TrackId, MixerChannel>;
}

/** 불러온 곡이 엔진·화면을 멈추지 않도록 거는 크기 상한. 생성기·편집 함수도 이 안에서만 곡을 키운다. */
export const SONG_LIMITS = {
  sections: 16,
  sectionBars: 64,
  sectionChords: 64,
  arrangement: 64,
  totalBars: 512,
  textChars: 100,
  minChordBeats: 0.5,
} as const;

export const PIANO_STYLES: readonly PianoStyle[] = ["chord", "arp-up", "arp-updown", "broken"];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function checkPattern(errors: string[], where: string, values: unknown, required: boolean): void {
  if (values === undefined) {
    if (required) errors.push(`${where}: 패턴이 없습니다`);
    return;
  }
  if (!Array.isArray(values)) {
    errors.push(`${where}: 스텝 배열이어야 합니다`);
    return;
  }
  if (values.length !== STEPS_PER_BAR) {
    errors.push(`${where}: 스텝은 ${STEPS_PER_BAR}개여야 합니다 (현재 ${values.length}개)`);
    return;
  }
  if (values.some((v) => typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1)) {
    errors.push(`${where}: 세기는 0~1 범위여야 합니다`);
  }
}

/** main은 필수, first·last는 있을 때만 검사한다. required=false면 패턴 전체를 생략할 수 있다. */
function checkStepPattern(errors: string[], where: string, p: unknown, required: boolean): void {
  if (p === undefined) {
    if (required) errors.push(`${where}: 패턴이 없습니다`);
    return;
  }
  if (!isObj(p)) {
    errors.push(`${where}: 패턴 형식이 올바르지 않습니다`);
    return;
  }
  checkPattern(errors, `${where}.main`, p.main, true);
  checkPattern(errors, `${where}.first`, p.first, false);
  checkPattern(errors, `${where}.last`, p.last, false);
  if (p.muted !== undefined && typeof p.muted !== "boolean") errors.push(`${where}.muted는 true/false여야 합니다`);
}

function checkSection(errors: string[], section: unknown, index: number, ids: Set<string>): number {
  if (!isObj(section)) {
    errors.push(`섹션 ${index + 1}: 형식이 올바르지 않습니다`);
    return 0;
  }
  const at = `섹션 ${index + 1}`;
  if (!isText(section.id, SONG_LIMITS.textChars)) errors.push(`${at}: id는 ${SONG_LIMITS.textChars}자 이하 문자열이어야 합니다`);
  else if (ids.has(section.id)) errors.push(`${at}: id "${section.id}"가 중복됩니다`);
  else ids.add(section.id);
  if (!isText(section.name, SONG_LIMITS.textChars)) errors.push(`${at}: name은 ${SONG_LIMITS.textChars}자 이하 문자열이어야 합니다`);

  const bars = section.bars;
  const barsOk = typeof bars === "number" && Number.isInteger(bars) && bars >= 1 && bars <= SONG_LIMITS.sectionBars;
  if (!barsOk) errors.push(`${at}: bars는 1~${SONG_LIMITS.sectionBars} 사이 정수여야 합니다`);

  const chords = section.chords;
  if (!Array.isArray(chords) || chords.length === 0 || chords.length > SONG_LIMITS.sectionChords) {
    errors.push(`${at}: 코드는 1~${SONG_LIMITS.sectionChords}개여야 합니다`);
  } else {
    let beats = 0;
    chords.forEach((c: unknown, i) => {
      if (!isObj(c)) return void errors.push(`${at}: 코드 ${i + 1} 형식이 올바르지 않습니다`);
      if (typeof c.symbol !== "string" || !isValidChord(c.symbol)) errors.push(`${at}: 코드 ${i + 1} "${String(c.symbol)}"를 해석할 수 없습니다`);
      if (typeof c.beats !== "number" || !Number.isFinite(c.beats) || c.beats < SONG_LIMITS.minChordBeats) {
        errors.push(`${at}: 코드 ${i + 1}의 beats는 ${SONG_LIMITS.minChordBeats} 이상이어야 합니다`);
      } else beats += c.beats;
    });
    if (barsOk && beats !== (bars as number) * BEATS_PER_BAR) {
      errors.push(`${at}: 코드 박자 합(${beats})이 마디 수×4(${(bars as number) * BEATS_PER_BAR})와 다릅니다`);
    }
  }

  const tracks = section.tracks;
  if (!isObj(tracks)) {
    errors.push(`${at}: tracks가 없습니다`);
    return barsOk ? (bars as number) : 0;
  }
  const { piano, bass, drums, strings } = tracks;
  if (!isObj(piano)) errors.push(`${at} piano: 트랙이 없습니다`);
  else {
    if (!PIANO_STYLES.includes(piano.style as PianoStyle)) errors.push(`${at} piano: 알 수 없는 스타일 "${String(piano.style)}"`);
    checkStepPattern(errors, `${at} piano`, piano.pattern, true);
  }
  if (!isObj(bass)) errors.push(`${at} bass: 트랙이 없습니다`);
  else {
    if (typeof bass.approach !== "boolean") errors.push(`${at} bass: approach는 true/false여야 합니다`);
    checkStepPattern(errors, `${at} bass`, bass.pattern, true);
  }
  if (!isObj(drums) || !isObj(drums.lanes)) errors.push(`${at} drums: lanes가 없습니다`);
  else {
    for (const [lane, p] of Object.entries(drums.lanes)) {
      if (!(DRUM_LANES as readonly string[]).includes(lane)) errors.push(`${at}: 알 수 없는 드럼 레인 "${lane}"`);
      checkStepPattern(errors, `${at} drums.${lane}`, p, true);
    }
  }
  if (strings !== undefined) {
    if (!isObj(strings)) errors.push(`${at} strings: 형식이 올바르지 않습니다`);
    else checkStepPattern(errors, `${at} strings`, strings.pattern, false);
  }
  return barsOk ? (bars as number) : 0;
}

/** Song을 검사해 오류 메시지 목록을 돌려준다. 빈 배열이면 유효. 외부에서 온 값이라도 예외 없이 검사한다. */
export function validateSong(input: Song): string[] {
  const errors: string[] = [];
  const song: unknown = input;
  if (!isObj(song)) return ["곡 형식이 올바르지 않습니다"];
  const meta = song.meta;
  if (song.version !== 1) errors.push(`지원하지 않는 스키마 버전: ${String(song.version)}`);

  if (!isObj(meta)) errors.push("meta가 없습니다");
  else {
    if (!isText(meta.title, SONG_LIMITS.textChars)) errors.push(`meta.title은 ${SONG_LIMITS.textChars}자 이하 문자열이어야 합니다`);
    if (typeof meta.bpm !== "number" || !Number.isFinite(meta.bpm) || meta.bpm < 40 || meta.bpm > 240) errors.push("meta.bpm은 40~240이어야 합니다");
    if (typeof meta.swing !== "number" || !Number.isFinite(meta.swing) || meta.swing < 0 || meta.swing > 1) errors.push("meta.swing은 0~1이어야 합니다");
    if (typeof meta.humanizeMs !== "number" || !Number.isFinite(meta.humanizeMs) || meta.humanizeMs < 0 || meta.humanizeMs > 50) {
      errors.push("meta.humanizeMs는 0~50이어야 합니다");
    }
    if (!(GENRES as readonly unknown[]).includes(meta.genre)) errors.push(`알 수 없는 장르: ${String(meta.genre)}`);
    if (typeof meta.key !== "string" || !isValidKey(meta.key)) errors.push(`meta.key가 올바르지 않습니다: "${String(meta.key)}"`);
    if (meta.seed !== undefined && !(typeof meta.seed === "number" && Number.isInteger(meta.seed) && meta.seed >= 0 && meta.seed <= 2 ** 31)) {
      errors.push("meta.seed는 0~2147483648 사이 정수여야 합니다");
    }
  }

  const sections = song.sections;
  const ids = new Set<string>();
  const barsById = new Map<string, number>();
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > SONG_LIMITS.sections) {
    errors.push(`섹션은 1~${SONG_LIMITS.sections}개여야 합니다`);
  } else {
    sections.forEach((section: unknown, i) => {
      const bars = checkSection(errors, section, i, ids);
      if (isObj(section) && typeof section.id === "string") barsById.set(section.id, bars);
    });
  }

  const arrangement = song.arrangement;
  if (!Array.isArray(arrangement) || arrangement.length === 0 || arrangement.length > SONG_LIMITS.arrangement) {
    errors.push(`재생 순서는 1~${SONG_LIMITS.arrangement}개여야 합니다`);
  } else {
    let total = 0;
    for (const id of arrangement) {
      if (typeof id !== "string" || !ids.has(id)) errors.push(`arrangement가 존재하지 않는 섹션 "${String(id)}"를 가리킵니다`);
      else total += barsById.get(id) ?? 0;
    }
    if (total > SONG_LIMITS.totalBars) errors.push(`곡 전체는 ${SONG_LIMITS.totalBars}마디 이하여야 합니다 (현재 ${total}마디)`);
  }
  return errors;
}

function isValidKey(key: string): boolean {
  return /^[A-G][#b]?m?$/.test(key);
}

/** 편집 화면용 기본 믹서 값. */
export function defaultMixer(): Record<TrackId, MixerChannel> {
  return {
    piano: { volume: -6, mute: false, solo: false },
    bass: { volume: -4, mute: false, solo: false },
    drums: { volume: -6, mute: false, solo: false },
    strings: { volume: -12, mute: false, solo: false },
  };
}

/** arrangement를 펼쳐 총 마디 수를 계산. 존재하지 않는 id는 무시. */
export function totalBars(song: Song): number {
  const bars = new Map(song.sections.map((s) => [s.id, s.bars]));
  return song.arrangement.reduce((sum, id) => sum + (bars.get(id) ?? 0), 0);
}
