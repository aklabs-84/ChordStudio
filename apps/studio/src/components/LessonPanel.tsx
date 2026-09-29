import { useState } from "react";
import { playPreview } from "@chord-studio/core/preview";
import { LESSONS, type Accent, type LessonBlock, type ListenNote } from "../lessons/lessons";

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const sampleBaseUrl = `${import.meta.env.BASE_URL}samples/`;
const lessonShotBaseUrl = `${import.meta.env.BASE_URL}lesson-shots/`;

const ACCENT_CLASSES: Record<Accent, string> = {
  indigo: "border-indigo-300 bg-indigo-50 text-indigo-800",
  rose: "border-rose-300 bg-rose-50 text-rose-800",
  amber: "border-amber-300 bg-amber-50 text-amber-800",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

/** "▶ 듣기" 버튼: 클릭 시 짧은 예제음을 재생한다. 재생 중에는 중복 클릭을 막는다. */
function ListenButton({ notes, className = "" }: { notes: ListenNote[]; className?: string }) {
  const [playing, setPlaying] = useState(false);

  const handleClick = async () => {
    if (playing) return;
    setPlaying(true);
    try {
      await playPreview(notes, sampleBaseUrl);
    } finally {
      const totalMs = Math.max(...notes.map((n) => (n.at + n.dur) * 1000), 300);
      setTimeout(() => setPlaying(false), totalMs);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={playing}
      className={`rounded-full border border-indigo-300 px-2 py-0.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-50 ${className}`}
    >
      {playing ? "재생 중…" : "▶ 듣기"}
    </button>
  );
}

function Block({ block }: { block: LessonBlock }) {
  switch (block.type) {
    case "text":
      return <p className="leading-relaxed text-slate-700">{block.text}</p>;

    case "concepts":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {block.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg" aria-hidden>
                  {item.icon}
                </span>
                <span className="font-semibold text-slate-800">{item.title}</span>
                {item.listen && <ListenButton notes={item.listen} className="ml-auto" />}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      );

    case "compare":
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {block.items.map((item, i) => (
            <div key={i} className={`rounded-lg border-l-4 p-3 ${ACCENT_CLASSES[item.accent]}`}>
              <div className="mb-1 flex items-center gap-2 font-mono font-semibold">
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
                {item.listen && <ListenButton notes={item.listen} className="ml-auto" />}
              </div>
              <p className="text-sm leading-relaxed text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      );

    case "highlight":
      return (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <span className="text-lg" aria-hidden>
            {block.icon}
          </span>
          <p className="leading-relaxed text-amber-800">{block.text}</p>
        </div>
      );

    case "tryit":
      return (
        <div className="flex items-start gap-3 rounded-lg border border-indigo-300 bg-indigo-50 p-3">
          <span className="text-lg" aria-hidden>
            🎯
          </span>
          <div>
            <p className="mb-0.5 text-sm font-semibold text-indigo-800">직접 해보기</p>
            <p className="leading-relaxed text-indigo-700">{block.text}</p>
          </div>
        </div>
      );

    case "steps":
      return (
        <div className="space-y-3">
          {block.items.map((item, i) => (
            <div key={i} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="font-semibold text-slate-800">{item.title}</span>
                </div>
                <p className="mb-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
                {item.screenshot && (
                  <img
                    src={`${lessonShotBaseUrl}${item.screenshot}`}
                    alt={`${item.title} 화면 예시`}
                    className="w-full max-w-sm rounded-md border border-slate-200"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      );
  }
}

/** 레슨 탭: 아이콘·개념 카드·비교 카드·강조 박스로 구성된 블록을 순서대로 렌더링한다 */
export function LessonPanel() {
  const [index, setIndex] = useState(0);
  const lesson = LESSONS[index];
  if (!lesson) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-center gap-2" role="group" aria-label="레슨 진행">
        {LESSONS.map((l, i) => (
          <button
            key={l.title}
            onClick={() => setIndex(i)}
            aria-label={`${l.title}로 이동`}
            aria-current={i === index}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i === index ? "bg-indigo-600" : "bg-slate-300 hover:bg-slate-400"
            }`}
          />
        ))}
      </div>

      <section className={`${card} space-y-4`} aria-label="레슨">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <span aria-hidden>{lesson.icon}</span>
          {lesson.title}
        </h2>
        {lesson.blocks.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </section>

      <div className="flex justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          ◀ 이전 레슨
        </button>
        <span className="self-center text-sm text-slate-500">
          {index + 1} / {LESSONS.length}
        </span>
        <button
          onClick={() => setIndex((i) => Math.min(LESSONS.length - 1, i + 1))}
          disabled={index >= LESSONS.length - 1}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
        >
          다음 레슨 ▶
        </button>
      </div>
    </div>
  );
}
