// 음원 크레딧. CC BY 3.0 음원은 저작자 표기가 의무라 앱 안에서 항상 찾을 수 있게 둔다.
const SOURCES = [
  {
    name: "피아노 — Salamander Grand Piano V3",
    author: "Alexander Holm",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    url: "https://github.com/sfzinstruments/SalamanderGrandPiano",
    note: "Tone.js가 제공하는 mp3 버전을 그대로 사용",
  },
  {
    name: "스트링 — FluidR3 GM (String Ensemble 1)",
    author: "FluidR3 GM SoundFont (gleitz/midi-js-soundfonts 미러)",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0/",
    url: "https://github.com/gleitz/midi-js-soundfonts",
    note: "3반음 간격 샘플을 mp3로 변환해 사용",
  },
  {
    name: "드럼 — Virtuosity Drums",
    author: "Versilian Studios × Karoryfer Samples, 연주 Austin McMahon",
    license: "CC0 1.0 (표기 의무 없음)",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://github.com/sfzinstruments/virtuosity_drums",
    note: "길이를 다듬고 mp3로 변환",
  },
  {
    name: "베이스 — Black and Blue Basses",
    author: "Karoryfer Samples",
    license: "CC0 1.0 (표기 의무 없음)",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    url: "https://github.com/sfzinstruments/karoryfer.black-and-blue-basses",
    note: "3초로 다듬고 mp3로 변환",
  },
];

const link = "text-indigo-600 underline hover:text-indigo-500";

export function Credits() {
  return (
    <details className="mb-12 rounded-xl border border-slate-200 bg-white p-4 text-sm" aria-label="음원 크레딧">
      <summary className="cursor-pointer font-semibold">음원 크레딧</summary>
      <ul className="mt-3 space-y-3">
        {SOURCES.map((s) => (
          <li key={s.name} className="space-y-0.5">
            <p className="font-medium">{s.name}</p>
            <p className="text-slate-600">{s.author}</p>
            <p className="text-xs text-slate-500">
              <a href={s.licenseUrl} target="_blank" rel="noreferrer" className={link}>
                {s.license}
              </a>{" "}
              ·{" "}
              <a href={s.url} target="_blank" rel="noreferrer" className={link}>
                원본
              </a>{" "}
              · {s.note}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
