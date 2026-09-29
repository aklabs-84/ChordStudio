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
  /** 섹션 편집 단계에 들어오고 나갈 때 알려준다: 재생을 그 섹션 하나만 반복하도록 좁히기 위함 */
  onSectionFocus: (sectionId: string | null) => void;
  onRegenerate: (opts: { genre: Genre; seed: number; key?: string; bpm?: number }) => void;
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

interface Mood {
  key: string;
  label: string;
  desc: string;
}

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
  onSectionFocus,
  onRegenerate,
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

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setToast("질문을 복사했습니다 ✓");
    } catch {
      window.prompt("복사가 막혀 있습니다. 아래 문장을 직접 복사하세요.", prompt);
    }
  };

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
        <button onClick={onToggle} className={`${btn} ${playing ? "bg-rose-500" : "bg-emerald-500"} min-w-24 text-white hover:brightness-95`}>
          {playing ? "■ 정지" : "▶ 재생"}
        </button>
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
              onChange={(e) => onRegenerate({ genre, seed: seed ?? 1, key: e.target.value, bpm })}
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
