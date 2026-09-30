// 위자드(단계별) 화면: 옛 프로토타입("머니코드 AI 스튜디오")처럼 한 화면에 다 몰아넣지 않고
// AI 추천받기 → 곡 기획 → 섹션별 편집(N단계) → 완성/내보내기 순서로 한 단계씩 보여준다.
// 실제 코드 진행·패턴 편집·MIDI 내보내기 로직은 전부 App.tsx/packages/core를 그대로 재사용하고,
// 이 파일은 "한 번에 하나씩 보여주는" 레이아웃만 담당한다.
import { useEffect, useMemo, useState } from "react";
import { addSection, GENRES, PRESETS, TRACK_IDS, type Genre, type MixerChannel, type Playhead, type Song, type TrackId } from "@chord-studio/core";
import { ChordEditor } from "./ChordEditor";
import { PatternGrid } from "./PatternGrid";

interface Props {
  song: Song;
  original: Song;
  playhead: Playhead | null;
  playing: boolean;
  onToggle: () => void;
  loop: boolean;
  onSetLoop: (loop: boolean) => void;
  metronome: boolean;
  onSetMetronome: (on: boolean) => void;
  metronomeVolume: number;
  onSetMetronomeVolume: (db: number) => void;
  /** 섹션 편집 단계에 들어오고 나갈 때 알려준다: 재생을 그 섹션 하나만 반복하도록 좁히기 위함 */
  onSectionFocus: (sectionId: string | null) => void;
  onRegenerate: (opts: { genre: Genre; seed: number; key?: string; bpm?: number }) => void;
  onStartBlank: () => void;
  onLoadDemoSong: (genre: Genre) => void;
  /** 코드 진행은 그대로 두고 조성만 전조 */
  onChangeKey: (key: string) => void;
  onPatchMeta: (patch: Partial<Song["meta"]>) => void;
  onChange: (update: (song: Song) => Song) => void;
  onUpdateChannel: (id: TrackId, patch: Partial<MixerChannel>) => void;
  onExportMidi: () => void;
  onExportJson: () => void;
  onCopyLink: () => void;
  linkNote: string | null;
}

const TRACK_LABEL: Record<TrackId, string> = { piano: "피아노", bass: "베이스", drums: "드럼", strings: "스트링" };
const VOLUME_MIN = -30;
const VOLUME_MAX = 6;
const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const btn = "rounded-lg px-4 py-2 font-medium transition-colors sm:px-5 sm:py-2.5 sm:text-base";
const btnGhost = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6";
const summary =
  "flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-700 before:text-xs before:text-slate-400 before:content-['▶'] group-open:mb-2 group-open:before:content-['▼'] sm:text-base [&::-webkit-details-marker]:hidden";

interface Mood {
  key: string;
  label: string;
  desc: string;
}

/** 기본 5섹션(인트로~아웃트로)의 역할을 한 줄로 설명해, 위자드에서 곡 구조를 자연스럽게 익히게 한다. 직접 추가한 섹션(id가 다름)은 설명 없음. */
const SECTION_BLURB: Record<string, string> = {
  Intro: "인트로: 곡을 여는 부분이에요. 짧고 단순하게 시작해 듣는 사람을 자연스럽게 끌어들여요.",
  A: "벌스: 이야기를 풀어가는 부분이에요. 코러스보다 차분하게 진행해서 후렴을 돋보이게 해요.",
  PreChorus: "프리코러스: 벌스에서 코러스로 넘어가는 다리예요. 긴장감을 조금씩 쌓아 올려요.",
  B: "코러스: 곡에서 가장 강하고 기억에 남는 부분이에요. 악기와 에너지를 가장 풍성하게 써요.",
  Outro: "아웃트로: 곡을 마무리하는 부분이에요. 다시 잦아들며 자연스럽게 끝을 맺어요.",
};

const MOODS: Mood[] = [
  { key: "kpop", label: "K-POP 댄스", desc: "신나고 통통 튀는 K-POP 댄스곡" },
  { key: "lofi", label: "로파이", desc: "차분하고 몽환적인 로파이 힙합" },
  { key: "anime", label: "J-POP 애니", desc: "벅차고 희망찬 J-POP 애니메이션 오프닝" },
  { key: "ballad", label: "발라드", desc: "감성적이고 서정적인 발라드" },
];

