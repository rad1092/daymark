import type { ReactNode } from "react";

export type DemoView = "today" | "records";

export interface DemoShellViewModel {
  view: DemoView;
  storageLocked: boolean;
  recoveryNeeded: boolean;
  savedAt: string;
  notice: string;
  undoAvailable: boolean;
}

export interface DemoShellActions {
  onViewChange: (view: DemoView) => void;
  onOpenSettings: () => void;
  onUndo: () => void;
  onDismissNotice: () => void;
}

interface DemoShellProps {
  viewModel: DemoShellViewModel;
  actions: DemoShellActions;
  content: ReactNode;
  dialogs: ReactNode;
}

function formatSavedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장됨";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function DemoShell({
  viewModel,
  actions,
  content,
  dialogs,
}: DemoShellProps) {
  const {
    view,
    storageLocked,
    recoveryNeeded,
    savedAt,
    notice,
    undoAvailable,
  } = viewModel;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <header className="app-header">
        <a
          className="wordmark"
          href="/"
          aria-label="Daymark 오늘"
          onClick={(event) => {
            event.preventDefault();
            actions.onViewChange("today");
          }}
        >
          <span aria-hidden="true">D</span>
          Daymark
        </a>
        <div className="header-meta">
          <nav className="product-nav" aria-label="Daymark 화면">
            <button
              type="button"
              aria-label="오늘 화면"
              aria-current={view === "today" ? "page" : undefined}
              onClick={() => actions.onViewChange("today")}
            >
              오늘
            </button>
            <button
              type="button"
              aria-label="기록 화면"
              aria-current={view === "records" ? "page" : undefined}
              onClick={() => actions.onViewChange("records")}
            >
              기록
            </button>
          </nav>
          <span className={storageLocked ? "save-state is-paused" : "save-state"}>
            {recoveryNeeded
              ? "백업 확인 필요"
              : storageLocked
                ? "저장 멈춤"
                : `저장 ${formatSavedTime(savedAt)}`}
          </span>
          <button type="button" onClick={actions.onOpenSettings}>
            데이터
          </button>
        </div>
      </header>

      {content}

      <footer className="app-footer">
        <span>Daymark</span>
        <p>
          새 일 <kbd>N</kbd> · 데이터는 현재 브라우저에 저장
        </p>
      </footer>

      <div className="live-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            {undoAvailable && (
              <button type="button" onClick={actions.onUndo}>
                되돌리기
              </button>
            )}
            <button type="button" onClick={actions.onDismissNotice}>
              닫기
            </button>
          </div>
        )}
      </div>

      {dialogs}
    </div>
  );
}
