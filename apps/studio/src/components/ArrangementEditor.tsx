// 재생 순서 칩. 칩을 누르면 아래에 이동(◀ ▶)·삭제 줄이 열리고, 맨 끝의 "+ 섹션"으로 섹션을 이어 붙인다.
import { memo, useEffect, useState } from "react";
import {
  appendArrangementItem,
  moveArrangementItem,
  removeArrangementItem,
  removeSection,
  setArrangementRepeat,
  type Song,
} from "@chord-studio/core";

interface Props {
  song: Song;
  /** 지금 재생 중인 재생 순서 칸 (없으면 null). 재생 위치 전체가 아니라 이 값만 받아야 칸이 바뀔 때만 다시 그린다 */
  activeIndex: number | null;
  onChange: (update: (song: Song) => Song) => void;
}

const small =
  "rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";

export const ArrangementEditor = memo(function ArrangementEditor({ song, activeIndex, onChange }: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const nameOf = (id: string) => song.sections.find((s) => s.id === id)?.name ?? id;
  const last = song.arrangement.length - 1;

  // 순서가 줄어 선택한 칸이 없어지면 선택을 푼다
  useEffect(() => {
    if (sel !== null && sel > last) setSel(null);
  }, [sel, last]);

  const move = (delta: number) => {
    if (sel === null) return;
    onChange((s) => moveArrangementItem(s, sel, delta));
    setSel(sel + delta); // 옮긴 칩을 계속 따라간다
  };

  // 선택한 칩과 같은 섹션 id가 연달아 나오는 구간(반복 블록)의 시작·끝 칸
  let blockStart = sel ?? 0;
  let blockEnd = sel ?? 0;
  if (sel !== null) {
    const id = song.arrangement[sel];
    while (blockStart > 0 && song.arrangement[blockStart - 1] === id) blockStart--;
    while (blockEnd < last && song.arrangement[blockEnd + 1] === id) blockEnd++;
  }
  const repeatCount = blockEnd - blockStart + 1;

  const setRepeat = (count: number) => {
    if (sel === null || count < 1) return;
    onChange((s) => setArrangementRepeat(s, sel, count));
    setSel(blockStart); // 블록이 늘고 줄어도 블록 시작 칩을 계속 선택 상태로 유지
  };

  const usedSectionIds = new Set(song.arrangement);

  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="재생 순서">
        {song.arrangement.map((id, i) => {
          const active = activeIndex === i;
          const selected = sel === i;
          return (
            <li key={i}>
              <button
                onClick={() => setSel(selected ? null : i)}
                aria-pressed={selected}
                aria-label={`${i + 1}번째 ${nameOf(id)} 편집`}
                className={`rounded px-2 py-1 ${
                  active ? "bg-amber-400 font-bold text-slate-900" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                } ${selected ? "outline outline-2 outline-indigo-500" : ""}`}
              >
                {nameOf(id)}
              </button>
            </li>
          );
        })}
        {song.sections.map((s) => {
          const unused = !usedSectionIds.has(s.id);
          return (
            <li key={`add-${s.id}`} className="flex items-center gap-0.5">
              <button
                onClick={() => onChange((sg) => appendArrangementItem(sg, s.id))}
                aria-label={`재생 순서 끝에 ${s.name} 추가`}
                className="rounded border border-dashed border-slate-300 px-2 py-1 text-indigo-600 hover:bg-indigo-50"
              >
                + {s.name}
              </button>
              {unused && (
                <button
                  onClick={() => {
                    if (!window.confirm(`"${s.name}" 섹션을 완전히 삭제할까요? (재생 순서에서 쓰이지 않는 섹션입니다)`)) return;
                    onChange((sg) => removeSection(sg, s.id));
                  }}
                  aria-label={`사용하지 않는 ${s.name} 섹션 삭제`}
                  title="사용하지 않는 섹션 삭제"
                  className="rounded border border-dashed border-rose-200 px-1.5 py-1 text-rose-500 hover:bg-rose-50"
                >
                  🗑
                </button>
              )}
            </li>
          );
        })}
      </ol>

      {sel !== null && sel <= last && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" role="group" aria-label="재생 순서 편집">
          <span className="text-sm text-slate-600">
            {sel + 1}번째 · {nameOf(song.arrangement[sel]!)}
          </span>
          <button className={small} disabled={sel === 0} onClick={() => move(-1)} aria-label="앞으로 옮기기">
            ◀
          </button>
          <button className={small} disabled={sel === last} onClick={() => move(1)} aria-label="뒤로 옮기기">
            ▶
          </button>
          <span className="flex items-center gap-1 text-sm text-slate-600">
            반복
            <button className={small} disabled={repeatCount <= 1} onClick={() => setRepeat(repeatCount - 1)} aria-label="반복 횟수 줄이기">
              −
            </button>
            <span className="w-5 text-center font-semibold text-slate-800">{repeatCount}</span>
            <button className={small} onClick={() => setRepeat(repeatCount + 1)} aria-label="반복 횟수 늘리기">
              +
            </button>
          </span>
          <button
            className={`${small} text-rose-600`}
            disabled={song.arrangement.length <= 1}
            onClick={() => onChange((s) => removeArrangementItem(s, sel))}
          >
            삭제
          </button>
        </div>
      )}
    </div>
  );
});
