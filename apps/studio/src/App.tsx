// Chord Studio 메인 화면 (단계 7a): 생성 → 재생 → 코드 카드 → 믹서 → MIDI 내보내기, 자동저장
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GENRES,
  LONG_LINK_CHARS,
  PRESETS,
  TRACK_IDS,
  createBlankSong,
  defaultMixer,
  generateSong,
  hasShareHash,
  locate,
  parseSongJson,
  restoreStructure,
  serializeSong,
  songFromShareHash,
  songToMidi,
  songToShareHash,
  type Genre,
  type MixerChannel,
  type Playhead,
  type Song,
  type TrackId,
} from "@chord-studio/core";
import { createEngine, type Engine } from "@chord-studio/core/engine";
import { ArrangementEditor } from "./components/ArrangementEditor";
import { ChordEditor } from "./components/ChordEditor";
import { Credits } from "./components/Credits";
import { LessonPanel } from "./components/LessonPanel";
import { PatternGrid } from "./components/PatternGrid";
import { Wizard } from "./components/Wizard";
import { loadSong, saveSong } from "./storage";

const samePlayhead = (a: Playhead | null, b: Playhead | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.arrangementIndex === b.arrangementIndex &&
    a.chordIndex === b.chordIndex &&
    a.bar === b.bar &&
    a.step === b.step);

