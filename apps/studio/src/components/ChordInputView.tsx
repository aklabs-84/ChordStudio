// Chordify & Klang 외부 사이트 검색 및 섹션/마디별 코드 입력기
import { useMemo, useState } from "react";
import {
  BEATS_PER_BAR,
  GENRES,
  PRESETS,
  degreesToChords,
  getPreset,
  isValidChord,
  modeOf,
  type ChordSlot,
  type Genre,
  type Section,
  type Song,
} from "@chord-studio/core";

interface Props {
  song: Song;
  onApply: (newSong: Song) => void;
  onNavigateToStudio: () => void;
}

interface DraftSection {
  id: string;
  name: string;
  chords: ChordSlot[];
}

const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "Gb", "Db", "Ab", "Eb", "Bb", "F"];
const MINOR_KEYS = ["Am", "Em", "Bm", "F#m", "C#m", "G#m", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm"];
const ALL_KEYS = [...MAJOR_KEYS, ...MINOR_KEYS];

const SECTION_TEMPLATES = [
  { name: "인트로", defaultBars: 4 },
  { name: "벌스", defaultBars: 8 },
  { name: "프리코러스", defaultBars: 4 },
  { name: "코러스", defaultBars: 8 },
  { name: "브릿지", defaultBars: 4 },
  { name: "아웃트로", defaultBars: 4 },
];

/** 텍스트를 파싱하여 섹션 및 코드 슬롯으로 변환 */
function parseTextToSections(rawText: string, fallbackKey: string): DraftSection[] {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const sections: DraftSection[] = [];
  let currentSection: DraftSection = {
    id: `sec_1`,
    name: "벌스",
    chords: [],
  };

  const sectionHeaderRegex = /^(?:\[|【|\()?\s*(인트로|벌스|프리코러스|코러스|브릿지|아웃트로|Intro|Verse|Pre-Chorus|PreChorus|Chorus|Bridge|Outro|Section\s*\d+|파트\s*\d+)\s*(?:\]|】|\))?[:\s-]*(.*)$/i;

  const flushCurrent = () => {
    if (currentSection.chords.length > 0) {
      sections.push({ ...currentSection });
    }
  };

  for (const line of lines) {
    const match = line.match(sectionHeaderRegex);
    if (match) {
      flushCurrent();
      const secName = match[1] || "섹션";
      currentSection = {
        id: `sec_${sections.length + 1}`,
        name: secName,
        chords: [],
      };
      const rest = match[2]?.trim();
      if (rest) {
        parseLineChords(rest, currentSection.chords, fallbackKey);
      }
    } else {
      parseLineChords(line, currentSection.chords, fallbackKey);
    }
  }

  flushCurrent();

  if (sections.length === 0) {
    return [
      {
        id: "sec_1",
        name: "메인 진행",
        chords: [{ symbol: fallbackKey, beats: 4 }],
      },
    ];
  }

  return sections;
}

/** 한 줄의 코드를 파싱하여 대상 배열에 추가 (마디 구분 | 지원) */
function parseLineChords(line: string, targetChords: ChordSlot[], fallbackKey: string) {
  // 마디 구분자(|)가 있는 경우
  if (line.includes("|")) {
    const bars = line.split("|").map((b) => b.trim()).filter(Boolean);
    for (const bar of bars) {
      const tokens = bar.split(/[\s,]+/).filter(Boolean);
      if (tokens.length === 0) continue;
      const beatsPerChord = Math.max(1, Math.floor(BEATS_PER_BAR / tokens.length));
      for (let i = 0; i < tokens.length; i++) {
        const symbol = tokens[i]!;
        const beats = i === tokens.length - 1 ? BEATS_PER_BAR - beatsPerChord * (tokens.length - 1) : beatsPerChord;
        targetChords.push({ symbol: isValidChord(symbol) ? symbol : fallbackKey, beats });
      }
    }
  } else {
    // 공백, 쉼표, 하이픈으로 구분된 단순 나열
    const tokens = line.split(/[\s,\-]+/).filter(Boolean);
    for (const t of tokens) {
      // 주석이나 불필요한 기호 건너뛰기
      if (t.startsWith("#") || t.startsWith("//")) continue;
      targetChords.push({
        symbol: isValidChord(t) ? t : fallbackKey,
        beats: 4,
      });
    }
  }
}

export function ChordInputView({ song, onApply, onNavigateToStudio }: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [title, setTitle] = useState(song.meta.title || "외부 노래 코드");
  const [key, setKey] = useState(song.meta.key || "C");
  const [bpm, setBpm] = useState(song.meta.bpm || 100);
  const [genre, setGenre] = useState<Genre>(song.meta.genre || "pop");
  const [inputMode, setInputMode] = useState<"visual" | "text">("visual");

  // 기본 초안 섹션 (현재 곡의 섹션 복사)
  const [draftSections, setDraftSections] = useState<DraftSection[]>(() =>
    song.sections.map((s, idx) => ({
      id: s.id || `sec_${idx + 1}`,
      name: s.name,
      chords: s.chords.map((c) => ({ ...c })),
    })),
  );

  // 텍스트 모드용 원문 텍스트
  const [rawText, setRawText] = useState(
    `[Intro] (4마디)\nC | G | Am | F\n\n[Verse] (8마디)\nC | G | Am | F\nC | G | F | C\n\n[Chorus] (8마디)\nAm | F | C | G\nAm | F | C | G`,
  );

  // 현재 Key에 대한 다이아토닉 코드 목록 계산 (원클릭 삽입용)
  const diatonicChords = useMemo(() => {
    try {
      const mode = modeOf(key);
      const degrees =
        mode === "minor"
          ? ["i", "ii°", "bIII", "iv", "v", "bVI", "bVII", "V7"]
          : ["I", "ii", "iii", "IV", "V", "vi", "vii°", "V7"];
      return degreesToChords(degrees, key).map((c) => c.symbol);
    } catch {
      return ["C", "Dm", "Em", "F", "G", "Am", "Bdim", "G7"];
    }
  }, [key]);

  // 총 마디 수 및 예상 재생 시간
  const totalBars = useMemo(() => {
    return draftSections.reduce((acc, s) => {
      const beats = s.chords.reduce((bSum, c) => bSum + c.beats, 0);
      return acc + Math.max(1, Math.ceil(beats / BEATS_PER_BAR));
    }, 0);
  }, [draftSections]);

  const estimatedMinutes = Math.floor((totalBars * 4 * (60 / bpm)) / 60);
  const estimatedSeconds = Math.round((totalBars * 4 * (60 / bpm)) % 60);

  // 외부 사이트 검색 링크 열기
  const openChordify = () => {
    const url = searchQuery.trim()
      ? `https://chordify.net/search/${encodeURIComponent(searchQuery.trim())}`
      : `https://chordify.net/`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openKlang = () => {
    window.open("https://songs.klang.io/en", "_blank", "noopener,noreferrer");
  };

  // 텍스트를 비주얼 섹션으로 적용
  const handleApplyText = () => {
    const parsed = parseTextToSections(rawText, key);
    if (parsed.length > 0) {
      setDraftSections(parsed);
      setInputMode("visual");
    }
  };

  // 비주얼 섹션 추가
  const addSection = (templateName: string, bars: number) => {
    const id = `sec_${Date.now()}_${draftSections.length + 1}`;
    const defaultChords: ChordSlot[] = Array.from({ length: bars }, (_, i) => ({
      symbol: diatonicChords[i % diatonicChords.length] || key,
      beats: 4,
    }));
    setDraftSections((prev) => [...prev, { id, name: templateName, chords: defaultChords }]);
  };

  // 섹션 드래그 앤 드롭 상태
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 섹션 순서 이동
  const moveSection = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || toIndex >= draftSections.length) return;
    setDraftSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      if (item) next.splice(toIndex, 0, item);
      return next;
    });
  };

  // 섹션 삭제
  const removeSection = (id: string) => {
    if (draftSections.length <= 1) {
      alert("최소 하나의 섹션은 남아 있어야 합니다.");
      return;
    }
    setDraftSections((prev) => prev.filter((s) => s.id !== id));
  };

  // 코드 슬롯 값 변경
  const updateChordSymbol = (sectionId: string, chordIndex: number, newSymbol: string) => {
    setDraftSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const nextChords = [...s.chords];
        if (nextChords[chordIndex]) {
          nextChords[chordIndex] = { ...nextChords[chordIndex]!, symbol: newSymbol };
        }
        return { ...s, chords: nextChords };
      }),
    );
  };

  // 코드 박자 변경 (2박 / 4박 토글)
  const toggleChordBeats = (sectionId: string, chordIndex: number) => {
    setDraftSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        const nextChords = [...s.chords];
        const cur = nextChords[chordIndex];
        if (cur) {
          const nextBeats = cur.beats === 4 ? 2 : cur.beats === 2 ? 1 : 4;
          nextChords[chordIndex] = { ...cur, beats: nextBeats };
        }
        return { ...s, chords: nextChords };
      }),
    );
  };

  // 코드 추가
  const addChordToSection = (sectionId: string, symbol: string) => {
    setDraftSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          chords: [...s.chords, { symbol, beats: 4 }],
        };
      }),
    );
  };

  // 코드 삭제
  const removeChordFromSection = (sectionId: string, chordIndex: number) => {
    setDraftSections((prev) =>
      prev.map((s) => {
        if (s.id !== sectionId) return s;
        if (s.chords.length <= 1) return s;
        return {
          ...s,
          chords: s.chords.filter((_, i) => i !== chordIndex),
        };
      }),
    );
  };

  // 최종 스튜디오 적용
  const handleApplyToStudio = () => {
    const preset = getPreset(genre);
    const variants = preset.variants;

    const sections: Section[] = draftSections.map((ds, idx) => {
      const isChorus = ds.name.includes("코러스") || ds.name.toLowerCase().includes("chorus");
      const intensity = isChorus ? "high" : "low";
      const trackPreset = variants[intensity][0] || variants.low[0]!;

      // 코드 박자 계산 및 마디 맞춤 (4박 단위로 패딩)
      const validChords: ChordSlot[] = ds.chords.map((c) => ({
        symbol: isValidChord(c.symbol.trim()) ? c.symbol.trim() : key,
        beats: c.beats > 0 ? c.beats : 4,
      }));

      const sumBeats = validChords.reduce((sum, c) => sum + c.beats, 0);
      const remainder = (BEATS_PER_BAR - (sumBeats % BEATS_PER_BAR)) % BEATS_PER_BAR;
      if (remainder > 0 && validChords.length > 0) {
        validChords[validChords.length - 1]!.beats += remainder;
      }
      const bars = Math.max(1, Math.ceil(validChords.reduce((sum, c) => sum + c.beats, 0) / BEATS_PER_BAR));

      return {
        id: ds.id || `section_${idx + 1}`,
        name: ds.name,
        bars,
        chords: validChords,
        tracks: JSON.parse(JSON.stringify(trackPreset)),
      };
    });

    const newSong: Song = {
      version: 1,
      meta: {
        title: title.trim() || `${searchQuery || "외부 곡"} (${key})`,
        key,
        bpm,
        genre,
        swing: preset.swing,
        humanizeMs: preset.humanizeMs,
        seed: Math.floor(Math.random() * 10000),
      },
      sections,
      arrangement: sections.map((s) => s.id),
      mixer: song.mixer,
    };

    onApply(newSong);
    onNavigateToStudio();
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4">
      {/* 1. 상단 허브: 외부 사이트 검색 & 곡 메타데이터 (Bento Grid) */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bento 1: 외부 악보 검색 & 연동 허브 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">🌐</span>
            <h2 className="text-base font-bold text-slate-900">외부 악보 사이트 검색 & 퀵 허브</h2>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              Chordify · Klang 연계
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-4">
            Chordify나 Klang에서 좋아하는 노래를 검색하여 <strong>코드 진행, 마디 수, 템포(BPM), Key</strong>를 파악한 뒤,
            아래에 입력하면 Chord Studio의 드럼·베이스·피아노·스트링 풀 편곡 사운드로 자동 변환됩니다.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!title || title === "외부 노래 코드") {
                    setTitle(e.target.value);
                  }
                }}
                placeholder="검색할 노래 제목 또는 아티스트 입력 (예: Let It Be, 아이유 밤편지)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
              />
            </div>
            <button
              onClick={openChordify}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
              title="Chordify에서 해당 노래의 코드를 새 창으로 검색합니다"
            >
              🎸 Chordify 검색
            </button>
            <button
              onClick={openKlang}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
              title="Klang Songs 사이트를 새 창으로 엽니다"
            >
              🎹 Klang Songs 열기
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <div className="font-semibold text-slate-700 mb-1">💡 외부 사이트 코드 파악 요령</div>
            <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-500">
              <li>사이트 상단에서 <strong>Key(조성)</strong>와 <strong>BPM(속도)</strong>을 먼저 확인하세요.</li>
              <li>화면에 네모 칸으로 지나가는 <strong>마디(Bar)</strong>별 코드(예: C, G, Am, F)를 확인하세요.</li>
              <li>일반적으로 1마디에 코드 1개(4박) 또는 2개(2박+2박)씩 연주됩니다.</li>
            </ul>
          </div>
        </section>

        {/* Bento 2: 곡 기본 설정 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚙️</span>
              <h2 className="text-base font-bold text-slate-900">곡 기본 설정</h2>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-slate-600 block mb-1">곡 제목</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="곡 제목을 입력하세요"
                  className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-medium text-slate-600 block mb-1">조성 (Key)</label>
                  <select
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800"
                  >
                    {ALL_KEYS.map((k) => (
                      <option key={k} value={k}>
                        {k} {k.endsWith("m") ? "(단조)" : "(장조)"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-600 block mb-1">템포 (BPM)</label>
                  <input
                    type="number"
                    min={40}
                    max={240}
                    value={bpm}
                    onChange={(e) => setBpm(Number(e.target.value) || 100)}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-mono font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-600 block mb-1">반주 편곡 스타일 (장르)</label>
                <div className="grid grid-cols-4 gap-1">
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={`rounded-md py-1.5 text-center text-xs font-medium transition-colors ${
                        genre === g
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {PRESETS[g].label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>총 마디: <strong>{totalBars}마디</strong></span>
            <span>예상 길이: <strong>{estimatedMinutes}분 {estimatedSeconds}초</strong></span>
          </div>
        </section>
      </div>

      {/* 2. 입력 방식 선택 (스마트 텍스트 vs 비주얼 빌더) */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-slate-200/70 p-1 select-none">
          <button
            onClick={() => setInputMode("visual")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              inputMode === "visual"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>🎛️</span> 비주얼 마디 빌더
          </button>
          <button
            onClick={() => setInputMode("text")}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              inputMode === "text"
                ? "bg-white text-indigo-700 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <span>📝</span> 텍스트 일괄 붙여넣기
          </button>
        </div>

        {inputMode === "visual" && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1 hidden sm:inline">섹션 빠른 추가:</span>
            {SECTION_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.name}
                onClick={() => addSection(tmpl.name, tmpl.defaultBars)}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-2xs hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                + {tmpl.name} ({tmpl.defaultBars}마디)
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. 본문 편집 영역 */}
      {inputMode === "text" ? (
        /* 스마트 텍스트 모드 */
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">코드 텍스트 일괄 입력</h3>
            <div className="flex gap-1.5 text-xs">
              <button
                onClick={() =>
                  setRawText(
                    `[Intro] (4마디)\nC | G | Am | F\n\n[Verse] (8마디)\nC | G | Am | F\nC | G | F | C\n\n[Chorus] (8마디)\nAm | F | C | G\nAm | F | C | G`,
                  )
                }
                className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
              >
                예시 1 (마디 구분 | )
              </button>
              <button
                onClick={() =>
                  setRawText(
                    `[벌스]\nC G Am F C G F C\n\n[코러스]\nAm F C G Am F C G`,
                  )
                }
                className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
              >
                예시 2 (단순 나열)
              </button>
            </div>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-hidden"
            placeholder="[Intro] C | G | Am | F 형태로 코드를 입력하거나 악보 사이트에서 복사한 텍스트를 붙여넣으세요"
          />

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-500">
              💡 <code>[섹션이름]</code>으로 섹션을 나누고, 마디는 <code>|</code>로 구분할 수 있습니다.
            </p>
            <button
              onClick={handleApplyText}
              className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition-colors"
            >
              마디 빌더로 변환해 확인하기 ➔
            </button>
          </div>
        </section>
      ) : (
        /* 비주얼 마디 빌더 모드 */
        <div className="space-y-4">
          {/* 다이아토닉 퀵 팔레트 */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 mr-1">
              🎹 {key}조 다이아토닉 코드 팔레트:
            </span>
            <div className="flex flex-wrap gap-1">
              {diatonicChords.map((chord) => (
                <button
                  key={chord}
                  onClick={() => {
                    const lastSec = draftSections[draftSections.length - 1];
                    if (lastSec) addChordToSection(lastSec.id, chord);
                  }}
                  className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-mono font-bold text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors"
                  title={`마지막 섹션에 ${chord} (4박) 코드를 추가합니다`}
                >
                  {chord}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400 ml-auto hidden md:inline">
              * 클릭 시 마지막 섹션에 코드가 추가됩니다
            </span>
          </div>

          {/* 섹션 카드 목록 */}
          <div className="space-y-4">
            {draftSections.map((section, sIdx) => {
              const secBeats = section.chords.reduce((sum, c) => sum + c.beats, 0);
              const secBars = Math.max(1, Math.ceil(secBeats / BEATS_PER_BAR));
              return (
                <section
                  key={section.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", String(sIdx));
                    e.dataTransfer.effectAllowed = "move";
                    setDraggedIndex(sIdx);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverIndex !== sIdx) setDragOverIndex(sIdx);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === sIdx) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedIndex !== null && draggedIndex !== sIdx) {
                      moveSection(draggedIndex, sIdx);
                    }
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDraggedIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`rounded-2xl border bg-white p-4 shadow-xs space-y-3 transition-all ${
                    draggedIndex === sIdx
                      ? "opacity-40 scale-[0.99] border-dashed border-indigo-400"
                      : "border-slate-200"
                  } ${
                    dragOverIndex === sIdx && draggedIndex !== sIdx
                      ? "border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/20"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-600 p-1 -ml-1 rounded select-none"
                        title="드래그하여 섹션 위치 변경"
                      >
                        <span className="text-base font-bold leading-none tracking-tighter">⋮⋮</span>
                      </div>
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                        {sIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={section.name}
                        onChange={(e) => {
                          const nextName = e.target.value;
                          setDraftSections((prev) =>
                            prev.map((s) => (s.id === section.id ? { ...s, name: nextName } : s)),
                          );
                        }}
                        className="rounded-md border border-slate-200 px-2 py-0.5 text-sm font-bold text-slate-800 focus:border-indigo-500"
                      />
                      <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {secBars}마디 ({secBeats}박자)
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                      {/* 순서 이동 퀵 버튼 */}
                      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          onClick={() => moveSection(sIdx, sIdx - 1)}
                          disabled={sIdx === 0}
                          aria-label="위로 이동"
                          title="위로 이동"
                          className="rounded px-1.5 py-0.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          ▲
                        </button>
                        <button
                          onClick={() => moveSection(sIdx, sIdx + 1)}
                          disabled={sIdx === draftSections.length - 1}
                          aria-label="아래로 이동"
                          title="아래로 이동"
                          className="rounded px-1.5 py-0.5 text-xs font-bold text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-25 disabled:hover:bg-transparent"
                        >
                          ▼
                        </button>
                      </div>

                      <button
                        onClick={() => addChordToSection(section.id, diatonicChords[0] || key)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                      >
                        + 코드 추가
                      </button>
                      <button
                        onClick={() => removeSection(section.id)}
                        className="rounded-md border border-red-200 bg-red-50/50 px-2 py-1 text-red-600 hover:bg-red-100"
                        title="이 섹션을 삭제합니다"
                      >
                        삭제 🗑
                      </button>
                    </div>
                  </div>

                  {/* 코드 칩 그리드 */}
                  <div className="flex flex-wrap gap-2">
                    {section.chords.map((chord, cIdx) => {
                      const isValid = isValidChord(chord.symbol.trim());
                      return (
                        <div
                          key={cIdx}
                          className={`flex items-center gap-1.5 rounded-xl border p-1.5 transition-all ${
                            isValid
                              ? "border-slate-200 bg-slate-50/80 hover:border-slate-300"
                              : "border-red-300 bg-red-50/50 ring-1 ring-red-200"
                          }`}
                        >
                          <input
                            type="text"
                            value={chord.symbol}
                            onChange={(e) => updateChordSymbol(section.id, cIdx, e.target.value)}
                            className="w-16 rounded-md bg-white px-2 py-1 text-center font-mono text-sm font-bold text-slate-800 shadow-2xs focus:outline-hidden"
                            placeholder="코드"
                          />
                          <button
                            onClick={() => toggleChordBeats(section.id, cIdx)}
                            className={`rounded-md px-1.5 py-1 text-[11px] font-semibold transition-colors ${
                              chord.beats === 4
                                ? "bg-slate-200 text-slate-700"
                                : "bg-indigo-100 text-indigo-800 font-bold"
                            }`}
                            title="클릭하면 박자가 변경됩니다 (4박 ⇄ 2박 ⇄ 1박)"
                          >
                            {chord.beats}박
                          </button>
                          <button
                            onClick={() => removeChordFromSection(section.id, cIdx)}
                            className="h-5 w-5 rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center text-xs"
                            title="이 코드 삭제"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. 최종 스튜디오 적용 플로팅/고정 액션 바 */}
      <div className="sticky bottom-4 z-20 rounded-2xl border border-indigo-200 bg-white/95 p-4 shadow-xl backdrop-blur flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {title} ({key} · {bpm} BPM · {PRESETS[genre].label})
          </div>
          <div className="text-xs text-slate-500">
            총 {draftSections.length}개 섹션 · {totalBars}마디 (약 {estimatedMinutes}분 {estimatedSeconds}초)
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateToStudio}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            취소 / 스튜디오로 돌아가기
          </button>
          <button
            onClick={handleApplyToStudio}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-md hover:bg-indigo-700 hover:shadow-lg transition-all"
          >
            <span>✨</span> Chord Studio에 적용하고 연주 듣기
          </button>
        </div>
      </div>
    </div>
  );
}
