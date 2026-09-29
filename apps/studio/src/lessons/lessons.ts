// 레슨 모드 콘텐츠. 순서대로 진행하며, 각 레슨은 여러 종류의 블록(block)으로 구성된다.
import { generateSong, songToEvents, type DrumLane, type Genre, type TrackId } from "@chord-studio/core";

/** "들어보기" 버튼 하나가 재생하는 짧은 예제. packages/core/src/preview.ts의 PreviewNote와 형태를 맞춘다. */
export interface ListenNote {
  track: TrackId;
  /** 시작 시각 (초) */
  at: number;
  /** 길이 (초) */
  dur: number;
  midi?: number;
  lane?: DrumLane;
  velocity?: number;
}

/**
 * 장르 예제(레슨 3)는 patterns.ts의 실제 프리셋(BPM·스윙·휴머나이즈·패턴)을 그대로 써서
 * generateSong→songToEvents로 진짜 곡과 똑같은 3마디짜리 루프를 만든 뒤 초 단위로 바꾼다.
 * seed·bpm을 고정해 항상 같은 예제가 재생되게 한다(재현성).
 */
function genreListenNotes(genre: Genre, bpm: number, seed: number, section: "A" | "B" = "A"): ListenNote[] {
  const song = generateSong({ genre, key: "C", bpm, seed, arrangement: [section] });
  const { events, totalBeats } = songToEvents(song, { humanize: true });
  const maxBeats = Math.min(12, totalBeats); // 3마디
  const beatSec = 60 / song.meta.bpm;
  return events
    .filter((e) => e.time < maxBeats)
    .map((e) => ({
      track: e.track,
      at: e.time * beatSec,
      dur: Math.min(e.duration, maxBeats - e.time) * beatSec,
      midi: e.midi,
      lane: e.lane,
      velocity: e.velocity,
    }));
}

export type LessonBlock =
  | { type: "text"; text: string }
  | { type: "concepts"; items: { icon: string; title: string; text: string; listen?: ListenNote[] }[] }
  | { type: "compare"; items: { icon: string; label: string; text: string; accent: Accent; listen?: ListenNote[] }[] }
  | { type: "highlight"; icon: string; text: string }
  | { type: "tryit"; text: string }
  | { type: "steps"; items: { icon: string; title: string; text: string; screenshot?: string }[] };

export type Accent = "indigo" | "rose" | "amber" | "emerald";

export interface Lesson {
  title: string;
  icon: string;
  blocks: LessonBlock[];
}

/** 기존 문단(paragraphs) 형식을 블록으로 바꾼다. '직접 해보기:'로 시작하면 강조 블록으로 승격한다 */
function toBlocks(paragraphs: string[]): LessonBlock[] {
  return paragraphs.map((p) => {
    const tryitPrefix = "직접 해보기: ";
    if (p.startsWith(tryitPrefix)) return { type: "tryit", text: p.slice(tryitPrefix.length) };
    return { type: "text", text: p };
  });
}

