import { useMemo } from "react";
import {
  getPendingPlanItems,
  getPlan,
  getReviewItems,
  getTask,
} from "../../lib/daymark";
import type {
  DaymarkData,
  DaymarkTask,
} from "../../types";
import type { TodayViewModel } from "../views/today/types";

export function useTodayViewModel(
  data: DaymarkData,
  today: string,
  hasStorageConflict: boolean,
): TodayViewModel {
  const plan = useMemo(() => getPlan(data, today), [data, today]);
  const reviewItems = useMemo(
    () => getReviewItems(data, today),
    [data, today],
  );
  const pendingItems = useMemo(() => getPendingPlanItems(plan), [plan]);
  const committedItems = useMemo(() => {
    if (!plan) return [];
    if (plan.status === "draft") {
      return plan.items.filter((item) => item.outcome === "pending");
    }
    const itemByTask = new Map(
      plan.items.map((item) => [item.taskId, item]),
    );
    return plan.initialCommitmentIds
      .map((taskId) => itemByTask.get(taskId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [plan]);
  const executionItems = useMemo(() => {
    if (!plan || plan.status === "draft") return committedItems;
    const pending = committedItems.filter(
      (item) => item.outcome === "pending",
    );
    return [
      ...pending.filter((item) => item.taskId === plan.currentTaskId),
      ...pending.filter((item) => item.taskId !== plan.currentTaskId),
    ];
  }, [committedItems, plan]);
  const inboxTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => task.status === "inbox")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.tasks],
  );
  const parkedTasks = useMemo(
    () =>
      data.tasks
        .filter(
          (task) =>
            (task.status === "later" || task.status === "blocked") &&
            !reviewItems.some((review) => review.taskId === task.id),
        )
        .sort((a, b) => {
          if (a.reviewOn && b.reviewOn) {
            return a.reviewOn.localeCompare(b.reviewOn);
          }
          if (a.reviewOn) return -1;
          if (b.reviewOn) return 1;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [data.tasks, reviewItems],
  );
  const commitmentTasks = committedItems
    .map((item) => getTask(data, item.taskId))
    .filter((task): task is DaymarkTask => Boolean(task));
  const estimatedTasks = commitmentTasks.filter(
    (task) => task.estimateMinutes !== null,
  );
  const estimatedMinutes = estimatedTasks.reduce(
    (total, task) => total + (task.estimateMinutes ?? 0),
    0,
  );

  return {
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
  };
}
