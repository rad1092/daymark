import type {
  BlockedDetails,
  DailyPlan,
  DaymarkData,
  DaymarkTask,
  DeferredDetails,
  PlanOutcome,
  ReviewItem,
  TaskAction,
} from "../types";
import {
  createTask,
  localDateKey,
  shiftDate,
  stamp,
} from "./common";
import { createReceipt, DATE_PATTERN } from "./schema";
import {
  getCommittedCount,
  getPendingPlanItems,
  getPlan,
  getTask,
} from "./queries";

export function addCapturedTask(
  data: DaymarkData,
  title: string,
  now = new Date(),
): DaymarkData {
  const cleanTitle = title.trim();
  if (!cleanTitle) throw new Error("할 일을 입력해 주세요.");
  return stamp(
    {
      ...data,
      tasks: [createTask(cleanTitle, now), ...data.tasks],
    },
    now,
  );
}

function createDraftPlan(date: string): DailyPlan {
  return {
    date,
    status: "draft",
    items: [],
    initialCommitmentIds: [],
    currentTaskId: null,
    startedAt: null,
    closedAt: null,
    receipt: null,
  };
}

function replacePlan(data: DaymarkData, nextPlan: DailyPlan): DaymarkData {
  const exists = data.plans.some((plan) => plan.date === nextPlan.date);
  return {
    ...data,
    plans: exists
      ? data.plans.map((plan) =>
          plan.date === nextPlan.date ? nextPlan : plan,
        )
      : [...data.plans, nextPlan].sort((a, b) =>
          a.date.localeCompare(b.date),
        ),
  };
}

export function addTaskToToday(
  data: DaymarkData,
  taskId: string,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const task = getTask(data, taskId);
  if (!task || task.status === "done" || task.status === "deleted") {
    throw new Error("오늘로 가져올 수 없는 할 일입니다.");
  }
  const pendingElsewhere = data.plans.some(
    (candidate) =>
      candidate.date !== today &&
      candidate.items.some(
        (item) => item.taskId === taskId && item.outcome === "pending",
      ),
  );
  if (pendingElsewhere) {
    throw new Error("이전 날짜의 결정을 먼저 마쳐 주세요.");
  }
  const existingPlan = getPlan(data, today);
  if (existingPlan?.status === "closed") {
    throw new Error("오늘은 이미 정리했습니다.");
  }
  if (existingPlan?.status === "active") {
    throw new Error("시작한 뒤에는 오늘의 약속을 늘릴 수 없습니다.");
  }
  if (existingPlan?.status === "closing") {
    throw new Error("하루 정리를 마친 뒤 계획을 바꿀 수 있습니다.");
  }
  if (
    existingPlan?.items.some(
      (item) =>
        item.taskId === taskId &&
        (item.outcome === "pending" || item.outcome === "done"),
    )
  ) {
    return data;
  }
  if (getCommittedCount(existingPlan) >= 3) {
    throw new Error("오늘의 약속 세 자리가 모두 찼습니다.");
  }

  const plan = existingPlan ?? createDraftPlan(today);
  const nextPlan: DailyPlan = {
    ...plan,
    items: [
      ...plan.items,
      {
        taskId,
        addedAt: now.toISOString(),
        outcome: "pending",
        resolvedAt: null,
      },
    ],
    currentTaskId:
      plan.status === "active" && plan.currentTaskId === null
        ? taskId
        : plan.currentTaskId,
  };
  const withPlan = replacePlan(data, nextPlan);
  return stamp(
    {
      ...withPlan,
      tasks: withPlan.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              status: "planned",
              reviewOn: null,
              blockedReason: null,
              completedAt: null,
              settledAt: null,
            }
          : item,
      ),
    },
    now,
  );
}

export function removeTaskFromToday(
  data: DaymarkData,
  taskId: string,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  const task = getTask(data, taskId);
  if (
    !plan ||
    plan.status !== "draft" ||
    !task ||
    !plan.items.some(
      (item) => item.taskId === taskId && item.outcome === "pending",
    )
  ) {
    throw new Error("시작 전 약속만 오늘에서 뺄 수 있습니다.");
  }
  const nextPlan = {
    ...plan,
    items: plan.items.filter((item) => item.taskId !== taskId),
  };
  const withPlan = replacePlan(data, nextPlan);
  return stamp(
    {
      ...withPlan,
      tasks: withPlan.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              status: "inbox",
              reviewOn: null,
              blockedReason: null,
            }
          : item,
      ),
    },
    now,
  );
}

