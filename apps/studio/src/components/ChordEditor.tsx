// 섹션별 코드 카드. 카드를 누르면 아래에 편집 줄(기호·박자·추가·삭제)이 열린다.
import { memo, useEffect, useRef, useState } from "react";
import { addChord, isValidChord, removeChord, setChordSymbol, shiftChordBeats, splitChord, type Song } from "@chord-studio/core";

interface Props {
  song: Song;
  /** 지금 재생 중인 코드 (없으면 null). 재생 위치 전체가 아니라 코드가 바뀔 때만 달라지는 값만 받는다 */
  active: { sectionId: string; chordIndex: number } | null;
  onChange: (update: (song: Song) => Song) => void;
  /** 있으면 이 섹션 하나만 보여준다 (위자드 단계별 화면용) */
  onlySectionId?: string;
  /** 코드 버튼을 클릭했을 때 화음을 짧게 미리듣기 */
  onPreviewChord?: (symbol: string) => void;
  /** 지금 재생을 이 섹션 하나로 좁혀서 반복하고 있다면 그 섹션 id (만들기 화면 전용) */
  focusedSectionId?: string | null;
  /** "이 섹션만" 버튼 클릭: 같은 섹션이면 해제, 다르면 그 섹션으로 전환 */
  onToggleFocus?: (sectionId: string) => void;
}

interface Selected {
  sectionId: string;
  index: number;
}

const small =
  "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";

export const ChordEditor = memo(function ChordEditor({
  song,
  active: playing,
  onChange,
  onlySectionId,
  onPreviewChord,
  focusedSectionId,
  onToggleFocus,
}: Props) {
  const [sel, setSel] = useState<Selected | null>(null);
  const [draft, setDraft] = useState("");
  // Esc로 닫을 때는 blur가 commit을 부르므로 이번 한 번은 저장하지 않도록 표시한다
  const cancelling = useRef(false);

  const section = sel ? song.sections.find((s) => s.id === sel.sectionId) : undefined;
  const chord = sel && section ? section.chords[sel.index] : undefined;

  // 선택한 코드가 사라졌으면(삭제·새 곡) 선택을 푼다. 코드가 바뀌면 입력창도 맞춘다
  useEffect(() => {
    if (sel && !chord) setSel(null);
    else if (chord) setDraft(chord.symbol);
  }, [sel, chord]);

  // 재생 순서에서 처음 나오는 순서대로 한 번씩. 순서에 없는 섹션은 맨 뒤에 둔다
  const allOrdered = [
    ...new Set(song.arrangement),
    ...song.sections.map((s) => s.id).filter((id) => !song.arrangement.includes(id)),
  ].flatMap((id) => song.sections.filter((s) => s.id === id));
  const ordered = onlySectionId ? allOrdered.filter((s) => s.id === onlySectionId) : allOrdered;

  const valid = isValidChord(draft.trim());
  const commit = () => {
    if (cancelling.current) {
      cancelling.current = false;
      return;
    }
    if (!sel) return;
    if (valid) onChange((s0) => setChordSymbol(s0, sel.sectionId, sel.index, draft));
    else setDraft(chord?.symbol ?? "");
  };

  return (
    <div className="space-y-4">
      {ordered.map((s) => (
        <div key={s.id}>
          <p className="mb-1 flex items-center gap-2 text-xs text-slate-500">
            <span>
              {s.name} ({s.bars}마디){song.arrangement.includes(s.id) ? "" : " · 재생 순서에 없음"}
            </span>
            {onToggleFocus && (
              <button
                onClick={() => onToggleFocus(s.id)}
                aria-pressed={focusedSectionId === s.id}
                title={
                  focusedSectionId === s.id
                    ? "눌러서 전체 곡 재생으로 돌아가기"
                    : "눌러서 이 섹션만 반복 재생하기"
                }
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  focusedSectionId === s.id
                    ? "bg-amber-400 text-slate-900"
                    : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {focusedSectionId === s.id ? "🔂 이 섹션만 반복 중" : "🔂 이 섹션만"}
              </button>
            )}
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {s.chords.map((c, i) => {
              const active = playing?.sectionId === s.id && playing.chordIndex === i;
              const selected = sel?.sectionId === s.id && sel.index === i;
              return (
                <li key={i}>
                  <button
                    onClick={() => {
                      setSel(selected ? null : { sectionId: s.id, index: i });
                      onPreviewChord?.(c.symbol);
                    }}
                    aria-current={active ? "true" : undefined}
                    aria-pressed={selected}
                    aria-label={`${s.name} ${i + 1}번 코드 ${c.symbol} 편집`}
                    className={`min-w-16 rounded-md px-3 py-2 text-center font-mono text-sm transition-colors duration-75 ${
                      active
                        ? "bg-amber-400 font-bold text-slate-900 ring-2 ring-amber-200"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    } ${selected ? "outline outline-2 outline-indigo-500" : ""}`}
                  >
                    {c.symbol}
                    {c.beats !== 4 && <span className="ml-1 text-xs opacity-60">{c.beats}박</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {sel?.sectionId === s.id && chord && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" role="group" aria-label="코드 편집">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    cancelling.current = true;
                    setDraft(chord.symbol);
                    e.currentTarget.blur();
                  }
                }}
                aria-label="코드 기호"
                aria-invalid={!valid}
                className={`w-28 rounded-md border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm ${valid ? "" : "ring-2 ring-rose-500"}`}
              />
              <span className="flex items-center gap-1 text-sm">
                <button className={small} aria-label="박자 줄이기" onClick={() => onChange((s0) => shiftChordBeats(s0, s.id, sel.index, -1))}>
                  −
                </button>
                <span className="w-10 text-center font-mono">{chord.beats}박</span>
                <button className={small} aria-label="박자 늘리기" onClick={() => onChange((s0) => shiftChordBeats(s0, s.id, sel.index, 1))}>
                  +
                </button>
              </span>
              <button className={small} onClick={() => onChange((s0) => addChord(s0, s.id, sel.index, chord.symbol))}>
                뒤에 추가
              </button>
              <button
                className={small}
                disabled={chord.beats < 2}
                title="이 코드를 절반씩 두 코드로 나눕니다 (섹션 길이는 그대로)"
                onClick={() => onChange((s0) => splitChord(s0, s.id, sel.index))}
              >
                쪼개기
              </button>
              <button
                className={`${small} text-rose-600`}
                disabled={s.chords.length <= 1}
                onClick={() => onChange((s0) => removeChord(s0, s.id, sel.index))}
              >
                삭제
              </button>
              {!valid && <span className="text-xs text-rose-600">해석할 수 없는 코드입니다 (예: Cmaj7, F#m7b5, C/E)</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
