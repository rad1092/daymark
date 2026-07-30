import { addCapturedTask } from "../../lib/daymark";
import { CaptureForm } from "../components/TaskComponents";
import { ClosingPanel } from "./today/ClosingPanel";
import { CommitmentPlan } from "./today/CommitmentPlan";
import { CurrentExecution } from "./today/CurrentExecution";
import {
  ClosedDayReceipt,
  DayHeading,
} from "./today/DayStatus";
import {
  InboxSection,
  ParkedSection,
} from "./today/InboxParkedSections";
import { ReviewPanel } from "./today/ReviewPanel";
import type { TodayViewProps } from "./today/types";

export function TodayView({
  viewModel,
  actions,
}: TodayViewProps) {
  const {
    data,
    today,
    plan,
    reviewItems,
    pendingItems,
    committedItems,
    executionItems,
    inboxTasks,
    parkedTasks,
    commitmentTasks,
    estimatedTasks,
    estimatedMinutes,
    hasStorageConflict,
  } = viewModel;
  const isPlanning =
    plan?.status !== "active" &&
    plan?.status !== "closing" &&
    plan?.status !== "closed";
  const collectionActions = {
    commit: actions.commit,
    updateTaskDetails: actions.updateTaskDetails,
    handleLooseAction: actions.handleLooseAction,
    openDecision: actions.openDecision,
  };
  const inboxViewModel = {
    tasks: inboxTasks,
    today,
    plan,
  };
  const parkedViewModel = {
    tasks: parkedTasks,
    today,
    plan,
  };
  const capture = (
    <CaptureForm
      inputRef={actions.captureRef}
      onCapture={(title) =>
        actions.commit(
          (current) => addCapturedTask(current, title),
          "수집함에 추가했습니다.",
        )
      }
    />
  );
  const inbox = (
    <InboxSection
      viewModel={inboxViewModel}
      actions={collectionActions}
    />
  );
  const parked = (
    <ParkedSection
      viewModel={parkedViewModel}
      actions={collectionActions}
    />
  );
  const review = (
    <ReviewPanel
      viewModel={{ data, today, plan, items: reviewItems }}
      actions={actions}
    />
  );

  return (
    <main id="main" className="workspace">
      <DayHeading
        plan={plan}
        commitmentTasks={commitmentTasks}
        estimatedTasks={estimatedTasks}
        estimatedMinutes={estimatedMinutes}
      />

      {hasStorageConflict && (
        <section className="conflict-banner" aria-live="assertive">
          <div>
            <strong>다른 탭에서 변경됨</strong>
            <p>이 탭에서는 저장을 멈췄습니다.</p>
          </div>
          <button type="button" onClick={actions.reloadExternalData}>
            변경 불러오기
          </button>
        </section>
      )}

      {plan?.status !== "active" &&
        plan?.status !== "closing" &&
        reviewItems.length > 0 &&
        review}

      {plan?.status === "closing" && (
        <ClosingPanel
          viewModel={{ data, today, plan, pendingItems }}
          actions={actions}
        />
      )}

      {plan?.status === "closed" && (
        <ClosedDayReceipt plan={plan} today={today} actions={actions} />
      )}

      {isPlanning && capture}
      {isPlanning && inbox}

      {isPlanning && (
        <CommitmentPlan
          viewModel={{
            data,
            today,
            plan,
            committedItems,
            pendingItems,
          }}
          actions={actions}
        />
      )}

      {plan?.status === "active" && (
        <CurrentExecution
          viewModel={{
            data,
            today,
            plan,
            committedItems,
            executionItems,
            pendingItems,
          }}
          actions={actions}
        />
      )}

      {(plan?.status === "active" || plan?.status === "closing") &&
        reviewItems.length > 0 &&
        review}

      {isPlanning && parked}

      {!isPlanning && (
        <details className="during-day-extras">
          <summary>
            <span>수집함 {inboxTasks.length}</span>
            <span>예정 및 막힘 {parkedTasks.length}</span>
          </summary>
          <div>
            {capture}
            {inbox}
            {parked}
          </div>
        </details>
      )}
    </main>
  );
}
