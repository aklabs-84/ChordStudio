// 16스텝 패턴 편집: 드럼(레인 9개)·피아노·베이스. 칸을 누를 때마다 꺼짐 → 보통 → 세게 → 꺼짐.
// 스트링은 코드 길이만큼 늘어지는 패드라 격자를 만들지 않는다.
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  DRUM_LANES,
  PRESETS,
  STEPS_PER_BAR,
  applyPatternPreset,
  clearPatternVariant,
  cycleStep,
  getStepPattern,
  resetSection,
  setBassApproach,
  setDrumsMuted,
  setPatternMuted,
  setPianoStyle,
  setStringsOn,
  stepLevel,
  stepsOf,
  type DrumLane,
  type Intensity,
  type PatternRef,
  type PatternScope,
  type PianoStyle,
  type Playhead,
  type Song,
} from "@chord-studio/core";

// 솔로 기능용: PatternRef ↔ 문자열 키 변환 (상태 저장·비교에 사용)
function refKey(ref: PatternRef): string {
  return ref.track === "drums" ? `drums:${ref.lane}` : ref.track;
}
function keyToRef(key: string): PatternRef | null {
  if (key === "piano") return { track: "piano" };
  if (key === "bass") return { track: "bass" };
  if (key.startsWith("drums:")) return { track: "drums", lane: key.slice(6) as DrumLane };
  return null;
}
interface SoloState {
  sectionId: string;
  key: string;
  /** 솔로 걸기 전 각 줄의 음소거 상태(해제·전환 시 복원용) */
  prev: [string, boolean][];
}

interface Props {
  song: Song;
  /** 같은 설정으로 새로 만든 곡 — 섹션 "원래대로"의 기준 */
  original: Song;
  playhead: Playhead | null;
  onChange: (update: (song: Song) => Song) => void;
  /** 있으면 이 섹션으로 고정하고 섹션 선택 탭을 숨긴다 (위자드 단계별 화면용) */
  forceSectionId?: string;
}

const LANE_LABEL: Record<DrumLane, string> = {
  kick: "킥",
  snare: "스네어",
  rim: "림샷",
  hhClosed: "하이햇",
  hhOpen: "오픈햇",
  tomHi: "하이탐",
  tomLow: "로우탐",
  ride: "라이드",
  crash: "크래시",
};

const PIANO_STYLES: { id: PianoStyle; label: string }[] = [
  { id: "chord", label: "코드" },
  { id: "arp-up", label: "아르페지오 ↑" },
  { id: "arp-updown", label: "아르페지오 ↑↓" },
  { id: "broken", label: "브로큰" },
];

const SCOPES: { id: PatternScope; label: string }[] = [
  { id: "main", label: "일반 마디" },
  { id: "first", label: "첫 마디" },
  { id: "last", label: "마지막 마디 (필인)" },
];

const LEVEL_NAME = ["꺼짐", "보통", "세게"] as const;
const LEVEL_STYLE = [
  "bg-slate-200 hover:bg-slate-300",
  "bg-indigo-400 hover:bg-indigo-500",
  "bg-indigo-600 hover:bg-indigo-700",
] as const;

const SCOPE_NAME: Record<PatternScope, string> = {
  main: "일반 마디",
  first: "첫 마디",
  last: "마지막 마디",
};

/** 재생 중인 마디가 어떤 패턴(첫/마지막/일반)을 쓰는지. 엔진과 같은 규칙: 마지막이 첫보다 우선. */
function scopeOfBar(bar: number, bars: number): PatternScope {
  if (bar === bars - 1) return "last";
  return bar === 0 ? "first" : "main";
}

const card = "rounded-xl border border-slate-200 bg-white p-4";

// 접었다 펴는 카드 제목. 기본 삼각형 대신 오른쪽 화살표가 열리면 아래로 돈다.
const summary =
  "flex cursor-pointer list-none items-center gap-2 font-semibold before:text-xs before:text-slate-500 before:content-['▶'] group-open:mb-2 group-open:before:content-['▼'] [&::-webkit-details-marker]:hidden";