/** 아직 조성·BPM을 정하기 전 단계라, AI에게 그 부분까지 함께 추천받도록 묻는다 */
function buildPrompt(mood: Mood | undefined): string {
  const moodDesc = mood ? mood.desc : "원하는 분위기";
  return `나는 "${moodDesc}" 느낌의 곡을 만들려고 해. 이 분위기에 어울리는 조성(키), 템포(BPM), 코드 진행(예: I-V-vi-IV 같은 형태), 곡 구조(벌스/코러스 등)를 추천해줘. 그리고 내가 쓰는 작곡 툴은 팝/로파이/록/재즈 4가지 장르 프리셋만 지원하니, 이 중 어떤 장르가 가장 가까운지도 같이 알려줘. 음악을 전공하지 않은 사람도 이해할 수 있게 쉽게 설명해줘.`;
}

/** 장르·조성·BPM이 정해진 뒤, 지금 편집 중인 섹션 하나에 맞는 코드·리듬 아이디어를 AI에게 물어보도록 돕는다 */
function buildSectionPrompt(song: Song, section: Song["sections"][number]): string {
  const blurb = SECTION_BLURB[section.id];
  const role = blurb ? blurb.replace(/^[^:]+:\s*/, "") : "새로 추가한 구간";
  return `나는 지금 ${PRESETS[song.meta.genre].label} 장르, 조성 ${song.meta.key}, BPM ${song.meta.bpm}으로 곡을 만들고 있어. 지금 만들고 있는 부분은 "${section.name}"(${role}), 총 ${section.bars}마디야. 이 부분에 어울리는 코드 진행과 리듬(피아노 패턴·드럼 강조) 아이디어를 추천해줘. 음악을 전공하지 않은 사람도 이해할 수 있게 쉽게 설명해줘.`;
}

/** 클립보드 복사 등 짧은 피드백을 화면 하단에 잠깐 띄운다 */
function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
    >
      <span className="rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg">{message}</span>
    </div>
  );
}

/** 곡 구조(재생 순서 우선, 없는 섹션은 뒤로) 순서로 중복 없이 섹션을 나열 */
function orderedSections(song: Song) {
  const ids = [
    ...new Set(song.arrangement),
    ...song.sections.map((s) => s.id).filter((id) => !song.arrangement.includes(id)),
  ];
  return ids.flatMap((id) => song.sections.filter((s) => s.id === id));
}

