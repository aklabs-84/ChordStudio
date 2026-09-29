// 자동저장: 곡 전체(믹서 포함)를 localStorage에 한 벌 저장한다.
// 개인정보 보호 모드·저장 차단 등으로 언제든 실패할 수 있으므로 모두 try/catch로 감싼다.
import { parseSongJson, type Song } from "@chord-studio/core";

const KEY = "chord-studio:autosave:v1";

export function loadSong(): Song | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    // 파일 불러오기와 같은 경로로 검사·정리한다 (믹서 보정, 알 수 없는 필드 제거). 망가진 저장본은 지워 다음 실행부터 새로 시작한다.
    const result = parseSongJson(raw);
    if (result.ok) return result.song;
    localStorage.removeItem(KEY);
    return null;
  } catch {
    return null;
  }
}

export function saveSong(song: Song): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(song));
  } catch {
    // 저장이 막혀 있어도 앱은 그대로 동작한다
  }
}