const tab = (on: boolean) =>
  `rounded-md px-3 py-1.5 text-sm ${on ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

interface CellProps {
  label: string;
  step: number;
  subStep: number;
  level: 0 | 1 | 2;
  active: boolean;
  onStep: (step: number) => void;
}

// 칸 하나. 재생 중 16분음표마다 표시가 옮겨 가므로, 값이 안 바뀐 칸은 다시 그리지 않도록 memo로 막는다.
const Cell = memo(function Cell({ label, step, subStep, level, active, onStep }: CellProps) {
  const isDownbeat = subStep === 0;
  return (
    <button
      onClick={() => onStep(step)}
      aria-label={`${label} ${step + 1}번 칸 ${LEVEL_NAME[level]}`}
      aria-pressed={level > 0}
      className={`relative flex h-8 items-center justify-center rounded-sm sm:h-7 transition-all ${
        LEVEL_STYLE[level]
      } ${
        isDownbeat && level === 0 ? "border-l-2 border-slate-300" : ""
      } ${
        active ? "z-10 scale-105 outline outline-2 outline-amber-400 brightness-110 shadow-sm" : ""
      }`}
    >
      {/* 꺼져 있을 때 정박(각 박자의 첫 번째 칸)에 은은한 앵커 닷 표시 */}
      {isDownbeat && level === 0 && (
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400/40 pointer-events-none" />
      )}
      {/* 세게(level 2)일 때 미세한 센터 바 표시 */}
      {level === 2 && (
        <span className="h-2 w-1 rounded-full bg-white/70 pointer-events-none" />
      )}
    </button>
  );
});

/** 1마디 안의 4개 박자(1~4박)와 16분음표 서브스텝을 시각적으로 안내하는 헤더 */
function BeatHeader({ activeStep }: { activeStep: number | null }) {
  return (
    <div className="flex items-center gap-2 pb-1.5 text-xs select-none">
      <div className="w-20 shrink-0 text-right pr-2 font-semibold text-slate-400 text-[11px]">
        박자
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2">
        {[0, 1, 2, 3].map((b) => {
          const isCurrentBeat = activeStep !== null && Math.floor(activeStep / 4) === b;
          return (
            <div
              key={b}
              className={`rounded-lg border px-1.5 py-1 transition-all ${
                isCurrentBeat
                  ? "border-amber-400 bg-amber-50/80 shadow-xs ring-1 ring-amber-300"
                  : "border-slate-200/90 bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between px-0.5">
                <span className={`font-bold text-[11px] sm:text-xs ${isCurrentBeat ? "text-amber-900" : "text-slate-700"}`}>
                  {b + 1}박
                </span>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                  Beat {b + 1}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-0.5 pt-0.5 text-center text-[9px] sm:text-[10px] font-mono">
                <span className={activeStep === b * 4 ? "text-amber-600 font-bold" : "text-slate-600 font-semibold"}>정박</span>
                <span className={activeStep === b * 4 + 1 ? "text-amber-600 font-bold" : "text-slate-400"}>¼</span>
                <span className={activeStep === b * 4 + 2 ? "text-amber-600 font-bold" : "text-slate-500 font-medium"}>½</span>
                <span className={activeStep === b * 4 + 3 ? "text-amber-600 font-bold" : "text-slate-400"}>¾</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({
  label,
  values,
  active,
  muted,
  soloed,
  dimmed,
  onStep,
  onToggle,
  onSolo,
}: {
  label: string;
  values: number[];
  active: number | null;
  /** 이 섹션에서 꺼져 있는지 */
  muted: boolean;
  /** 지금 이 줄만 솔로로 듣고 있는지 */
  soloed: boolean;
  /** 다른 줄이 솔로 중이라 이 줄은 안 들리는지 */
  dimmed: boolean;
  onStep: (step: number) => void;
  onToggle: () => void;
  onSolo: () => void;
}) {
  // onStep은 렌더마다 새로 만들어지므로 최신 것을 ref로 들고, 칸에는 늘 같은 함수를 넘긴다
  const latest = useRef(onStep);
  latest.current = onStep;
  const press = useCallback((step: number) => latest.current(step), []);
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-20 shrink-0 items-center gap-0.5">
        <button
          onClick={onToggle}
          aria-pressed={!muted}
          aria-label={`${label} ${muted ? "켜기" : "끄기"} (이 섹션)`}
          title={muted ? "이 섹션에서 꺼져 있습니다. 누르면 켭니다" : "누르면 이 섹션에서 끕니다 (칸 값은 보존)"}
          className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-xs ${
            muted ? "text-slate-400 line-through hover:bg-slate-100" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {muted ? "🔇" : "🔊"} {label}
        </button>
        <button
          onClick={onSolo}
          aria-pressed={soloed}
          aria-label={`${label} 솔로 ${soloed ? "해제" : "켜기"} (이 섹션에서 이 줄만 듣기)`}
          title={soloed ? "눌러서 솔로 해제 (원래 음소거 상태로 복원)" : "눌러서 이 줄만 듣기 (나머지는 자동으로 음소거)"}
          className={`h-5 w-5 shrink-0 rounded text-[10px] font-bold leading-none ${
            soloed ? "bg-amber-400 text-slate-900" : "border border-slate-200 text-slate-400 hover:bg-slate-100"
          }`}
        >
          S
        </button>
      </div>
      <div
        className={`grid min-w-0 flex-1 grid-cols-2 gap-1.5 sm:grid-cols-4 sm:gap-2 ${
          muted || dimmed ? "opacity-30" : ""
        }`}
      >
        {[0, 1, 2, 3].map((b) => (
          <div key={b} className="grid grid-cols-4 gap-0.5">
            {[0, 1, 2, 3].map((subStep) => {
              const step = b * 4 + subStep;
              return (
                <Cell
                  key={step}
                  label={label}
                  step={step}
                  subStep={subStep}
                  level={stepLevel(values[step] ?? 0)}
                  active={active === step}
                  onStep={press}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PatternGrid({ song, original, playhead, onChange, forceSectionId }: Props) {
  const [pickedId, setPickedId] = useState(
    forceSectionId ?? song.arrangement[0] ?? song.sections[0]!.id,
  );
  useEffect(() => {
    if (forceSectionId) setPickedId(forceSectionId);
  }, [forceSectionId]);
  const [pickedScope, setPickedScope] = useState<PatternScope>("main");
  // 재생 중에는 지금 연주 중인 섹션·마디 종류를 자동으로 보여준다. 탭이나 칸을 직접 누르면 멈춘다.
  const [follow, setFollow] = useState(true);
  const isPlaying = playhead !== null;

  const playing = playhead
    ? song.sections.find((s) => s.id === playhead.sectionId)
    : undefined;
  const playScope =
    playhead && playing ? scopeOfBar(playhead.bar, playing.bars) : null;
  // 섹션 고정 화면(forceSectionId, 위자드의 섹션 편집 화면)에서는 섹션 자체는 못 바꾸지만,
  // 지금 재생 중인 섹션이 바로 이 화면의 섹션이라면 마디 종류(일반/첫/마지막)는 그대로 따라가야 한다.
  const sectionFollowing = !forceSectionId && follow && !!playing;
  const sectionId = forceSectionId ?? (sectionFollowing ? playing!.id : pickedId);
  const section =
    song.sections.find((s) => s.id === sectionId) ?? song.sections[0]!;
  const scopeFollowing =
    follow && !!playing && !!playScope && playing.id === section.id;
  const pickedOrPlayScope: PatternScope = scopeFollowing ? playScope! : pickedScope;
  // 1마디 섹션은 첫 마디 = 마지막 마디이고 엔진은 last를 먼저 쓴다. 화면도 같은 규칙으로 맞춘다
  const scope: PatternScope =
    section.bars === 1 && pickedOrPlayScope === "first" ? "last" : pickedOrPlayScope;
  const following = sectionFollowing || scopeFollowing;

  // 재생이 시작되면 다시 따라가기. 멈추면 격자가 예전 선택으로 튀지 않게 마지막으로 보던 곳에 머문다
  const shown = useRef({ id: section.id, scope });
  if (playhead) shown.current = { id: section.id, scope };
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (isPlaying) setFollow(true);
    else if (wasPlaying.current) {
      setPickedId(shown.current.id);
      setPickedScope(shown.current.scope);
    }
    wasPlaying.current = isPlaying;
  }, [isPlaying]);

  const setSectionId = (id: string) => {
    setPickedId(id);
    setFollow(false);
  };
  const setScope = (sc: PatternScope) => {
    setPickedScope(sc);
    setFollow(false);
  };
  // 지금 보이는 격자가 실제로 연주 중인 격자일 때만 칸 표시를 그린다
  const activeStep =
    playhead && playing && playing.id === section.id && playScope === scope
      ? playhead.step
      : null;

  // 따라가는 중에 칸을 누르면 지금 보이는 곳에 고정한 뒤 편집한다 (섹션이 넘어가도 엉뚱한 곳이 바뀌지 않게)
  const cycle = (ref: PatternRef) => (step: number) => {
    if (following) {
      setPickedId(section.id);
      setPickedScope(scope);
      setFollow(false);
    }
    onChange((s) => cycleStep(s, section.id, ref, scope, step));
  };
  const stepsFor = (ref: PatternRef) =>
    stepsOf(getStepPattern(section, ref), scope, section.bars);
  const stringsOn = section.tracks.strings !== undefined;
  const isMuted = (ref: PatternRef) => getStepPattern(section, ref)?.muted === true;
  const toggle = (ref: PatternRef) => () =>
    onChange((s) => setPatternMuted(s, section.id, ref, !isMuted(ref)));
  // 드럼 전체: 소리 나는 레인이 하나라도 있으면 "끄기", 전부 꺼져 있으면 "켜기"
  const drumRefs = DRUM_LANES.map((lane) => ({ track: "drums", lane }) as PatternRef).filter((r) => getStepPattern(section, r));
  const drumsAllMuted = drumRefs.length > 0 && drumRefs.every(isMuted);

  // 솔로: 한 줄만 켜 두고 같은 섹션의 나머지(피아노·베이스·드럼 레인)를 자동으로 음소거한다.
  // 스트링은 격자(muted 플래그)가 없어 솔로 대상에서 제외.
  const [solo, setSolo] = useState<SoloState | null>(null);
  const soloableRefs: PatternRef[] = [{ track: "piano" }, { track: "bass" }, ...drumRefs];
  const isSoloed = (ref: PatternRef) => solo?.sectionId === section.id && solo.key === refKey(ref);
  const isDimmedBySolo = (ref: PatternRef) =>
    solo?.sectionId === section.id && solo.key !== refKey(ref);

  const restoreSolo = (s: Song, state: SoloState) =>
    state.prev.reduce((acc, [key, wasMuted]) => {
      const r = keyToRef(key);
      return r ? setPatternMuted(acc, state.sectionId, r, wasMuted) : acc;
    }, s);

  // 섹션을 바꿔서 벗어나면 솔로를 풀어 원래 음소거 상태로 되돌린다 (다른 섹션에 음소거가 남지 않게)
  useEffect(() => {
    if (solo && solo.sectionId !== section.id) {
      const prior = solo;
      onChange((s) => restoreSolo(s, prior));
      setSolo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  // 화면을 아예 떠날 때(다른 탭으로 전환 등)도 솔로를 풀어 음소거가 영구히 남지 않게 한다
  const soloRef = useRef(solo);
  soloRef.current = solo;
  useEffect(
    () => () => {
      const prior = soloRef.current;
      if (prior) onChange((s) => restoreSolo(s, prior));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const toggleSolo = (ref: PatternRef) => () => {
    const key = refKey(ref);
    if (solo?.sectionId === section.id && solo.key === key) {
      const prior = solo;
      onChange((s) => restoreSolo(s, prior));
      setSolo(null);
      return;
    }
    const prev: [string, boolean][] =
      solo?.sectionId === section.id
        ? solo.prev // 같은 섹션에서 다른 줄로 전환 — 솔로 걸기 전 원래 스냅샷을 그대로 유지
        : soloableRefs.map((r) => [refKey(r), isMuted(r)]);
    onChange((s) =>
      soloableRefs.reduce((acc, r) => setPatternMuted(acc, section.id, r, refKey(r) !== key), s),
    );
    setSolo({ sectionId: section.id, key, prev });
  };

  // 첫/마지막 마디 패턴이 하나라도 따로 있는지(없으면 "일반 마디와 같음")
  const refs: PatternRef[] = [
    { track: "drums", lane: "kick" },
    { track: "piano" },
    { track: "bass" },
  ];
  const hasVariant =
    scope !== "main" &&
    [
      ...refs,
      ...DRUM_LANES.map((lane) => ({ track: "drums", lane }) as PatternRef),
    ].some((r) => getStepPattern(section, r)?.[scope]);

  const changed = resetSection(song, original, section.id) !== song;

  // 비트·악기 섹션 제목 옆에 넣을 마디 종류 미니 네비게이션. 위 탭과 같은 scope 상태를 공유한다.
  const scopeIdx = SCOPES.findIndex((sc) => sc.id === scope);
  const stepScope = (dir: 1 | -1) =>
    setScope(SCOPES[(scopeIdx + dir + SCOPES.length) % SCOPES.length]!.id);
  const renderScopeNav = () => (
    <div className="mb-2 flex items-center gap-1.5 text-xs" role="group" aria-label="마디 종류 빠른 전환">
      <button
        onClick={() => stepScope(-1)}
        aria-label="이전 마디 종류"
        className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
      >
        ◀
      </button>
      <span
        className={`rounded-md px-2 py-1 font-semibold ${
          following ? "bg-amber-400 text-slate-900" : "bg-indigo-50 text-indigo-700"
        }`}
      >
        {following ? `▶ 재생 중 · ${SCOPE_NAME[scope]}` : SCOPE_NAME[scope]}
      </span>
      <button
        onClick={() => stepScope(1)}
        aria-label="다음 마디 종류"
        className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
      >
        ▶
      </button>
    </div>
  );

  const clearVariant = () => {
    if (scope === "main") return;
    const all: PatternRef[] = [
      { track: "piano" },
      { track: "bass" },
      ...DRUM_LANES.map((lane) => ({ track: "drums", lane }) as PatternRef),
    ];
    onChange((s) =>
      all.reduce((acc, r) => clearPatternVariant(acc, section.id, r, scope), s),
    );
  };

  // 장르 프리셋(가볍게/꽉 차게)을 통째로 적용. 같은 버튼을 다시 누르면 다음 조합으로 순환한다.
  const [presetPick, setPresetPick] = useState<Record<string, number>>({});
  const applyPreset = (intensity: Intensity) => {
    const key = `${section.id}:${intensity}`;
    const variants = PRESETS[song.meta.genre].variants[intensity];
    const nextIndex = ((presetPick[key] ?? -1) + 1) % variants.length;
    setPresetPick((m) => ({ ...m, [key]: nextIndex }));
    onChange((s) => applyPatternPreset(s, section.id, song.meta.genre, intensity, nextIndex));
  };
  const presetVariantCount = (intensity: Intensity) => PRESETS[song.meta.genre].variants[intensity].length;

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-3`} aria-label="패턴 편집">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">패턴 편집</h2>
          {playhead && playing && (
            <span
              className="rounded-md bg-amber-400 px-2 py-1 text-xs font-bold text-slate-900"
              role="status"
            >
              재생 중: {playing.name} {playhead.bar + 1}/{playing.bars}마디 ·{" "}
              {SCOPE_NAME[playScope!]}
            </span>
          )}
          <button
          onClick={() => onChange((s) => resetSection(s, original, section.id))}
          disabled={!changed}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
          title="이 섹션의 코드와 패턴을 처음 만들어진 상태로 되돌립니다 (↩ 되돌리기로 취소 가능)"
        >
          {section.name} 원래대로
        </button>
        <span className="flex flex-wrap items-center gap-1" role="group" aria-label="패턴 프리셋 적용">
          <button
            onClick={() => applyPreset("low")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            title="드럼·피아노·베이스를 이 장르의 담백한 조합으로 한 번에 채웁니다 (다시 누르면 다른 조합)"
          >
            🌱 심플하게{presetVariantCount("low") > 1 ? " (다시 누르면 다른 조합)" : ""}
          </button>
          <button
            onClick={() => applyPreset("high")}
            className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            title="드럼·피아노·베이스를 이 장르의 꽉 찬 조합으로 한 번에 채웁니다 (다시 누르면 다른 조합)"
          >
            🔥 풍성하게{presetVariantCount("high") > 1 ? " (다시 누르면 다른 조합)" : ""}
          </button>
        </span>
        {playhead && !follow && (
            <button
              onClick={() => setFollow(true)}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              재생 따라가기
            </button>
          )}
          {!forceSectionId && (
            <div className="flex flex-wrap gap-1" role="group" aria-label="섹션">
              {song.sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSectionId(s.id)}
                  aria-pressed={s.id === section.id}
                  className={tab(s.id === section.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-1"
            role="group"
            aria-label="적용 마디"
          >
            {SCOPES.map((sc) => (
              <button
                key={sc.id}
                onClick={() => setScope(sc.id)}
                aria-pressed={sc.id === scope}
                className={tab(sc.id === scope)}
              >
                {sc.label}
              </button>
            ))}
          </div>
          <p className="w-full text-xs text-slate-500">
          <b className="text-slate-700">일반 마디</b> = 대부분의 마디 · <b className="text-slate-700">첫 마디</b> = 섹션 시작(첫 1마디만) ·{" "}
          <b className="text-slate-700">마지막 마디</b> = 섹션 끝(필인). 첫/마지막은 고치기 전까지 일반 마디와 같습니다.
        </p>
        {scope !== "main" && (
            <span className="text-xs text-slate-500">
              {hasVariant
                ? "따로 편집한 패턴이 있습니다"
                : "지금은 일반 마디와 같습니다 (고치면 따로 저장)"}
            </span>
          )}
          {hasVariant && (
            <button
              onClick={clearVariant}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              일반 마디와 같게
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-4 2xl:grid-cols-2">
        <section className={card} aria-label="비트 패턴">
          <details className="group space-y-1">
          <summary className={summary}>🥁 비트 (드럼)</summary>
          {renderScopeNav()}
          {solo?.sectionId === section.id && (
            <p className="mb-2 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              🎧 솔로 중: {solo.key === "piano" ? "피아노" : solo.key === "bass" ? "베이스" : LANE_LABEL[solo.key.slice(6) as DrumLane]} — S를 다시 누르면 해제
            </p>
          )}
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={() => onChange((s) => setDrumsMuted(s, section.id, !drumsAllMuted))}
              aria-pressed={!drumsAllMuted}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {drumsAllMuted ? "🔇 드럼 전체 켜기" : "🔊 드럼 전체 끄기"} ({section.name})
            </button>
            <span className="text-[11px] text-slate-500 font-medium">1마디 = 4박자 (1박당 4칸)</span>
          </div>
          <BeatHeader activeStep={activeStep} />
          {DRUM_LANES.map((lane) => {
            const ref: PatternRef = { track: "drums", lane };
            return (
              <Row
                key={lane}
                label={LANE_LABEL[lane]}
                values={stepsFor(ref)}
                active={activeStep}
                muted={isMuted(ref)}
                soloed={isSoloed(ref)}
                dimmed={isDimmedBySolo(ref)}
                onStep={cycle(ref)}
                onToggle={toggle(ref)}
                onSolo={toggleSolo(ref)}
              />
            );
          })}
          </details>
        </section>

        <section className={card} aria-label="악기 패턴">
          <details className="group space-y-4">
          <summary className={summary}>🎹 악기 (피아노·베이스·스트링)</summary>
          {renderScopeNav()}
          {solo?.sectionId === section.id && (
            <p className="-mt-2 mb-2 rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              🎧 솔로 중: {solo.key === "piano" ? "피아노" : solo.key === "bass" ? "베이스" : LANE_LABEL[solo.key.slice(6) as DrumLane]} — S를 다시 누르면 해제
            </p>
          )}
          <BeatHeader activeStep={activeStep} />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1" role="group" aria-label="피아노 스타일">
                {PIANO_STYLES.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onChange((s) => setPianoStyle(s, section.id, p.id))}
                    aria-pressed={p.id === section.tracks.piano.style}
                    className={`rounded-md px-2 py-1 text-xs ${
                      p.id === section.tracks.piano.style ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <Row
              label="피아노"
              values={stepsFor({ track: "piano" })}
              active={activeStep}
              muted={isMuted({ track: "piano" })}
              soloed={isSoloed({ track: "piano" })}
              dimmed={isDimmedBySolo({ track: "piano" })}
              onStep={cycle({ track: "piano" })}
              onToggle={toggle({ track: "piano" })}
              onSolo={toggleSolo({ track: "piano" })}
            />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={section.tracks.bass.approach}
                  onChange={(e) =>
                    onChange((s) =>
                      setBassApproach(s, section.id, e.target.checked),
                    )
                  }
                />
                코드 바뀔 때 반음 연결음 넣기
              </label>
            </div>
            <Row
              label="베이스"
              values={stepsFor({ track: "bass" })}
              active={activeStep}
              muted={isMuted({ track: "bass" })}
              soloed={isSoloed({ track: "bass" })}
              dimmed={isDimmedBySolo({ track: "bass" })}
              onStep={cycle({ track: "bass" })}
              onToggle={toggle({ track: "bass" })}
              onSolo={toggleSolo({ track: "bass" })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => onChange((s) => setStringsOn(s, section.id, !stringsOn))}
              aria-pressed={stringsOn}
              className={`rounded-md px-2 py-1 text-xs ${stringsOn ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              🎻 스트링 패드 {stringsOn ? "켜짐" : "꺼짐"} ({section.name})
            </button>
            <span className="text-xs text-slate-500">코드 길이만큼 이어지는 화음이라 격자는 없습니다</span>
          </div>

          <p className="text-xs text-slate-500">
            칸을 누를 때마다 꺼짐 → 보통 → 세게 → 꺼짐. 1마디는 4박자(1~4박)로 구성되며 각 박자는 4칸으로 세분화(정박·반의반·반박·반의반)되어 있습니다.
            격자는 "언제 치는지"이고, 피아노 스타일(코드/아르페지오/브로큰)은 "치는 칸에서 어떤 음을 내는지"라서
            스타일을 바꿔도 격자는 그대로입니다. 줄 이름(🔊)을 누르면 그 섹션에서만 악기를
            끄고 켤 수 있고, 꺼도 칸 값은 남아 있습니다. 옆의 S 버튼을 누르면 그 줄만 솔로로
            들을 수 있고(나머지는 자동 음소거), 다시 누르면 원래 음소거 상태로 돌아갑니다.
          </p>
          </details>
        </section>
      </div>
    </div>
  );
}