export function Wizard({
  song,
  original,
  playhead,
  playing,
  onToggle,
  loop,
  onSetLoop,
  metronome,
  onSetMetronome,
  metronomeVolume,
  onSetMetronomeVolume,
  onSectionFocus,
  onRegenerate,
  onStartBlank,
  onLoadDemoSong,
  onChangeKey,
  onPatchMeta,
  onChange,
  onUpdateChannel,
  onExportMidi,
  onExportJson,
  onCopyLink,
  linkNote,
}: Props) {
  const { mixer } = song;
  const { genre, key, bpm, seed } = song.meta;
  const sections = useMemo(() => orderedSections(song), [song]);
  const totalSteps = 2 + sections.length + 1; // AI 추천 + 곡 기획 + 섹션들 + 완성
  const [step, setStep] = useState(0);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  const clampedStep = Math.min(step, totalSteps - 1);
  const isAiStep = clampedStep === 0;
  const isPlanStep = clampedStep === 1;
  const isFinal = clampedStep === totalSteps - 1;
  const sectionIndex = clampedStep - 2; // AI 추천/곡 기획/완성이 아닐 때만 유효
  const currentSection = !isAiStep && !isPlanStep && !isFinal ? sections[sectionIndex] : undefined;

  // 섹션 편집 화면에 있는 동안은 재생을 그 섹션만 반복하도록 좁힌다. 다른 단계(완성 포함)로 나가면 다시 전체 곡을 재생한다.
  useEffect(() => {
    onSectionFocus(currentSection?.id ?? null);
    return () => onSectionFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection?.id]);

  const mood = MOODS.find((m) => m.key === selectedMood);
  const prompt = buildPrompt(mood);

  const playingSection = playhead ? song.sections.find((s) => s.id === playhead.sectionId) : undefined;
  const activeArrangementIndex = playhead?.arrangementIndex ?? null;

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("질문을 복사했습니다 ✓");
    } catch {
      window.prompt("복사가 막혀 있습니다. 아래 문장을 직접 복사하세요.", text);
    }
  };
  const copyPrompt = () => copyText(prompt);

  const addNewSection = () => {
    const name = window.prompt("새 섹션 이름을 입력하세요 (마지막 섹션을 복사해서 시작합니다)", `섹션 ${sections.length + 1}`);
    if (!name || !name.trim()) return;
    const newIndex = 2 + sections.length;
    onChange((s) => addSection(s, name));
    setStep(newIndex);
  };

  const chip = (n: number, label: string) => (
    <button
      key={n}
      onClick={() => setStep(n)}
      aria-current={clampedStep === n}
      className={`flex-none rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
        clampedStep === n ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="group" aria-label="위자드 단계">
        {chip(0, "1. AI 추천받기")}
        {chip(1, "2. 곡 기획")}
        {sections.map((s, i) => chip(i + 2, `${i + 3}. ${s.name}`))}
        <button
          onClick={addNewSection}
          aria-label="새 섹션 추가"
          className="flex-none rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 sm:px-4 sm:py-2 sm:text-sm"
        >
          + 새 섹션
        </button>
        {chip(totalSteps - 1, "★ 완성")}
      </div>

      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 sm:py-3">
        <span className="text-sm text-slate-600 sm:text-base">
          {bpm} BPM · {key} · {song.meta.title}
          {playing && playingSection && (
            <span className="ml-2 text-amber-600">
              ▶ 지금 재생 중: {playingSection.name} {(playhead?.bar ?? 0) + 1}마디
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="재생 방식">
            <button
              onClick={() => onSetLoop(true)}
              aria-pressed={loop}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${loop ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              반복재생
            </button>
            <button
              onClick={() => onSetLoop(false)}
              aria-pressed={!loop}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${!loop ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              한 번만
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs" role="group" aria-label="메트로놈">
            <button
              onClick={() => onSetMetronome(!metronome)}
              aria-pressed={metronome}
              className={`rounded-md px-2.5 py-1 font-medium ${metronome ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              🔔 메트로놈
            </button>
            {metronome && (
              <input
                type="range"
                min={-40}
                max={0}
                value={metronomeVolume}
                onChange={(e) => onSetMetronomeVolume(Number(e.target.value))}
                aria-label="메트로놈 볼륨"
                className="w-20 accent-indigo-600"
              />
            )}
          </div>
          <button onClick={onToggle} className={`${btn} ${playing ? "bg-rose-500" : "bg-emerald-500"} min-w-24 text-white hover:brightness-95`}>
            {playing ? "■ 정지" : "▶ 재생"}
          </button>
        </div>
      </div>

      {isAiStep && (
        <section className={`${card} space-y-4`} aria-label="AI 추천받기">
          <h2 className="text-lg font-bold sm:text-xl">1. AI 프로듀서에게 곡 추천받기</h2>
          <p className="text-sm text-slate-500 sm:text-base">
            어떤 분위기의 곡을 만들고 싶은지 고르면, AI에게 물어볼 맞춤 질문을 만들어줘요. 조성·BPM·장르는 다음 단계에서 정해요.
          </p>

          <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:space-y-3 sm:p-4">
            <div className="flex flex-wrap gap-2 sm:gap-3" role="group" aria-label="무드">
              {MOODS.map((m) => (
                <button
                  key={m.key}
                  onClick={() => setSelectedMood(m.key === selectedMood ? null : m.key)}
                  aria-pressed={m.key === selectedMood}
                  className={`rounded-full px-3 py-1 text-xs font-medium sm:px-4 sm:py-1.5 sm:text-sm ${
                    m.key === selectedMood ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <textarea
              readOnly
              value={prompt}
              rows={4}
              className="w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 sm:p-3 sm:text-sm sm:leading-relaxed"
            />
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={() => void copyPrompt()} className={btnGhost}>
                📋 맞춤 질문 복사하기
              </button>
              <a
                href="https://gemini.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`${btnGhost} inline-block`}
              >
                Gemini 열기 ↗
              </a>
              <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer" className={`${btnGhost} inline-block`}>
                ChatGPT 열기 ↗
              </a>
            </div>
            <p className="text-xs text-indigo-700/70 sm:text-sm">
              위 질문을 복사해서 Gemini나 ChatGPT에 붙여넣으면, 조성·BPM·코드 진행·구조에 대한 아이디어를 받아볼 수 있어요. 앱이 직접
              AI를 호출하지는 않아요.
            </p>
          </div>

          <div className="flex justify-end">
            <button onClick={() => setStep(1)} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
              다음 단계 ▶
            </button>
          </div>
        </section>
      )}

      {isPlanStep && (
        <section className={`${card} space-y-4`} aria-label="곡 기획">
          <h2 className="text-lg font-bold sm:text-xl">2. 곡 기획</h2>
          <p className="text-sm text-slate-500 sm:text-base">AI에게 받은 추천을 참고해서, 실제로 사용할 장르·조성·BPM을 골라보세요.</p>

          <div className="flex flex-wrap gap-2 sm:gap-3" role="group" aria-label="장르">
            {GENRES.map((g) => (
              <button
                key={g}
                onClick={() => onRegenerate({ genre: g, seed: seed ?? 1, key, bpm })}
                aria-pressed={g === genre}
                className={`${btn} ${g === genre ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
              >
                {PRESETS[g].label}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-3 text-sm sm:text-base">
            <span className="w-12 shrink-0">조성</span>
            <select
              value={key}
              onChange={(e) => onChangeKey(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-slate-700 sm:py-2 sm:text-base"
            >
              {ALL_KEYS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 text-sm sm:text-base">
            <span className="w-12 shrink-0">BPM</span>
            <input
              type="range"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => onPatchMeta({ bpm: Number(e.target.value) })}
              className="min-w-0 flex-1 accent-indigo-600"
            />
            <span className="w-8 text-right font-mono text-xs text-slate-600 sm:text-sm">{bpm}</span>
          </label>

          <button onClick={onStartBlank} className={btnGhost}>
            📄 빈 곡에서 시작 (섹션 없이 처음부터)
          </button>

          <details className="group rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
            <summary className={summary}>샘플 곡 바로 불러오기</summary>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {GENRES.map((g) => (
                <button key={g} onClick={() => onLoadDemoSong(g)} className={btnGhost}>
                  {PRESETS[g].label}
                </button>
              ))}
            </div>
          </details>

          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className={btnGhost}>
              ◀ 이전 단계
            </button>
            <button onClick={() => setStep(2)} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
              다음 단계 ▶
            </button>
          </div>
        </section>
      )}

      {currentSection && (
        <section className={`${card} space-y-4`} aria-label={`${currentSection.name} 편집`}>
          <h2 className="text-lg font-bold sm:text-xl">
            {clampedStep + 1}. {currentSection.name} 편집 ({currentSection.bars}마디)
          </h2>
          {SECTION_BLURB[currentSection.id] && (
            <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700 sm:text-base">
              {SECTION_BLURB[currentSection.id]}
            </p>
          )}

          <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:space-y-3 sm:p-4">
            <p className="text-sm font-semibold text-indigo-700 sm:text-base">🤖 AI에게 이 섹션 질문하기</p>
            <textarea
              readOnly
              value={buildSectionPrompt(song, currentSection)}
              rows={3}
              className="w-full resize-none rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 sm:p-3 sm:text-sm sm:leading-relaxed"
            />
            <button onClick={() => void copyText(buildSectionPrompt(song, currentSection))} className={btnGhost}>
              📋 맞춤 질문 복사하기
            </button>
            <p className="text-xs text-indigo-700/70 sm:text-sm">
              복사한 질문을 Gemini·ChatGPT에 붙여넣으면, 이 섹션에 어울리는 코드 진행과 리듬 아이디어를 받아볼 수 있어요.
            </p>
          </div>

          <details className="group rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
            <summary className={summary}>🎹 코드·패턴 편집 방법</summary>
            <div className="space-y-2 text-sm text-slate-600 sm:text-base">
              <p>
                <strong className="text-slate-800">코드:</strong> 아래 코드 카드를 눌러 이 섹션의 코드를 하나씩 바꿀 수 있어요.
              </p>
              <p>
                <strong className="text-slate-800">피아노 패턴 4종류:</strong> 코드(화음을 한 번에 쾅), 아르페지오 ↑(낮은 음부터
                차례로 하나씩), 아르페지오 ↑↓(오르내리며 순서대로), 브로큰(음을 건너뛰며 통통 튀는 리듬).
              </p>
              <p>
                <strong className="text-slate-800">드럼 격자:</strong> 칸을 누를 때마다 꺼짐 → 보통 → 세게 순으로 바뀌어요. 킥은
                저음으로 쿵, 스네어는 박자를 짝짝 짚어주고, 하이햇은 잘게 쪼개는 리듬을 만들어요. 나머지 레인(림샷·탐·라이드·크래시)은
                필인이나 악센트를 줄 때 써요.
              </p>
              <p className="text-slate-500">
                더 자세히 듣고 배우고 싶다면 "가이드" 탭의 레슨 2(코드 이름과 패턴 종류), 레슨 4(장르별 리듬 패턴)를 참고하세요.
              </p>
            </div>
          </details>

          <ChordEditor song={song} active={null} onChange={onChange} onlySectionId={currentSection.id} />
          <PatternGrid song={song} original={original} playhead={playhead} onChange={onChange} forceSectionId={currentSection.id} />
          <div className="flex justify-between">
            <button onClick={() => setStep(clampedStep - 1)} className={btnGhost}>
              ◀ 이전 단계
            </button>
            <button onClick={() => setStep(clampedStep + 1)} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
              다음 단계 ▶
            </button>
          </div>
        </section>
      )}

      {isFinal && (
        <section className={`${card} space-y-4`} aria-label="완성 및 내보내기">
          <h2 className="text-lg font-bold sm:text-xl">★ 완곡 완성 &amp; 내보내기</h2>

          <ol className="flex flex-wrap gap-1.5 text-xs sm:gap-2 sm:text-sm" aria-label="곡 구조 미리보기">
            {song.arrangement.map((id, i) => {
              const s = song.sections.find((sec) => sec.id === id);
              const active = activeArrangementIndex === i;
              return (
                <li
                  key={i}
                  aria-current={active ? "true" : undefined}
                  className={`rounded px-2 py-1 sm:px-3 sm:py-1.5 ${active ? "bg-amber-400 font-bold text-slate-900" : "border border-slate-200 bg-white text-slate-600"}`}
                >
                  {s?.name ?? id}
                </li>
              );
            })}
          </ol>

          <div className="space-y-3">
            <h3 className="font-semibold sm:text-lg">믹서</h3>
            {TRACK_IDS.map((id) => {
              const ch = mixer[id];
              return (
                <div key={id} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-sm sm:text-base">{TRACK_LABEL[id]}</span>
                  <input
                    type="range"
                    min={VOLUME_MIN}
                    max={VOLUME_MAX}
                    step={1}
                    value={ch.volume}
                    onChange={(e) => onUpdateChannel(id, { volume: Number(e.target.value) })}
                    aria-label={`${TRACK_LABEL[id]} 볼륨`}
                    className="min-w-0 flex-1 accent-indigo-600"
                  />
                  <span className="w-14 text-right font-mono text-xs text-slate-500">
                    {ch.volume > 0 ? "+" : ""}
                    {ch.volume} dB
                  </span>
                  <button
                    onClick={() => onUpdateChannel(id, { mute: !ch.mute })}
                    aria-pressed={ch.mute}
                    aria-label={`${TRACK_LABEL[id]} 뮤트`}
                    className={`h-8 w-8 rounded-md text-xs font-bold ${ch.mute ? "bg-rose-500 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    M
                  </button>
                  <button
                    onClick={() => onUpdateChannel(id, { solo: !ch.solo })}
                    aria-pressed={ch.solo}
                    aria-label={`${TRACK_LABEL[id]} 솔로`}
                    className={`h-8 w-8 rounded-md text-xs font-bold ${ch.solo ? "bg-amber-400 text-slate-900" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                  >
                    S
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={onExportMidi} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
              MIDI 내보내기
            </button>
            <button onClick={onExportJson} className={btnGhost}>
              곡 저장 (.json)
            </button>
            <button onClick={onCopyLink} className={btnGhost}>
              🔗 링크 복사
            </button>
          </div>
          {linkNote && (
            <p role="status" className="text-sm text-slate-600">
              {linkNote}
            </p>
          )}

          <div className="flex justify-start">
            <button onClick={() => setStep(clampedStep - 1)} className={btnGhost}>
              ◀ 이전 단계
            </button>
          </div>
        </section>
      )}
      {toast && <Toast message={toast} />}
    </div>
  );
}
