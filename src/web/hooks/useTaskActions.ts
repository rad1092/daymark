import {
  actOnLooseTask,
  actOnPlannedTask,
  resolveReviewItem,
  updateTask,
} from "../../lib/daymark";
import type {
  BlockedDetails,
  DaymarkTask,
  DeferredDetails,
  ReviewItem,
  TaskAction,
} from "../../types";
import type {
  DemoCommit,
  TaskActionHandlers,
  TaskDetailsPatch,
} from "../types";

function confirmDelete(title: string, action: () => void): void {
  if (window.confirm(`“${title}”을 삭제할까요?`)) action();
}

export function useTaskActions(
  today: string,
  commit: DemoCommit,
): TaskActionHandlers {
  const updateTaskDetails = (
    taskId: string,
    patch: TaskDetailsPatch,
  ) => commit((current) => updateTask(current, taskId, patch));

  const handlePlannedAction = (
    planDate: string,
    task: DaymarkTask,
    action: TaskAction,
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            actOnPlannedTask(
              current,
              planDate,
              task.id,
              action,
              today,
            ),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        actOnPlannedTask(
          current,
          planDate,
          task.id,
          action,
          today,
          new Date(),
          details,
        ),
      action === "done"
        ? "완료했습니다."
        : action === "tomorrow"
          ? "내일 다시 봅니다."
          : action === "later"
            ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
            : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  const handleLooseAction = (
    task: DaymarkTask,
    action: Exclude<TaskAction, "done">,
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) => actOnLooseTask(current, task.id, action, today),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        actOnLooseTask(
          current,
          task.id,
          action,
          today,
          new Date(),
          details,
        ),
      action === "tomorrow"
        ? "내일 다시 봅니다."
        : action === "later"
          ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
          : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  const handleReviewAction = (
    item: ReviewItem,
    task: DaymarkTask,
    action: TaskAction | "today",
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) => resolveReviewItem(current, item, action, today),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        resolveReviewItem(
          current,
          item,
          action,
          today,
          new Date(),
          details,
        ),
      action === "today"
        ? "오늘 할 일로 가져왔습니다."
        : action === "done"
          ? "완료했습니다."
          : action === "tomorrow"
            ? "내일 다시 봅니다."
            : action === "later"
              ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
              : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  return {
    updateTaskDetails,
    handlePlannedAction,
    handleLooseAction,
    handleReviewAction,
  };
}