const TRACK_LABEL: Record<TrackId, string> = { piano: "피아노", bass: "베이스", drums: "드럼", strings: "스트링" };
const VOLUME_MIN = -30;
const VOLUME_MAX = 6;
const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const btn = "rounded-lg px-4 py-2 font-medium transition-colors";
const btnGhost = `${btn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";

export function App() {
  const engineRef = useRef<Engine | null>(null);
  // 저장된 곡이 있으면 이어서, 없으면 팝 시드 1로 시작
  const [song, setSong] = useState<Song>(() => loadSong() ?? generateSong({ genre: "pop", seed: 1 }));
  const [view, setView] = useState<"studio" | "wizard" | "lesson">("studio");
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
  const [humanize, setHumanize] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(-12);
  const [playhead, setPlayhead] = useState<Playhead | null>(null);
  const [samplesReady, setSamplesReady] = useState(false);
  // 되돌리기 한 단계: 직전 편집 전의 구조(섹션·재생 순서). BPM·믹서는 되돌리지 않는다
  const [undo, setUndo] = useState<Pick<Song, "sections" | "arrangement"> | null>(null);
  // 위자드에서 특정 섹션을 편집 중일 때만 채워짐: 재생을 그 섹션 하나만 반복하도록 좁힌다
  const [playScopeId, setPlayScopeId] = useState<string | null>(null);
  const songRef = useRef(song);
  songRef.current = song;

  const { mixer } = song;
  const { genre, key, bpm, swing, seed } = song.meta;

  // 엔진은 마운트 때 만들어 샘플을 미리 받는다 (소리는 첫 클릭 뒤에야 난다)
  useEffect(() => {
    const e = createEngine({
      sampleBaseUrl: `${import.meta.env.BASE_URL}samples/`,
      onEnded: () => setPlaying(false),
    });
    engineRef.current = e;
    e.ready.then(() => setSamplesReady(true), () => setSamplesReady(true));
    return () => {
      e.dispose();
      engineRef.current = null;
    };
  }, []);

  // 믹서를 뺀 부분이 바뀔 때만 이벤트를 다시 짠다. 믹서는 따로 반영한다 (재생 끊김 없음)
  const structure = useMemo(
    () => ({ meta: song.meta, sections: song.sections, arrangement: song.arrangement }),
    [song.meta, song.sections, song.arrangement],
  );
  useEffect(() => {
    const scoped = playScopeId ? { ...song, arrangement: [playScopeId] } : song;
    engineRef.current?.setSong(scoped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structure, playScopeId]);

  useEffect(() => {
    engineRef.current?.setMixer(mixer);
  }, [mixer]);

  useEffect(() => {
    engineRef.current?.setHumanize(humanize);
  }, [humanize]);

  useEffect(() => {
    engineRef.current?.setLoop(loop);
  }, [loop]);

  useEffect(() => {
    engineRef.current?.setMetronome(metronome);
  }, [metronome]);

  useEffect(() => {
    engineRef.current?.setMetronomeVolume(metronomeVolume);
  }, [metronomeVolume]);

  // 자동저장 (슬라이더를 끄는 동안 매번 쓰지 않도록 잠깐 모았다가)
  useEffect(() => {
    const t = setTimeout(() => saveSong(song), 300);
    return () => clearTimeout(t);
  }, [song]);

  // 재생 중: 화면 주사율에 맞춰 현재 코드 위치를 읽고, 바뀔 때만 다시 그린다
  useEffect(() => {
    if (!playing) {
      setPlayhead(null);
      return;
    }
    const locateIn = playScopeId ? { ...song, arrangement: [playScopeId] } : song;
    let frame = 0;
    const tick = () => {
      const next = locate(locateIn, engineRef.current?.getBeat() ?? 0);
      setPlayhead((prev) => (samePlayhead(prev, next) ? prev : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, song, playScopeId]);

  // 같은 설정으로 다시 만든 곡: 편집 여부 판단과 섹션 "원래대로"의 기준
  const original = useMemo(() => generateSong({ genre, key, bpm, seed }), [genre, key, bpm, seed]);
  const edited = useMemo(
    () => JSON.stringify([original.sections, original.arrangement]) !== JSON.stringify([song.sections, song.arrangement]),
    [original, song.sections, song.arrangement],
  );

  /** 코드·재생 순서·패턴 편집은 모두 여기로: 바뀌면 직전 구조를 되돌리기용으로 남긴다 */
  const applyEdit = useCallback((update: (song: Song) => Song) => {
    const before = songRef.current;
    const after = update(before);
    if (after === before) return;
    songRef.current = after; // 같은 틱의 다음 편집이 최신 곡을 보도록
    setUndo({ sections: before.sections, arrangement: before.arrangement });
    setSong(after);
  }, []);

  const undoEdit = () => {
    if (!undo) return;
    setSong((s) => restoreStructure(s, undo));
    setUndo(null);
  };

  /** 새로 생성. 믹서는 유지한다. key/bpm을 주지 않으면 시드가 고른다. 편집한 내용이 있으면 먼저 묻는다 */
  const regenerate = (opts: { genre: Genre; seed: number; key?: string; bpm?: number }) => {
    if (edited && !window.confirm("직접 고친 코드·패턴이 사라집니다. 새로 만들까요?")) return;
    setSong((s) => ({ ...generateSong(opts), mixer: s.mixer }));
    setUndo(null);
  };

  /** 아무것도 없는 무음 섹션 1개로 완전히 새로 시작한다. 편집한 내용이 있으면 먼저 묻는다 */
  const startBlank = () => {
    if (edited && !window.confirm("직접 고친 코드·패턴이 사라집니다. 빈 곡에서 새로 시작할까요?")) return;
    setSong(createBlankSong({ genre, key, bpm }));
    setUndo(null);
  };

  const patchMeta = (patch: Partial<Song["meta"]>) => setSong((s) => ({ ...s, meta: { ...s.meta, ...patch } }));

  const updateChannel = (id: TrackId, patch: Partial<MixerChannel>) =>
    setSong((s) => ({ ...s, mixer: { ...s.mixer, [id]: { ...s.mixer[id], ...patch } } }));

  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([serializeSong(song)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chord-studio-${genre}-seed${seed ?? 0}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** 곡 파일 불러오기. 잘못된 파일은 곡을 건드리지 않고 이유만 보여준다 */
  const importJson = async (file: File | undefined) => {
    if (!file) return;
    const result = parseSongJson(await file.text());
    if (!result.ok) {
      setFileError(`곡 파일을 열 수 없습니다: ${result.error}`);
      return;
    }
    if (edited && !window.confirm("직접 고친 코드·패턴이 사라집니다. 이 파일로 바꿀까요?")) return;
    setFileError(null);
    setSong(result.song);
    setUndo(null);
  };

  /** 미리 만들어 둔 장르별 샘플 곡을 앱 안에서 바로 불러온다. 편집한 내용이 있으면 먼저 묻는다 */
  const loadDemoSong = async (g: Genre) => {
    const res = await fetch(`${import.meta.env.BASE_URL}demo-songs/sample-${g}.json`);
    if (!res.ok) {
      setFileError(`샘플 곡을 불러올 수 없습니다: ${res.status}`);
      return;
    }
    const result = parseSongJson(await res.text());
    if (!result.ok) {
      setFileError(`샘플 곡을 불러올 수 없습니다: ${result.error}`);
      return;
    }
    if (edited && !window.confirm("직접 고친 코드·패턴이 사라집니다. 샘플 곡으로 바꿀까요?")) return;
    setFileError(null);
    setSong(result.song);
    setUndo(null);
  };

  const [linkNote, setLinkNote] = useState<string | null>(null);

  const copyLink = async () => {
    const url = `${location.origin}${location.pathname}#${await songToShareHash(song)}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkNote(
        url.length > LONG_LINK_CHARS
          ? `링크를 복사했습니다 (${url.length}자). 길어서 메신저에서 잘릴 수 있으니 "곡 저장"도 함께 쓰세요.`
          : `링크를 복사했습니다 (${url.length}자). 받는 사람이 열면 믹서까지 같은 곡이 열립니다.`,
      );
    } catch {
      window.prompt("복사가 막혀 있습니다. 아래 링크를 직접 복사하세요.", url);
    }
  };

  // 공유 링크(#s=...)로 열렸으면 곡을 복원한다. 주소는 곧바로 정리해서 새로고침 때 다시 묻지 않는다.
  useEffect(() => {
    if (!hasShareHash(location.hash)) return;
    const hash = location.hash;
    history.replaceState(null, "", location.pathname + location.search);
    void songFromShareHash(hash).then((result) => {
      if (!result.ok) {
        setFileError(`공유 링크를 열 수 없습니다: ${result.error}`);
        return;
      }
      const cur = songRef.current;
      const base = generateSong({ genre: cur.meta.genre, key: cur.meta.key, bpm: cur.meta.bpm, seed: cur.meta.seed });
      const dirty = JSON.stringify([base.sections, base.arrangement]) !== JSON.stringify([cur.sections, cur.arrangement]);
      if (dirty && !window.confirm("공유받은 곡을 열면 지금 고친 내용이 사라집니다. 열까요?")) return;
      setSong(result.song);
      setUndo(null);
    });
  }, []);

  const exportMidi = () => {
    const bytes = songToMidi(song, { humanize });
    const url = URL.createObjectURL(new Blob([bytes], { type: "audio/midi" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `chord-studio-${genre}-seed${seed ?? 0}.mid`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggle = async () => {
    const e = engineRef.current;
    if (!e) return;
    if (playing) {
      e.stop();
      setPlaying(false);
    } else {
      await e.play();
      setPlaying(true);
    }
  };

  // 편집기에는 재생 위치 전체가 아니라 "코드/순서 칸이 바뀔 때만 달라지는 값"을 넘겨, 16분음표마다 다시 그리지 않게 한다
  const activeSectionId = playhead?.sectionId;
  const activeChordIndex = playhead?.chordIndex;
  const activeArrangementIndex = playhead?.arrangementIndex ?? null;
  const activeChord = useMemo(
    () => (activeSectionId !== undefined && activeChordIndex !== undefined ? { sectionId: activeSectionId, chordIndex: activeChordIndex } : null),
    [activeSectionId, activeChordIndex],
  );
  const playingSection = playhead ? song.sections.find((s) => s.id === playhead.sectionId) : undefined;
  const nextSeed = (seed ?? 0) + 1;

  return (
    <main className="min-h-dvh bg-slate-50 pb-[calc(6rem+env(safe-area-inset-bottom))] text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-3">
          <h1 className="mr-4 text-lg font-bold text-slate-900">Chord Studio</h1>
          <div className="mr-auto flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="화면 전환">
            <button
              role="tab"
              aria-selected={view === "studio"}
              onClick={() => setView("studio")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "studio" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              만들기
            </button>
            <button
              role="tab"
              aria-selected={view === "wizard"}
              onClick={() => setView("wizard")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "wizard" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              레슨
            </button>
            <button
              role="tab"
              aria-selected={view === "lesson"}
              onClick={() => setView("lesson")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${view === "lesson" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
            >
              가이드
            </button>
          </div>
          {view === "studio" && (
            <>
              <span className="text-xs text-slate-500" role="status">
                {samplesReady ? "샘플 준비됨" : "샘플 로딩 중… (그 전에는 신스로 재생)"}
              </span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="재생 방식">
                <button
                  onClick={() => setLoop(true)}
                  aria-pressed={loop}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${loop ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
                >
                  반복재생
                </button>
                <button
                  onClick={() => setLoop(false)}
                  aria-pressed={!loop}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${!loop ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}
                >
                  한 번만
                </button>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs" role="group" aria-label="메트로놈">
                <button
                  onClick={() => setMetronome((v) => !v)}
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
                    onChange={(e) => setMetronomeVolume(Number(e.target.value))}
                    aria-label="메트로놈 볼륨"
                    className="w-20 accent-indigo-600"
                  />
                )}
              </div>
              <button onClick={toggle} className={`${btn} text-white ${playing ? "bg-rose-500 hover:bg-rose-400" : "bg-emerald-500 hover:bg-emerald-400"} min-w-24`}>
                {playing ? "■ 정지" : "▶ 재생"}
              </button>
            </>
          )}
        </div>
      </header>

      {view === "lesson" && <LessonPanel />}

      {view === "wizard" && (
        <Wizard
          song={song}
          original={original}
          playhead={playhead}
          playing={playing}
          onToggle={() => void toggle()}
          loop={loop}
          onSetLoop={setLoop}
          metronome={metronome}
          onSetMetronome={setMetronome}
          metronomeVolume={metronomeVolume}
          onSetMetronomeVolume={setMetronomeVolume}
          onSectionFocus={setPlayScopeId}
          onRegenerate={regenerate}
          onStartBlank={startBlank}
          onLoadDemoSong={loadDemoSong}
          onPatchMeta={patchMeta}
          onChange={applyEdit}
          onUpdateChannel={updateChannel}
          onExportMidi={exportMidi}
          onExportJson={exportJson}
          onCopyLink={() => void copyLink()}
          linkNote={linkNote}
        />
      )}

      {view === "studio" && (
      <div className="mx-auto grid max-w-[1800px] gap-4 p-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <aside className="contents xl:sticky xl:top-[4.5rem] xl:block xl:max-h-[calc(100vh-5.5rem)] xl:space-y-4 xl:self-start xl:overflow-y-auto">
          <section className={`${card} order-1 space-y-4`} aria-label="곡 만들기">
            <div className="flex flex-wrap gap-2" role="group" aria-label="장르">
              {GENRES.map((g) => (
                <button
                  key={g}
                  onClick={() => regenerate({ genre: g, seed: seed ?? 1, key, bpm })}
                  aria-pressed={g === genre}
                  className={`${btn} ${g === genre ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  {PRESETS[g].label}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0">조성</span>
                <select
                  value={key}
                  onChange={(e) => regenerate({ genre, seed: seed ?? 1, key: e.target.value, bpm })}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1.5"
                >
                  {ALL_KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0">BPM</span>
                <input
                  type="range"
                  min={60}
                  max={180}
                  value={bpm}
                  onChange={(e) => patchMeta({ bpm: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-indigo-600"
                />
                <span className="w-8 text-right font-mono text-xs text-slate-500">{bpm}</span>
              </label>
              <label className="flex items-center gap-3 text-sm">
                <span className="w-12 shrink-0">스윙</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={swing}
                  onChange={(e) => patchMeta({ swing: Number(e.target.value) })}
                  className="min-w-0 flex-1 accent-indigo-600"
                />
                <span className="w-8 text-right font-mono text-xs text-slate-500">{swing.toFixed(2)}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={humanize} onChange={(e) => setHumanize(e.target.checked)} />
                사람처럼 (휴머나이즈)
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => regenerate({ genre, seed: nextSeed })} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-500`}>
                ✨ 다른 곡 만들기
              </button>
              <button onClick={startBlank} className={btnGhost}>
                📄 빈 곡에서 시작
              </button>
              <button onClick={exportMidi} className={btnGhost}>
                MIDI 내보내기
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">샘플 곡</span>
              {GENRES.map((g) => (
                <button key={g} onClick={() => void loadDemoSong(g)} className={btnGhost}>
                  {PRESETS[g].label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={exportJson} className={btnGhost}>
                곡 저장 (.json)
              </button>
              <button onClick={() => fileInputRef.current?.click()} className={btnGhost}>
                곡 불러오기
              </button>
              <button onClick={() => void copyLink()} className={btnGhost}>
                🔗 링크 복사
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                hidden
                aria-label="곡 파일 선택"
                onChange={(e) => {
                  void importJson(e.target.files?.[0]);
                  e.target.value = ""; // 같은 파일을 다시 골라도 동작하도록
                }}
              />
            </div>
            {linkNote && (
              <p role="status" className="text-sm text-slate-500">
                {linkNote}
              </p>
            )}
            {fileError && (
              <p role="alert" className="text-sm text-rose-600">
                {fileError}
              </p>
            )}
          </section>

        <section className={`${card} order-3 space-y-3`} aria-label="믹서">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">믹서</h2>
            <button
              onClick={() => setSong((s) => ({ ...s, mixer: defaultMixer() }))}
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              기본값으로
            </button>
          </div>
          {TRACK_IDS.map((id) => {
            const ch = mixer[id];
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-sm">{TRACK_LABEL[id]}</span>
                <input
                  type="range"
                  min={VOLUME_MIN}
                  max={VOLUME_MAX}
                  step={1}
                  value={ch.volume}
                  onChange={(e) => updateChannel(id, { volume: Number(e.target.value) })}
                  aria-label={`${TRACK_LABEL[id]} 볼륨`}
                  className="min-w-0 flex-1 accent-indigo-600"
                />
                <span className="w-14 text-right font-mono text-xs text-slate-500">
                  {ch.volume > 0 ? "+" : ""}
                  {ch.volume} dB
                </span>
                <button
                  onClick={() => updateChannel(id, { mute: !ch.mute })}
                  aria-pressed={ch.mute}
                  aria-label={`${TRACK_LABEL[id]} 뮤트`}
                  className={`h-8 w-8 rounded-md text-xs font-bold ${ch.mute ? "bg-rose-500 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  M
                </button>
                <button
                  onClick={() => updateChannel(id, { solo: !ch.solo })}
                  aria-pressed={ch.solo}
                  aria-label={`${TRACK_LABEL[id]} 솔로`}
                  className={`h-8 w-8 rounded-md text-xs font-bold ${ch.solo ? "bg-amber-400 text-slate-900" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
                >
                  S
                </button>
              </div>
            );
          })}
        </section>
        </aside>

        <div className="order-2 min-w-0 space-y-4">
          <section className={`${card} space-y-4`} aria-label="곡 구조">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{song.meta.title}</p>
                <div className="flex items-center gap-1 text-xs text-slate-500" role="group" aria-label="곡 번호">
                  <span>곡 #{seed}</span>
                  <button
                    onClick={() => regenerate({ genre, seed: (seed ?? 1) - 1 })}
                    disabled={(seed ?? 1) <= 1}
                    aria-label="이전 번호 곡"
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => regenerate({ genre, seed: nextSeed })}
                    aria-label="다음 번호 곡"
                    className="rounded border border-slate-200 bg-white px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                  >
                    ▶
                  </button>
                </div>
                <p className="text-sm text-slate-500">
                  {bpm} BPM · {key}
                  {playhead && playingSection ? ` · ${playingSection.name} ${playhead.bar + 1}마디` : ""}
                </p>
              </div>
              <button
                onClick={undoEdit}
                disabled={!undo}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
              >
                ↩ 되돌리기
              </button>
            </div>

            <ArrangementEditor song={song} activeIndex={activeArrangementIndex} onChange={applyEdit} />

            <ChordEditor song={song} active={activeChord} onChange={applyEdit} />
          </section>

          <PatternGrid song={song} original={original} playhead={playhead} onChange={applyEdit} />
          <Credits />
        </div>
      </div>
      )}
    </main>
  );
}
