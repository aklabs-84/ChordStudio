// 재생 순서 칩. 칩을 누르면 아래에 이동(◀ ▶)·삭제 줄이 열리고, 맨 끝의 "+ 섹션"으로 섹션을 이어 붙인다.
// 칩은 드래그(마우스·터치 공용 Pointer Events)로도 순서를 바꿀 수 있다.
import { memo, useEffect, useRef, useState } from "react";
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

  // 드래그 재정렬 상태. dragIndex/dragOverIndex는 드래그 중일 때만 값을 가져 칩 스타일(반투명·강조 테두리)에 쓰인다.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const pointerOrigin = useRef<{ x: number; y: number } | null>(null);
  const originIndex = useRef<number | null>(null);
  const isDragging = useRef(false);
  const suppressClick = useRef(false);

  const handlePointerDown = (e: React.PointerEvent, i: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointerOrigin.current = { x: e.clientX, y: e.clientY };
    originIndex.current = i;
    isDragging.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pointerOrigin.current || originIndex.current === null) return;
    const dx = e.clientX - pointerOrigin.current.x;
    const dy = e.clientY - pointerOrigin.current.y;
    if (!isDragging.current) {
      if (Math.hypot(dx, dy) < 6) return;
      isDragging.current = true;
      suppressClick.current = true;
      setDragIndex(originIndex.current);
      try {
        (e.target as Element).setPointerCapture(e.pointerId);
      } catch {
        // 포인터 캡처를 지원하지 않는 환경이면 무시하고 elementFromPoint 판정만으로 진행한다
      }
    }
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-arr-index]");
    setDragOverIndex(el ? Number(el.dataset.arrIndex) : null);
  };

  const endDrag = (commit: boolean) => {
    if (commit && isDragging.current && originIndex.current !== null && dragOverIndex !== null && dragOverIndex !== originIndex.current) {
      const from = originIndex.current;
      const to = dragOverIndex;
      onChange((s) => moveArrangementItem(s, from, to - from));
      setSel((cur) => {
        if (cur === null) return cur;
        if (cur === from) return to;
        if (from < cur && cur <= to) return cur - 1;
        if (to <= cur && cur < from) return cur + 1;
        return cur;
      });
    }
    const wasDragging = isDragging.current;
    pointerOrigin.current = null;
    originIndex.current = null;
    isDragging.current = false;
    setDragIndex(null);
    setDragOverIndex(null);
    if (wasDragging) requestAnimationFrame(() => (suppressClick.current = false));
    else suppressClick.current = false;
  };

  const handlePointerUp = () => endDrag(true);
  const handlePointerCancel = () => endDrag(false);

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

  // 이 칩을 지우면 해당 섹션이 재생 순서 어디에도 안 남는 "마지막 사용"인 경우, 물어보고 섹션 자체도 함께 삭제한다.
  const deleteSelected = () => {
    if (sel === null) return;
    const sectionId = song.arrangement[sel]!;
    const isLastUse = song.arrangement.filter((id) => id === sectionId).length === 1;
    if (isLastUse) {
      if (!window.confirm(`"${nameOf(sectionId)}" 섹션이 재생 순서에서 완전히 빠지고, 섹션 자체도 삭제됩니다. 삭제할까요?`)) return;
      onChange((s) => removeSection(removeArrangementItem(s, sel), sectionId));
    } else {
      onChange((s) => removeArrangementItem(s, sel));
    }
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
                data-arr-index={i}
                onClick={() => {
                  if (suppressClick.current) return;
                  setSel(selected ? null : i);
                }}
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                aria-pressed={selected}
                aria-label={`${i + 1}번째 ${nameOf(id)} 편집 (드래그로 순서 변경 가능)`}
                className={`touch-none rounded px-2 py-1 ${
                  active ? "bg-amber-400 font-bold text-slate-900" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                } ${selected ? "outline outline-2 outline-indigo-500" : ""} ${dragIndex === i ? "opacity-40" : ""} ${
                  dragOverIndex === i && dragIndex !== i ? "ring-2 ring-indigo-400" : ""
                }`}
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
          <button className={`${small} text-rose-600`} disabled={song.arrangement.length <= 1} onClick={deleteSelected}>
            삭제
          </button>
        </div>
      )}
    </div>
  );
});