export const LESSONS: Lesson[] = [
  {
    title: "1. 음악의 3요소",
    icon: "🎵",
    blocks: [
      { type: "text", text: "음악은 크게 리듬(Rhythm), 멜로디(Melody), 화성(Harmony) 세 가지로 이루어져요." },
      {
        type: "concepts",
        items: [
          {
            icon: "🥁",
            title: "리듬",
            text: "소리가 언제, 얼마나 길게 나는지를 정해요. 왼쪽 화면 아래 '패턴' 칸에서 드럼이 규칙적으로 치는 칸들이 바로 리듬이에요. (2마디 반복)",
            listen: [
              { track: "drums", lane: "kick", at: 0, dur: 0.15, velocity: 0.9 },
              { track: "drums", lane: "snare", at: 0.36, dur: 0.15, velocity: 0.8 },
              { track: "drums", lane: "kick", at: 0.72, dur: 0.15, velocity: 0.7 },
              { track: "drums", lane: "snare", at: 1.08, dur: 0.15, velocity: 0.8 },
              { track: "drums", lane: "kick", at: 1.44, dur: 0.15, velocity: 0.9 },
              { track: "drums", lane: "snare", at: 1.8, dur: 0.15, velocity: 0.8 },
              { track: "drums", lane: "kick", at: 2.16, dur: 0.15, velocity: 0.7 },
              { track: "drums", lane: "snare", at: 2.52, dur: 0.15, velocity: 0.8 },
            ],
          },
          {
            icon: "🎶",
            title: "멜로디",
            text: "음의 높낮이가 이어지며 만드는 '노래하는 선'이에요. 피아노 파트를 들어보면 코드 위에서 움직이는 소리가 멜로디에 가까워요. (좀 더 긴 프레이즈)",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.26 },
              { track: "piano", midi: 64, at: 0.28, dur: 0.26 },
              { track: "piano", midi: 67, at: 0.56, dur: 0.26 },
              { track: "piano", midi: 72, at: 0.84, dur: 0.3 },
              { track: "piano", midi: 69, at: 1.2, dur: 0.26 },
              { track: "piano", midi: 65, at: 1.48, dur: 0.26 },
              { track: "piano", midi: 62, at: 1.76, dur: 0.26 },
              { track: "piano", midi: 60, at: 2.04, dur: 0.4 },
            ],
          },
          {
            icon: "🎹",
            title: "화성",
            text: "여러 음을 동시에 쌓아 만드는 소리 덩어리, 즉 코드예요. 화면 위쪽 코드 카드들이 바로 이 곡의 화성 진행이에요. (C→F→G→C 진행으로 들어보기)",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.9 },
              { track: "piano", midi: 64, at: 0, dur: 0.9 },
              { track: "piano", midi: 67, at: 0, dur: 0.9 },
              { track: "piano", midi: 65, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 69, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 72, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 67, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 71, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 74, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 60, at: 3.0, dur: 1.1 },
              { track: "piano", midi: 64, at: 3.0, dur: 1.1 },
              { track: "piano", midi: 67, at: 3.0, dur: 1.1 },
            ],
          },
        ],
      },
      { type: "highlight", icon: "💡", text: "리듬 + 멜로디 + 화성, 이 세 가지가 합쳐지면 한 곡의 음악이 완성돼요." },
      { type: "tryit", text: "위에서 '재생'을 눌러 곡을 들으며, 지금 나는 소리가 리듬·멜로디·화성 중 어디에 해당하는지 짚어보세요." },
    ],
  },
  {
    title: "2. 코드 이름과 패턴 종류",
    icon: "🎹",
    blocks: [
      {
        type: "text",
        text: "코드 카드에 적힌 'Cmaj7', 'Am7', 'F#m7b5' 같은 이름은 세 부분으로 읽으면 쉬워요: 근음(어떤 음 위에 쌓았는지) + 성질(밝은 화음인지 어두운 화음인지) + 덧붙는 음(더 풍부한 소리를 위해 얹는 음).",
      },
      {
        type: "concepts",
        items: [
          {
            icon: "①",
            title: "근음",
            text: "맨 앞 알파벳이 이 코드의 기준이 되는 음이에요. C면 도, A면 라, F#이면 파#을 기준으로 쌓아요. (아래: 도레미파솔라시 순서로 여러 근음 들어보기)",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.45 },
              { track: "piano", midi: 62, at: 0.5, dur: 0.45 },
              { track: "piano", midi: 64, at: 1.0, dur: 0.45 },
              { track: "piano", midi: 65, at: 1.5, dur: 0.45 },
              { track: "piano", midi: 67, at: 2.0, dur: 0.45 },
              { track: "piano", midi: 69, at: 2.5, dur: 0.45 },
              { track: "piano", midi: 71, at: 3.0, dur: 0.5 },
            ],
          },
          {
            icon: "②",
            title: "성질",
            text: "뒤에 아무것도 없으면 장(밝은) 화음, 소문자 m이 붙으면 단(차분한) 화음, dim이면 불안정한 화음, aug면 붕 뜬 느낌의 화음이에요. (아래: C 장 → Cm 단 → Cdim 감소 → Caug 증가 순서로 들어보기)",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.75 },
              { track: "piano", midi: 64, at: 0, dur: 0.75 },
              { track: "piano", midi: 67, at: 0, dur: 0.75 },
              { track: "piano", midi: 60, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 63, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 67, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 60, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 63, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 66, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 60, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 64, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 68, at: 2.7, dur: 1.0 },
            ],
          },
          {
            icon: "③",
            title: "덧붙는 음",
            text: "7이나 maj7이 붙으면 일곱 번째 음을 하나 더 쌓아 재즈스럽고 풍부한 소리가 나요. 'C/E'처럼 슬래시가 있으면, 코드는 C지만 가장 낮은 음(베이스)만 E로 바꾼다는 뜻이에요. (아래: C 3화음 → C7 → Cmaj7 → Cmaj9 순서로, 점점 더 풍부해지는 소리 들어보기)",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.75 },
              { track: "piano", midi: 64, at: 0, dur: 0.75 },
              { track: "piano", midi: 67, at: 0, dur: 0.75 },
              { track: "piano", midi: 60, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 64, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 67, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 70, at: 0.9, dur: 0.75 },
              { track: "piano", midi: 60, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 64, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 67, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 71, at: 1.8, dur: 0.75 },
              { track: "piano", midi: 60, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 64, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 67, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 71, at: 2.7, dur: 1.0 },
              { track: "piano", midi: 74, at: 2.7, dur: 1.0 },
            ],
          },
        ],
      },
      {
        type: "text",
        text: "패턴 종류(피아노): 코드 카드 아래 보이는 '패턴' 칸은 같은 코드를 어떤 방식으로 연주할지 정해요.",
      },
      {
        type: "compare",
        items: [
          {
            icon: "▮",
            label: "chord",
            text: "화음을 한 번에 쾅 치는 방식 (C → Am 진행을 2번 반복)",
            accent: "indigo",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.9 },
              { track: "piano", midi: 64, at: 0, dur: 0.9 },
              { track: "piano", midi: 67, at: 0, dur: 0.9 },
              { track: "piano", midi: 57, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 60, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 64, at: 1.0, dur: 0.9 },
              { track: "piano", midi: 60, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 64, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 67, at: 2.0, dur: 0.9 },
              { track: "piano", midi: 57, at: 3.0, dur: 0.9 },
              { track: "piano", midi: 60, at: 3.0, dur: 0.9 },
              { track: "piano", midi: 64, at: 3.0, dur: 0.9 },
            ],
          },
          {
            icon: "↗",
            label: "arp-up",
            text: "낮은 음부터 하나씩 순서대로 올라가며 치는 방식(아르페지오, C → Am을 2번 반복)",
            accent: "emerald",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.3 },
              { track: "piano", midi: 64, at: 0.18, dur: 0.3 },
              { track: "piano", midi: 67, at: 0.36, dur: 0.3 },
              { track: "piano", midi: 57, at: 1.0, dur: 0.3 },
              { track: "piano", midi: 60, at: 1.18, dur: 0.3 },
              { track: "piano", midi: 64, at: 1.36, dur: 0.3 },
              { track: "piano", midi: 60, at: 2.0, dur: 0.3 },
              { track: "piano", midi: 64, at: 2.18, dur: 0.3 },
              { track: "piano", midi: 67, at: 2.36, dur: 0.3 },
              { track: "piano", midi: 57, at: 3.0, dur: 0.3 },
              { track: "piano", midi: 60, at: 3.18, dur: 0.3 },
              { track: "piano", midi: 64, at: 3.36, dur: 0.3 },
            ],
          },
          {
            icon: "⇕",
            label: "arp-updown",
            text: "올라갔다가 다시 내려오는 방식 (C → Am을 2번 반복)",
            accent: "amber",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.26 },
              { track: "piano", midi: 64, at: 0.18, dur: 0.26 },
              { track: "piano", midi: 67, at: 0.36, dur: 0.26 },
              { track: "piano", midi: 64, at: 0.54, dur: 0.26 },
              { track: "piano", midi: 57, at: 1.0, dur: 0.26 },
              { track: "piano", midi: 60, at: 1.18, dur: 0.26 },
              { track: "piano", midi: 64, at: 1.36, dur: 0.26 },
              { track: "piano", midi: 60, at: 1.54, dur: 0.26 },
              { track: "piano", midi: 60, at: 2.0, dur: 0.26 },
              { track: "piano", midi: 64, at: 2.18, dur: 0.26 },
              { track: "piano", midi: 67, at: 2.36, dur: 0.26 },
              { track: "piano", midi: 64, at: 2.54, dur: 0.26 },
              { track: "piano", midi: 57, at: 3.0, dur: 0.26 },
              { track: "piano", midi: 60, at: 3.18, dur: 0.26 },
              { track: "piano", midi: 64, at: 3.36, dur: 0.26 },
              { track: "piano", midi: 60, at: 3.54, dur: 0.26 },
            ],
          },
          {
            icon: "⋯",
            label: "broken",
            text: "음을 흩어서 통통 튀듯 치는 방식 (C → Am을 2번 반복)",
            accent: "rose",
            listen: [
              { track: "piano", midi: 60, at: 0, dur: 0.2 },
              { track: "piano", midi: 67, at: 0.14, dur: 0.2 },
              { track: "piano", midi: 64, at: 0.28, dur: 0.2 },
              { track: "piano", midi: 67, at: 0.42, dur: 0.2 },
              { track: "piano", midi: 57, at: 1.0, dur: 0.2 },
              { track: "piano", midi: 64, at: 1.14, dur: 0.2 },
              { track: "piano", midi: 60, at: 1.28, dur: 0.2 },
              { track: "piano", midi: 64, at: 1.42, dur: 0.2 },
              { track: "piano", midi: 60, at: 2.0, dur: 0.2 },
              { track: "piano", midi: 67, at: 2.14, dur: 0.2 },
              { track: "piano", midi: 64, at: 2.28, dur: 0.2 },
              { track: "piano", midi: 67, at: 2.42, dur: 0.2 },
              { track: "piano", midi: 57, at: 3.0, dur: 0.2 },
              { track: "piano", midi: 64, at: 3.14, dur: 0.2 },
              { track: "piano", midi: 60, at: 3.28, dur: 0.2 },
              { track: "piano", midi: 64, at: 3.42, dur: 0.2 },
            ],
          },
        ],
      },
      {
        type: "tryit",
        text: "코드 카드를 하나 눌러 코드 이름을 바꿔보고, 아래 패턴 칸에서 몇 개 칸을 껐다 켰다 해보며 소리가 어떻게 달라지는지 들어보세요.",
      },
    ],
  },
  {
    title: "3. 음악 장르 설명",
    icon: "🎧",
    blocks: [
      {
        type: "text",
        text: "'만들기' 화면 위쪽에서 곡을 새로 만들 때 팝·록·로파이·재즈 중 하나의 장르를 고를 수 있어요. 같은 코드 진행이라도 장르에 따라 템포(빠르기)와 리듬 느낌이 크게 달라져요.",
      },
      {
        type: "concepts",
        items: [
          {
            icon: "🎤",
            title: "팝 (92~124 BPM)",
            text: "걷는 속도보다 조금 빠르고, 박자가 딱딱 떨어지는 정박 리듬이라 따라 부르기 쉽고 경쾌해요. (실제 팝 프리셋으로 3마디 들어보기)",
            listen: genreListenNotes("pop", 108, 1),
          },
          {
            icon: "🎸",
            title: "록 (110~150 BPM)",
            text: "네 장르 중 가장 힘차고 빨라요. 팝처럼 정박이지만 드럼이 박자를 더 세게 강조해요. (실제 록 프리셋으로 3마디 들어보기)",
            listen: genreListenNotes("rock", 145, 1, "B"),
          },
          {
            icon: "☕",
            title: "로파이 (68~88 BPM)",
            text: "가장 느긋해요. 박자를 뒤로 밀어 치는 스윙(0.4)과 살짝 어긋난 타이밍(휴머나이즈)이 나른한 느낌을 내요. (실제 로파이 프리셋으로 3마디 들어보기)",
            listen: genreListenNotes("lofi", 78, 1),
          },
          {
            icon: "🎷",
            title: "재즈 (96~140 BPM)",
            text: "네 장르 중 스윙(0.65)이 가장 강하고, 타이밍도 가장 자유롭게 흔들려서 즉흥 연주하는 느낌이 나요. (실제 재즈 프리셋으로 3마디 들어보기)",
            listen: genreListenNotes("jazz", 118, 1),
          },
        ],
      },
      {
        type: "highlight",
        icon: "💡",
        text: "정리하면, 팝·록은 '규칙적이고 힘 있게', 로파이·재즈는 '살짝 흔들리고 여유롭게' 친다고 기억하면 쉬워요. 재즈가 로파이보다 더 크게 흔들리고 템포도 더 빠를 수 있어요.",
      },
      {
        type: "tryit",
        text: "'만들기' 화면에서 장르 버튼을 팝 → 로파이 → 재즈 순서로 바꿔가며 같은 곡을 다시 만들어 재생해 보고, 리듬이 얼마나 다르게 느껴지는지 비교해 보세요.",
      },
    ],
  },
  {
    title: "4. 장르별 리듬 패턴",
    icon: "🥁",
    blocks: [
      {
        type: "text",
        text: "드럼 트랙의 패턴 칸을 자세히 보면 kick(킥, 베이스 드럼)·snare(스네어)·hhClosed/hhOpen(하이햇) 같은 여러 줄(레인)이 있어요. 장르가 다르면 같은 악기라도 이 줄들에 켜지는 칸의 위치와 세기가 달라져요.",
      },
      {
        type: "concepts",
        items: [
          {
            icon: "🦵",
            title: "kick (킥)",
            text: "리듬의 뼈대가 되는 저음이에요. 보통 마디의 첫 박(1박)에 가장 세게 들어가고, 장르에 따라 그 사이사이에 작은 킥이 몇 개 더 끼어들어요. (2마디 반복)",
            listen: [
              { track: "drums", lane: "kick", at: 0, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "kick", at: 0.4, dur: 0.15, velocity: 0.6 },
              { track: "drums", lane: "kick", at: 0.8, dur: 0.15, velocity: 0.85 },
              { track: "drums", lane: "kick", at: 1.6, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "kick", at: 2.0, dur: 0.15, velocity: 0.6 },
              { track: "drums", lane: "kick", at: 2.4, dur: 0.15, velocity: 0.85 },
            ],
          },
          {
            icon: "🥁",
            title: "snare 백비트",
            text: "2박과 4박에 딱딱 치는 게 기본이에요('백비트'). 팝·록은 이 백비트가 또렷하고 세게 들어가 리듬을 확실히 잡아줘요. (2마디 반복)",
            listen: [
              { track: "drums", lane: "kick", at: 0, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "snare", at: 0.4, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "kick", at: 0.8, dur: 0.15, velocity: 0.85 },
              { track: "drums", lane: "snare", at: 1.2, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "kick", at: 1.6, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "snare", at: 2.0, dur: 0.15, velocity: 1.0 },
              { track: "drums", lane: "kick", at: 2.4, dur: 0.15, velocity: 0.85 },
              { track: "drums", lane: "snare", at: 2.8, dur: 0.15, velocity: 1.0 },
            ],
          },
          {
            icon: "🎩",
            title: "hi-hat 채우기",
            text: "잘게 쪼갠 소리로 리듬을 촘촘하게 채워요. 팝·록은 일정한 간격으로 고르게, 로파이·재즈는 간격이 불규칙해서 살짝 굴러가는 느낌이 나요. (2마디 반복)",
            listen: [
              { track: "drums", lane: "hhClosed", at: 0, dur: 0.1, velocity: 1.0 },
              { track: "drums", lane: "hhClosed", at: 0.14, dur: 0.1, velocity: 0.85 },
              { track: "drums", lane: "hhClosed", at: 0.28, dur: 0.1, velocity: 1.0 },
              { track: "drums", lane: "hhClosed", at: 0.42, dur: 0.1, velocity: 0.85 },
              { track: "drums", lane: "hhClosed", at: 0.56, dur: 0.1, velocity: 1.0 },
              { track: "drums", lane: "hhClosed", at: 0.7, dur: 0.1, velocity: 0.85 },
              { track: "drums", lane: "hhClosed", at: 0.84, dur: 0.1, velocity: 1.0 },
              { track: "drums", lane: "hhClosed", at: 0.98, dur: 0.1, velocity: 0.85 },
              { track: "drums", lane: "hhClosed", at: 1.12, dur: 0.1, velocity: 1.0 },
              { track: "drums", lane: "hhClosed", at: 1.26, dur: 0.1, velocity: 0.85 },
            ],
          },
          {
            icon: "🫧",
            title: "고스트 노트",
            text: "아주 여리게 치는 '장식음'이에요. 로파이·재즈는 스네어에 이런 여린 타격을 많이 섞어 백비트 사이사이를 몽글몽글 채워요. (2마디 반복)",
            listen: [
              { track: "drums", lane: "kick", at: 0, dur: 0.15, velocity: 0.85 },
              { track: "drums", lane: "snare", at: 0.21, dur: 0.15, velocity: 0.18 },
              { track: "drums", lane: "snare", at: 0.32, dur: 0.15, velocity: 0.9 },
              { track: "drums", lane: "snare", at: 0.54, dur: 0.15, velocity: 0.15 },
              { track: "drums", lane: "kick", at: 0.64, dur: 0.15, velocity: 0.7 },
              { track: "drums", lane: "snare", at: 0.85, dur: 0.15, velocity: 0.2 },
              { track: "drums", lane: "snare", at: 0.96, dur: 0.15, velocity: 0.9 },
              { track: "drums", lane: "kick", at: 1.28, dur: 0.15, velocity: 0.85 },
              { track: "drums", lane: "snare", at: 1.49, dur: 0.15, velocity: 0.18 },
              { track: "drums", lane: "snare", at: 1.6, dur: 0.15, velocity: 0.9 },
              { track: "drums", lane: "snare", at: 1.82, dur: 0.15, velocity: 0.15 },
              { track: "drums", lane: "kick", at: 1.92, dur: 0.15, velocity: 0.7 },
              { track: "drums", lane: "snare", at: 2.13, dur: 0.15, velocity: 0.2 },
              { track: "drums", lane: "snare", at: 2.24, dur: 0.15, velocity: 0.9 },
            ],
          },
        ],
      },
      {
        type: "highlight",
        icon: "💡",
        text: "정리하면, 팝·록은 '킥과 스네어가 또렷하고 하이햇이 고르게', 로파이·재즈는 '여린 장식음이 많고 하이햇 간격이 들쭉날쭉'해서 서로 다른 리듬 느낌을 만들어요.",
      },
      {
        type: "tryit",
        text: "드럼 트랙의 패턴 칸을 확대해서 보고, 장르를 팝에서 재즈로 바꿨을 때 kick·snare·hhClosed 줄에서 켜진 칸의 위치와 세기(색 진하기)가 어떻게 달라지는지 비교해 보세요.",
      },
    ],
  },
  {
    title: "5. 앱 사용법 가이드",
    icon: "📤",
    blocks: [
      {
        type: "text",
        text: "지금까지 배운 리듬·화성·장르 지식을 가지고, 실제로 '만들기' 화면에서 곡 하나를 완성해서 제출하는 순서를 정리해요. 각 단계마다 실제 화면 모습을 함께 확인해 보세요.",
      },
      {
        type: "steps",
        items: [
          {
            icon: "🎹",
            title: "곡 생성",
            text: "왼쪽 '곡 만들기' 칸에서 장르(팝/록/로파이/재즈) 버튼 하나를 고르고, 조성·BPM·스윙을 원하는 대로 조절한 다음 '✨ 다른 곡 만들기'를 누르면 그 설정에 맞는 새 곡이 만들어져요.",
            screenshot: "01-generate.png",
          },
          {
            icon: "▶️",
            title: "들어보기",
            text: "화면 위쪽 '▶ 재생' 버튼으로 곡을 재생해서 마음에 드는지 확인해요. 마음에 안 들면 '✨ 다른 곡 만들기'를 다시 눌러 같은 장르에서 다른 버전을 뽑아도 돼요.",
            screenshot: "02-listen.png",
          },
          {
            icon: "🎛️",
            title: "코드·패턴 다듬기",
            text: "코드 카드를 눌러 코드 이름을 바꾸거나, 패턴 칸에서 몇 박자를 껐다 켰다 하면서 자신만의 코드 진행과 리듬으로 다듬어요.",
            screenshot: "03-edit.png",
          },
          {
            icon: "🎚️",
            title: "믹서로 균형 잡기",
            text: "오른쪽 '믹서' 칸에서 각 트랙(피아노/베이스/드럼/스트링)의 볼륨을 조절하고, 필요하면 뮤트나 솔로로 특정 트랙만 강조하거나 빼서 들어볼 수 있어요.",
            screenshot: "04-mixer.png",
          },
          {
            icon: "💾",
            title: "저장·제출",
            text: "만족스러우면 'MIDI 내보내기'를 눌러 .mid 파일로 저장해요. 이 파일을 GarageBand 같은 프로그램에서 열면 피아노·베이스·드럼·스트링이 각각 다른 트랙으로 분리되어 열려요. 이 .mid 파일이 바로 제출할 결과물이에요. 작업 중인 곡 자체를 나중에 다시 열어 이어 하고 싶다면 'MIDI 내보내기' 옆의 '곡 저장 (.json)'으로도 따로 저장해 두세요.",
            screenshot: "05-export.png",
          },
        ],
      },
      {
        type: "tryit",
        text: "지금까지 배운 순서(① 생성 → ② 듣기 → ③ 다듬기 → ④ 믹서 조절 → ⑤ MIDI 내보내기)대로 실제 곡을 하나 완성해서 .mid 파일로 내보내 보세요.",
      },
    ],
  },
];