export function updateTask(
  data: DaymarkData,
  taskId: string,
  patch: Pick<
    Partial<DaymarkTask>,
    "title" | "notes" | "nextStep" | "estimateMinutes"
  >,
  now = new Date(),
): DaymarkData {
  const task = getTask(data, taskId);
  if (!task) return data;
  const title = patch.title === undefined ? task.title : patch.title.trim();
  if (!title) throw new Error("할 일 제목은 비워 둘 수 없습니다.");
  const estimate =
    patch.estimateMinutes === undefined
      ? task.estimateMinutes
      : patch.estimateMinutes;
  if (
    estimate !== null &&
    (!Number.isFinite(estimate) || estimate < 5 || estimate > 720)
  ) {
    throw new Error("예상시간은 5분에서 12시간 사이로 입력해 주세요.");
  }
  return stamp(
    {
      ...data,
      tasks: data.tasks.map((item) =>
        item.id === taskId
          ? {
              ...item,
              ...patch,
              title,
              estimateMinutes: estimate,
            }
          : item,
      ),
    },
    now,
  );
}

export function startPlan(
  data: DaymarkData,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  const pending = getPendingPlanItems(plan);
  if (!plan || pending.length === 0) {
    throw new Error("오늘의 약속을 한 개 이상 정해 주세요.");
  }
  if (plan.status === "closed") {
    throw new Error("오늘은 이미 정리했습니다.");
  }
  const nextPlan: DailyPlan = {
    ...plan,
    status: "active",
    initialCommitmentIds:
      plan.initialCommitmentIds.length > 0
        ? plan.initialCommitmentIds
        : pending.slice(0, 3).map((item) => item.taskId),
    currentTaskId:
      plan.currentTaskId &&
      pending.some((item) => item.taskId === plan.currentTaskId)
        ? plan.currentTaskId
        : pending[0].taskId,
    startedAt: plan.startedAt ?? now.toISOString(),
  };
  return stamp(replacePlan(data, nextPlan), now);
}

export function chooseCurrentTask(
  data: DaymarkData,
  taskId: string,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (
    !plan ||
    plan.status !== "active" ||
    !plan.items.some(
      (item) => item.taskId === taskId && item.outcome === "pending",
    )
  ) {
    throw new Error("현재 작업으로 선택할 수 없습니다.");
  }
  return stamp(
    replacePlan(data, { ...plan, currentTaskId: taskId }),
    now,
  );
}

export function reorderPendingTask(
  data: DaymarkData,
  taskId: string,
  direction: -1 | 1,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (!plan || plan.status === "closed" || plan.status === "closing") {
    return data;
  }
  const pending = plan.items.filter((item) => item.outcome === "pending");
  const index = pending.findIndex((item) => item.taskId === taskId);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= pending.length) return data;
  [pending[index], pending[nextIndex]] = [pending[nextIndex], pending[index]];
  let pendingIndex = 0;
  const nextItems = plan.items.map((item) =>
    item.outcome === "pending" ? pending[pendingIndex++] : item,
  );
  return stamp(replacePlan(data, { ...plan, items: nextItems }), now);
}

export function beginDayClose(
  data: DaymarkData,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (!plan || plan.status === "closed") return data;
  return stamp(
    replacePlan(data, {
      ...plan,
      status: "closing",
      currentTaskId: null,
    }),
    now,
  );
}

export function resumeDay(
  data: DaymarkData,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (!plan || plan.status !== "closing") return data;
  const firstPending = getPendingPlanItems(plan)[0]?.taskId ?? null;
  return stamp(
    replacePlan(data, {
      ...plan,
      status: "active",
      currentTaskId: firstPending,
    }),
    now,
  );
}

