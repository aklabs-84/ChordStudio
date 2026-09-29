// 화면 그리기 중 예외가 나도 흰 화면 대신 안내를 보여준다. 자동저장본이 원인일 수 있어 초기화 버튼을 함께 둔다.
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

const AUTOSAVE_KEY = "chord-studio:autosave:v1";

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("앱 오류", error, info.componentStack);
  }

  private reset = () => {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      // 저장소가 막혀 있어도 새로고침은 진행한다
    }
    location.hash = "";
    location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md space-y-4 p-8 text-center">
        <h1 className="text-xl font-bold">문제가 생겼어요</h1>
        <p className="text-sm text-slate-600">화면을 그리다 오류가 났습니다. 새로고침해도 같으면 저장된 곡을 지우고 처음부터 시작하세요.</p>
        <p className="break-words rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-500">{this.state.error.message}</p>
        <div className="flex justify-center gap-2">
          <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => location.reload()}>
            새로고침
          </button>
          <button className="rounded-md bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-500" onClick={this.reset}>
            저장된 곡 지우고 시작
          </button>
        </div>
      </div>
    );
  }
}
