import type {
  DayReceipt,
  DaySummary,
  DaySummaryOutcome,
  DailyPlan,
  DaymarkData,
  DaymarkTask,
  PlanItem,
  ReviewItem,
  TaskHistoryEntry,
} from "../types";
import { localDateKey, shiftDate, stamp } from "./common";

export function getTask(
  data: DaymarkData,
  taskId: string,
): DaymarkTask | undefined {
  return data.tasks.find((task) => task.id === taskId);
}

export function getPlan(
  data: DaymarkData,
  date: string,
): DailyPlan | undefined {
  return data.plans.find((plan) => plan.date === date);
}

export function getPendingPlanItems(plan: DailyPlan | undefined): PlanItem[] {
  return plan?.items.filter((item) => item.outcome === "pending") ?? [];
}

export function getCommittedCount(plan: DailyPlan | undefined): number {
  return (
    plan?.items.filter(
      (item) => item.outcome === "pending" || item.outcome === "done",
    ).length ?? 0
  );
}

export function getRecentReceipts(
  data: DaymarkData,
  limit = 7,
): DayReceipt[] {
  return data.plans
    .flatMap((plan) => (plan.receipt ? [plan.receipt] : []))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, Math.max(1, Math.floor(limit)));
}

const SUMMARY_OUTCOMES: DaySummaryOutcome[] = [
  "done",
  "tomorrow",
  "later",
  "blocked",
  "deleted",
];

export function getRecentDaySummaries(
  data: DaymarkData,
  today = localDateKey(),
  days = 7,
): DaySummary[] {
  const length = Math.max(1, Math.floor(days));
  return Array.from({ length }, (_, index) => {
    const date = shiftDate(today, index - length + 1);
    const counts: DaySummary["counts"] = {
      done: 0,
      tomorrow: 0,
      later: 0,
      blocked: 0,
      deleted: 0,
    };
    const plan = getPlan(data, date);
    for (const item of plan?.items ?? []) {
      if (SUMMARY_OUTCOMES.includes(item.outcome as DaySummaryOutcome)) {
        counts[item.outcome as DaySummaryOutcome] += 1;
      }
    }
    return { date, counts };
  });
}

function taskHistoryDate(
  data: DaymarkData,
  task: DaymarkTask,
): { date: string; outcome: TaskHistoryEntry["outcome"] } | null {
  const planEvents = data.plans
    .flatMap((plan) =>
      plan.items
        .filter(
          (item) => item.taskId === task.id && item.outcome !== "pending",
        )
        .map((item) => ({
          date: item.resolvedAt
            ? localDateKey(new Date(item.resolvedAt))
            : plan.date,
          outcome: item.outcome as TaskHistoryEntry["outcome"],
        })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  if (planEvents[0]) return planEvents[0];
  if (task.status === "done" || task.status === "deleted") {
    return {
      date: localDateKey(
        new Date(task.settledAt ?? task.completedAt ?? task.createdAt),
      ),
      outcome: task.status,
    };
  }
  return null;
}

export function searchTaskHistory(
  data: DaymarkData,
  query = "",
): TaskHistoryEntry[] {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  return data.tasks
    .flatMap((task) => {
      const event = taskHistoryDate(data, task);
      if (!event) return [];
      const haystack = [task.title, task.notes, task.blockedReason ?? ""]
        .join("\n")
        .toLocaleLowerCase("ko-KR");
      if (normalized && !haystack.includes(normalized)) return [];
      return [{ task, ...event }];
    })
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.task.createdAt.localeCompare(a.task.createdAt),
    );
}

export function getCleanupCandidates(
  data: DaymarkData,
  cutoffDate: string,
): DaymarkTask[] {
  return data.tasks.filter((task) => {
    if (task.status !== "done" && task.status !== "deleted") return false;
    const settledAt = task.settledAt ?? task.completedAt;
    return Boolean(
      settledAt && localDateKey(new Date(settledAt)) < cutoffDate,
    );
  });
}

export function pruneSettledTasks(
  data: DaymarkData,
  cutoffDate: string,
  now = new Date(),
): DaymarkData {
  const candidateIds = new Set(
    getCleanupCandidates(data, cutoffDate).map((task) => task.id),
  );
  if (candidateIds.size === 0) return data;
  const plans = data.plans
    .map((plan) => {
      const items = plan.items.filter(
        (item) => !candidateIds.has(item.taskId),
      );
      return {
        ...plan,
        items,
        initialCommitmentIds: plan.initialCommitmentIds.filter(
          (taskId) => !candidateIds.has(taskId),
        ),
        currentTaskId:
          plan.currentTaskId && candidateIds.has(plan.currentTaskId)
            ? null
            : plan.currentTaskId,
        receipt: plan.receipt
          ? {
              ...plan.receipt,
              items: plan.receipt.items.filter(
                (item) => !candidateIds.has(item.taskId),
              ),
            }
          : null,
      };
    })
    .filter((plan) => plan.items.length > 0);
  return stamp(
    {
      ...data,
      tasks: data.tasks.filter((task) => !candidateIds.has(task.id)),
      plans,
    },
    now,
  );
}

export function getReviewItems(
  data: DaymarkData,
  today = localDateKey(),
): ReviewItem[] {
  const items: ReviewItem[] = [];
  const staleTaskIds = new Set<string>();
  const stalePlans = data.plans
    .filter((plan) => plan.date < today && plan.status !== "closed")
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const plan of stalePlans) {
    for (const item of plan.items) {
      if (item.outcome !== "pending") continue;
      staleTaskIds.add(item.taskId);
      items.push({
        taskId: item.taskId,
        source: "stale-plan",
        planDate: plan.date,
      });
    }
  }

  for (const task of data.tasks) {
    if (
      !staleTaskIds.has(task.id) &&
      (task.status === "later" || task.status === "blocked") &&
      task.reviewOn !== null &&
      task.reviewOn <= today
    ) {
      items.push({
        taskId: task.id,
        source: "scheduled",
        planDate: null,
      });
    }
  }
  return items;
}