export function closeDay(
  data: DaymarkData,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (!plan) throw new Error("정리할 오늘 계획이 없습니다.");
  if (plan.status !== "closing") {
    throw new Error("하루 정리를 먼저 시작해 주세요.");
  }
  if (getPendingPlanItems(plan).length > 0) {
    throw new Error("남은 약속을 먼저 처리해 주세요.");
  }
  const closedAt = now.toISOString();
  const closedPlan: DailyPlan = {
    ...plan,
    status: "closed",
    currentTaskId: null,
    closedAt,
    receipt: null,
  };
  return stamp(
    replacePlan(data, {
      ...closedPlan,
      receipt: createReceipt(closedPlan, data.tasks, closedAt),
    }),
    now,
  );
}

export function reopenDay(
  data: DaymarkData,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const plan = getPlan(data, today);
  if (!plan || plan.status !== "closed") {
    throw new Error("오늘 닫은 계획만 다시 열 수 있습니다.");
  }
  const commitmentIds = new Set(plan.initialCommitmentIds);
  const nextPlan: DailyPlan = {
    ...plan,
    status: "active",
    items: plan.items.map((item) =>
      commitmentIds.has(item.taskId)
        ? {
            ...item,
            outcome: "pending",
            resolvedAt: null,
          }
        : item,
    ),
    currentTaskId: plan.initialCommitmentIds[0] ?? null,
    closedAt: null,
    receipt: null,
  };
  const withPlan = replacePlan(data, nextPlan);
  return stamp(
    {
      ...withPlan,
      tasks: withPlan.tasks.map((task) =>
        commitmentIds.has(task.id)
          ? {
              ...task,
              status: "planned",
              completedAt: null,
              settledAt: null,
              reviewOn: null,
              blockedReason: null,
            }
          : task,
      ),
    },
    now,
  );
}

function actionOutcome(action: TaskAction): PlanOutcome {
  return action === "done" ? "done" : action;
}

function applyTaskFields(
  task: DaymarkTask,
  action: TaskAction,
  today: string,
  now: Date,
  details?: BlockedDetails | DeferredDetails,
): DaymarkTask {
  if (action === "done") {
    return {
      ...task,
      status: "done",
      completedAt: now.toISOString(),
      settledAt: now.toISOString(),
      reviewOn: null,
      blockedReason: null,
    };
  }
  if (action === "tomorrow") {
    const nextStep = details?.nextStep.trim() ?? "";
    if (!nextStep) {
      throw new Error("다음에 시작할 지점을 입력해 주세요.");
    }
    return {
      ...task,
      status: "later",
      completedAt: null,
      settledAt: null,
      reviewOn: shiftDate(today, 1),
      nextStep,
      blockedReason: null,
    };
  }
  if (action === "later") {
    const nextStep = details?.nextStep.trim() ?? "";
    const reviewOn = details?.reviewOn ?? "";
    if (
      !nextStep ||
      !DATE_PATTERN.test(reviewOn) ||
      reviewOn <= today
    ) {
      throw new Error(
        "다시 볼 날짜와 다음에 시작할 지점을 입력해 주세요.",
      );
    }
    return {
      ...task,
      status: "later",
      completedAt: null,
      settledAt: null,
      reviewOn,
      nextStep,
      blockedReason: null,
    };
  }
  if (action === "blocked") {
    const blocked = details as BlockedDetails | undefined;
    if (
      !blocked?.reason.trim() ||
      !DATE_PATTERN.test(blocked.reviewOn) ||
      blocked.reviewOn <= today ||
      !blocked.nextStep.trim()
    ) {
      throw new Error(
        "막힌 이유, 다시 볼 날짜, 다음에 시작할 지점을 입력해 주세요.",
      );
    }
    return {
      ...task,
      status: "blocked",
      completedAt: null,
      settledAt: null,
      reviewOn: blocked.reviewOn,
      nextStep: blocked.nextStep.trim(),
      blockedReason: blocked.reason.trim(),
    };
  }
  return {
    ...task,
    status: "deleted",
    completedAt: null,
    settledAt: now.toISOString(),
    reviewOn: null,
    blockedReason: null,
  };
}

