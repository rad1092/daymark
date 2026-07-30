import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addCapturedTask,
  beginDayClose,
  closeDay,
  getPendingPlanItems,
  getPlan,
  getReviewItems,
  getTask,
  localDateKey,
} from "../lib/daymark";
import { createRuntime } from "../runtime/createRuntime";
import type { DaymarkTask } from "../types";
import { CaptureBar } from "./components/CaptureBar";
import { CurrentCommitment } from "./components/CurrentCommitment";
import { DraftPlan } from "./components/DraftPlan";
import { InboxPanel, UpNext } from "./components/InboxPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { SoftwareHeader } from "./components/SoftwareHeader";
import "./software.css";
import { useDaymarkStore } from "./useDaymarkStore";
import { usePlatformSettings } from "./usePlatformSettings";

function SoftwareApp() {
  const runtime = useMemo(() => createRuntime(), []);
  const {
    data,
    status,
    notice,
    setNotice,
    commit,
    reload,
  } = useDaymarkStore(runtime.repository);
  const captureRef = useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const focusCapture = useCallback(() => {
    window.requestAnimationFrame(() => captureRef.current?.focus());
  }, []);
  const reportPlatformError = useCallback(
    (message: string) => setNotice(message),
    [setNotice],
  );
  const {
    capabilities,
    alwaysOnTop,
    launchAtLogin,
    toggleAlwaysOnTop,
    toggleLaunchAtLogin,
  } = usePlatformSettings(
    runtime.platform,
    focusCapture,
    reportPlatformError,
  );

  if (!data) {
    return (
      <main className="software-shell software-shell--center">
        <section className="software-state" role="status">
          <span className="software-mark" aria-hidden="true" />
          <h1>Daymark</h1>
          <p>
            {status === "failed"
              ? notice
              : "데이터 저장소 여는 중"}
          </p>
          {status === "failed" && (
            <button type="button" onClick={() => void reload()}>
              다시 열기
            </button>
          )}
        </section>
      </main>
    );
  }

  const today = localDateKey();
  const plan = getPlan(data, today);
  const pendingTasks = getPendingPlanItems(plan)
    .map((item) => getTask(data, item.taskId))
    .filter((task): task is DaymarkTask => Boolean(task));
  const currentTask =
    (plan?.currentTaskId &&
      getTask(data, plan.currentTaskId)) ||
    null;
  const inboxTasks = data.tasks
    .filter((task) => task.status === "inbox")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviewCount = getReviewItems(data, today).length;
  const busy = status === "saving";

  return (
    <main className="software-shell">
      {runtime.repository.kind === "browser-preview" && (
        <div className="preview-warning" role="status">
          브라우저 미리보기 · SQLite와 운영체제 기능은 설치판에서만 작동
        </div>
      )}

      <SoftwareHeader
        platform={runtime.platform}
        desktopWindowControls={capabilities.desktopWindowControls}
        alwaysOnTop={alwaysOnTop}
        settingsOpen={settingsOpen}
        onToggleAlwaysOnTop={() => void toggleAlwaysOnTop()}
        onToggleSettings={() => setSettingsOpen((open) => !open)}
      />

      {settingsOpen && (
        <SettingsPanel
          runtime={runtime}
          data={data}
          launchAtLogin={launchAtLogin}
          launchAtLoginSupported={capabilities.launchAtLogin}
          onToggleLaunchAtLogin={() => void toggleLaunchAtLogin()}
          onNotice={setNotice}
          commit={commit}
        />
      )}

      <CaptureBar
        inputRef={captureRef}
        busy={busy}
        onCapture={(title) =>
          commit(
            (current) => addCapturedTask(current, title),
            "수집함에 넣었습니다.",
          )
        }
      />

      {reviewCount > 0 && (
        <div className="review-warning">
          이전 결정 대기 {reviewCount}개 · 시작 전 계획에서 먼저 정리해야
          합니다.
        </div>
      )}

      {plan?.status === "active" && currentTask ? (
        <CurrentCommitment
          task={currentTask}
          planDate={plan.date}
          today={today}
          busy={busy}
          commit={commit}
        />
      ) : plan?.status === "active" &&
        pendingTasks.length === 0 ? (
        <section className="empty-card">
          <p className="section-kicker">오늘</p>
          <h1>세 약속을 모두 결정했습니다.</h1>
          <button
            type="button"
            className="button-primary"
            onClick={() =>
              void commit(
                (current) =>
                  closeDay(
                    beginDayClose(current, today),
                    today,
                  ),
                "오늘 기록을 닫았습니다.",
              )
            }
            disabled={busy}
          >
            오늘 닫기
          </button>
        </section>
      ) : plan?.status === "closed" ? (
        <section className="empty-card">
          <p className="section-kicker">오늘</p>
          <h1>오늘의 약속을 닫았습니다.</h1>
          <p>새로 적는 일은 수집함에만 쌓입니다.</p>
        </section>
      ) : (
        <DraftPlan
          tasks={pendingTasks}
          today={today}
          busy={busy}
          commit={commit}
        />
      )}

      {plan && (
        <UpNext
          plan={plan}
          currentTaskId={currentTask?.id ?? null}
          tasks={pendingTasks}
          today={today}
          busy={busy}
          commit={commit}
        />
      )}

      <InboxPanel
        plan={plan}
        tasks={inboxTasks}
        commitmentCount={pendingTasks.length}
        today={today}
        busy={busy}
        commit={commit}
      />

      <footer className="software-footer" aria-live="polite">
        <span className={`save-dot save-dot--${status}`} />
        <span>
          {status === "saving"
            ? "저장 중"
            : status === "failed"
              ? notice || "저장하지 못했습니다."
              : notice || "저장됨"}
        </span>
        {status === "failed" && (
          <button type="button" onClick={() => void reload()}>
            다시 불러오기
          </button>
        )}
      </footer>
    </main>
  );
}

export default SoftwareApp;