function settleOldPlans(
  data: DaymarkData,
  today: string,
  now: Date,
): DaymarkData {
  return {
    ...data,
    plans: data.plans.map((plan) => {
      if (
        plan.date >= today ||
        plan.status === "closed" ||
        getPendingPlanItems(plan).length > 0
      ) {
        return plan;
      }
      const closedAt = plan.closedAt ?? now.toISOString();
      const closedPlan: DailyPlan = {
        ...plan,
        status: "closed",
        currentTaskId: null,
        closedAt,
        receipt: null,
      };
      return {
        ...closedPlan,
        receipt: createReceipt(closedPlan, data.tasks, closedAt),
      };
    }),
  };
}

export function actOnPlannedTask(
  data: DaymarkData,
  planDate: string,
  taskId: string,
  action: TaskAction,
  today = localDateKey(),
  now = new Date(),
  details?: BlockedDetails | DeferredDetails,
): DaymarkData {
  const plan = getPlan(data, planDate);
  const task = getTask(data, taskId);
  if (
    !plan ||
    !task ||
    !plan.items.some(
      (item) => item.taskId === taskId && item.outcome === "pending",
    )
  ) {
    throw new Error("처리할 약속을 찾지 못했습니다.");
  }
  const resolvedAt = now.toISOString();
  const nextItems = plan.items.map((item) =>
    item.taskId === taskId && item.outcome === "pending"
      ? {
          ...item,
          outcome: actionOutcome(action),
          resolvedAt,
        }
      : item,
  );
  const nextCurrent =
    plan.currentTaskId === taskId
      ? (nextItems.find((item) => item.outcome === "pending")?.taskId ?? null)
      : plan.currentTaskId;
  const withPlan = replacePlan(data, {
    ...plan,
    items: nextItems,
    currentTaskId: nextCurrent,
  });
  const withTask: DaymarkData = {
    ...withPlan,
    tasks: withPlan.tasks.map((item) =>
      item.id === taskId
        ? applyTaskFields(item, action, today, now, details)
        : item,
    ),
  };
  return stamp(settleOldPlans(withTask, today, now), now);
}

export function actOnLooseTask(
  data: DaymarkData,
  taskId: string,
  action: Exclude<TaskAction, "done">,
  today = localDateKey(),
  now = new Date(),
  details?: BlockedDetails | DeferredDetails,
): DaymarkData {
  const task = getTask(data, taskId);
  if (!task || task.status === "planned" || task.status === "done") {
    throw new Error("이 상태에서는 할 일을 옮길 수 없습니다.");
  }
  return stamp(
    {
      ...data,
      tasks: data.tasks.map((item) =>
        item.id === taskId
          ? applyTaskFields(item, action, today, now, details)
          : item,
      ),
    },
    now,
  );
}

function markStaleItemCarried(
  data: DaymarkData,
  item: ReviewItem,
  today: string,
  now: Date,
): DaymarkData {
  if (!item.planDate) return data;
  const plan = getPlan(data, item.planDate);
  if (!plan) return data;
  const nextPlan: DailyPlan = {
    ...plan,
    items: plan.items.map((planItem) =>
      planItem.taskId === item.taskId && planItem.outcome === "pending"
        ? {
            ...planItem,
            outcome: "carried",
            resolvedAt: now.toISOString(),
          }
        : planItem,
    ),
    currentTaskId:
      plan.currentTaskId === item.taskId ? null : plan.currentTaskId,
  };
  return settleOldPlans(replacePlan(data, nextPlan), today, now);
}

export function resolveReviewItem(
  data: DaymarkData,
  item: ReviewItem,
  action: TaskAction | "today",
  today = localDateKey(),
  now = new Date(),
  details?: BlockedDetails | DeferredDetails,
): DaymarkData {
  if (action === "today") {
    const carried =
      item.source === "stale-plan"
        ? markStaleItemCarried(data, item, today, now)
        : data;
    return addTaskToToday(carried, item.taskId, today, now);
  }
  if (item.source === "stale-plan" && item.planDate) {
    return actOnPlannedTask(
      data,
      item.planDate,
      item.taskId,
      action,
      today,
      now,
      details,
    );
  }
  const task = getTask(data, item.taskId);
  if (!task) throw new Error("검토할 할 일을 찾지 못했습니다.");
  return stamp(
    {
      ...data,
      tasks: data.tasks.map((candidate) =>
        candidate.id === item.taskId
          ? applyTaskFields(candidate, action, today, now, details)
          : candidate,
      ),
    },
    now,
  );
}
