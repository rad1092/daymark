import type {
  DayReceipt,
  DayReceiptItem,
  DailyPlan,
  DaymarkData,
  DaymarkTask,
  LegacyFocusRecord,
  PlanItem,
  PlanOutcome,
  TaskStatus,
} from "../types";
import { DATA_VERSION, localDateKey } from "./common";

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TASK_STATUSES: TaskStatus[] = [
  "inbox",
  "planned",
  "later",
  "blocked",
  "done",
  "deleted",
];
const PLAN_STATUSES: DailyPlan["status"][] = [
  "draft",
  "active",
  "closing",
  "closed",
];
const PLAN_OUTCOMES: PlanOutcome[] = [
  "pending",
  "done",
  "later",
  "tomorrow",
  "blocked",
  "deleted",
  "carried",
];

interface LegacyTask {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  status: "inbox" | "today" | "done";
  createdAt: string;
  completedAt: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number;
  isTop3: boolean;
  top3Rank: number | null;
}

interface LegacyData {
  schemaVersion: 1;
  tasks: LegacyTask[];
  focusRecords: LegacyFocusRecord[];
  updatedAt?: string;
}

interface V2Task
  extends Omit<DaymarkTask, "nextStep" | "settledAt"> {
  settledAt?: string | null;
}

type V2Plan = Omit<DailyPlan, "initialCommitmentIds" | "receipt">;

interface V2Data {
  schemaVersion: 2;
  tasks: V2Task[];
  plans: V2Plan[];
  archive: {
    legacyFocusRecords: LegacyFocusRecord[];
  };
  updatedAt: string;
}


export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isTask(value: unknown): value is DaymarkTask {
  if (!isObject(value)) return false;
  const legacy = value.legacy;
  const validLegacy =
    legacy === null ||
    (isObject(legacy) &&
      Array.isArray(legacy.tags) &&
      legacy.tags.every((tag) => typeof tag === "string") &&
      isNullableString(legacy.scheduledTime));
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    typeof value.nextStep === "string" &&
    TASK_STATUSES.includes(value.status as TaskStatus) &&
    (value.estimateMinutes === null ||
      (typeof value.estimateMinutes === "number" &&
        Number.isFinite(value.estimateMinutes) &&
        value.estimateMinutes >= 5 &&
        value.estimateMinutes <= 720)) &&
    typeof value.createdAt === "string" &&
    isNullableString(value.completedAt) &&
    (value.settledAt === undefined || isNullableString(value.settledAt)) &&
    isNullableString(value.blockedReason) &&
    isNullableString(value.reviewOn) &&
    (value.reviewOn === null || DATE_PATTERN.test(value.reviewOn)) &&
    ((value.status !== "later" && value.status !== "blocked") ||
      (typeof value.reviewOn === "string" &&
        DATE_PATTERN.test(value.reviewOn))) &&
    (value.status !== "blocked" ||
      (typeof value.blockedReason === "string" &&
        value.blockedReason.trim().length > 0)) &&
    validLegacy
  );
}

function isPlanItem(value: unknown): value is PlanItem {
  if (!isObject(value)) return false;
  return (
    typeof value.taskId === "string" &&
    typeof value.addedAt === "string" &&
    PLAN_OUTCOMES.includes(value.outcome as PlanOutcome) &&
    isNullableString(value.resolvedAt)
  );
}

function isPlan(value: unknown): value is DailyPlan {
  if (!isObject(value)) return false;
  return (
    typeof value.date === "string" &&
    DATE_PATTERN.test(value.date) &&
    PLAN_STATUSES.includes(value.status as DailyPlan["status"]) &&
    Array.isArray(value.items) &&
    value.items.every(isPlanItem) &&
    Array.isArray(value.initialCommitmentIds) &&
    value.initialCommitmentIds.length <= 3 &&
    value.initialCommitmentIds.every((id) => typeof id === "string") &&
    isNullableString(value.currentTaskId) &&
    isNullableString(value.startedAt) &&
    isNullableString(value.closedAt) &&
    (value.receipt === null || isReceipt(value.receipt))
  );
}

function isReceiptItem(value: unknown): value is DayReceiptItem {
  if (!isObject(value)) return false;
  return (
    typeof value.taskId === "string" &&
    typeof value.title === "string" &&
    value.outcome !== "pending" &&
    PLAN_OUTCOMES.includes(value.outcome as PlanOutcome) &&
    typeof value.nextStep === "string" &&
    isNullableString(value.reviewOn) &&
    (value.reviewOn === null || DATE_PATTERN.test(value.reviewOn))
  );
}

function isReceipt(value: unknown): value is DayReceipt {
  if (!isObject(value)) return false;
  return (
    typeof value.date === "string" &&
    DATE_PATTERN.test(value.date) &&
    typeof value.closedAt === "string" &&
    Array.isArray(value.items) &&
    value.items.length <= 3 &&
    value.items.every(isReceiptItem)
  );
}

export function createReceipt(
  plan: DailyPlan,
  tasks: DaymarkTask[],
  closedAt: string,
): DayReceipt {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return {
    date: plan.date,
    closedAt,
    items: plan.initialCommitmentIds.map((taskId) => {
      const item = plan.items.find(
        (candidate) => candidate.taskId === taskId,
      );
      const task = taskById.get(taskId);
      if (!item || !task || item.outcome === "pending") {
        throw new Error("오늘의 약속 결과를 확인할 수 없습니다.");
      }
      return {
        taskId,
        title: task.title,
        outcome: item.outcome,
        nextStep: task.nextStep,
        reviewOn: task.reviewOn,
      };
    }),
  };
}

function isLegacyFocusRecord(value: unknown): value is LegacyFocusRecord {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    isNullableString(value.taskId) &&
    typeof value.taskTitle === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.endedAt === "string" &&
    typeof value.minutes === "number" &&
    Number.isFinite(value.minutes)
  );
}

export function parseDaymarkData(raw: string): DaymarkData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 형식을 읽을 수 없습니다.");
  }
  if (!isObject(parsed) || parsed.schemaVersion !== DATA_VERSION) {
    throw new Error("지원하지 않는 Daymark 백업 버전입니다.");
  }
  if (
    typeof parsed.revision !== "number" ||
    !Number.isSafeInteger(parsed.revision) ||
    parsed.revision < 0
  ) {
    throw new Error("데이터 변경 번호를 확인할 수 없습니다.");
  }
  if (!Array.isArray(parsed.tasks) || !parsed.tasks.every(isTask)) {
    throw new Error("할 일 데이터가 손상되었습니다.");
  }
  if (!Array.isArray(parsed.plans) || !parsed.plans.every(isPlan)) {
    throw new Error("하루 계획 데이터가 손상되었습니다.");
  }
  if (
    !isObject(parsed.archive) ||
    !Array.isArray(parsed.archive.legacyFocusRecords) ||
    !parsed.archive.legacyFocusRecords.every(isLegacyFocusRecord)
  ) {
    throw new Error("보관 데이터가 손상되었습니다.");
  }
  if (typeof parsed.updatedAt !== "string") {
    throw new Error("저장 시각을 확인할 수 없습니다.");
  }

  const data = parsed as unknown as DaymarkData;
  const taskIds = new Set(data.tasks.map((task) => task.id));
  if (taskIds.size !== data.tasks.length) {
    throw new Error("중복된 할 일이 있습니다.");
  }
  const planDates = new Set(data.plans.map((plan) => plan.date));
  if (planDates.size !== data.plans.length) {
    throw new Error("같은 날짜의 계획이 두 개 이상 있습니다.");
  }

  const pendingTaskIds = new Set<string>();
  for (const plan of data.plans) {
    const itemTaskIds = new Set<string>();
    const initialIds = new Set(plan.initialCommitmentIds);
    if (initialIds.size !== plan.initialCommitmentIds.length) {
      throw new Error("오늘의 약속이 중복되었습니다.");
    }
    for (const item of plan.items) {
      if (!taskIds.has(item.taskId)) {
        throw new Error("계획이 존재하지 않는 할 일을 참조합니다.");
      }
      if (itemTaskIds.has(item.taskId)) {
        throw new Error("한 계획에 같은 할 일이 중복되었습니다.");
      }
      itemTaskIds.add(item.taskId);
      if (item.outcome === "pending") {
        if (pendingTaskIds.has(item.taskId)) {
          throw new Error("같은 할 일이 여러 날짜에 미처리 상태입니다.");
        }
        pendingTaskIds.add(item.taskId);
      }
    }
    if (
      plan.initialCommitmentIds.some(
        (taskId) => !itemTaskIds.has(taskId),
      )
    ) {
      throw new Error("오늘의 약속이 계획 항목과 일치하지 않습니다.");
    }
    if (plan.receipt) {
      if (plan.receipt.date !== plan.date) {
        throw new Error("하루 정리 기록의 날짜가 일치하지 않습니다.");
      }
      if (
        plan.receipt.items.some(
          (item) =>
            !itemTaskIds.has(item.taskId) ||
            !initialIds.has(item.taskId),
        )
      ) {
        throw new Error("하루 정리 기록이 약속과 일치하지 않습니다.");
      }
    }
    if (
      plan.status === "closed" &&
      plan.items.some((item) => item.outcome === "pending")
    ) {
      throw new Error("닫힌 계획에 미처리 할 일이 남아 있습니다.");
    }
    const committed = plan.items.filter(
      (item) => item.outcome === "pending" || item.outcome === "done",
    ).length;
    if (committed > 3) {
      throw new Error("하루의 약속은 세 개를 넘을 수 없습니다.");
    }
    if (
      plan.currentTaskId !== null &&
      !plan.items.some(
        (item) =>
          item.taskId === plan.currentTaskId && item.outcome === "pending",
      )
    ) {
      throw new Error("현재 작업이 미처리 약속과 일치하지 않습니다.");
    }
  }
  const resolvedByTask = new Map<string, string>();
  for (const plan of data.plans) {
    for (const item of plan.items) {
      if (!item.resolvedAt) continue;
      const current = resolvedByTask.get(item.taskId);
      if (!current || item.resolvedAt > current) {
        resolvedByTask.set(item.taskId, item.resolvedAt);
      }
    }
  }
  return {
    ...data,
    tasks: data.tasks.map((task) => ({
      ...task,
      settledAt:
        task.settledAt ??
        task.completedAt ??
        (task.status === "deleted"
          ? resolvedByTask.get(task.id) ?? data.updatedAt
          : null),
    })),
  };
}

export function parseBackupData(
  raw: string,
  today = localDateKey(),
  now = new Date(),
): { data: DaymarkData; migrated: boolean } {
  let header: unknown;
  try {
    header = JSON.parse(raw);
  } catch {
    throw new Error("JSON 형식을 읽을 수 없습니다.");
  }
  if (!isObject(header)) {
    throw new Error("Daymark 백업 구조를 확인할 수 없습니다.");
  }
  if (header.schemaVersion === DATA_VERSION) {
    return { data: parseDaymarkData(raw), migrated: false };
  }
  if (header.schemaVersion === 2) {
    return { data: migrateV2Data(raw, today, now), migrated: true };
  }
  if (header.schemaVersion === 1) {
    return { data: migrateLegacyData(raw, today, now), migrated: true };
  }
  throw new Error("지원하지 않는 Daymark 백업 버전입니다.");
}

function parseV2Data(raw: string): V2Data {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("이전 Daymark 데이터를 읽을 수 없습니다.");
  }
  if (
    !isObject(parsed) ||
    parsed.schemaVersion !== 2 ||
    !Array.isArray(parsed.tasks) ||
    !parsed.tasks.every(isObject) ||
    !Array.isArray(parsed.plans) ||
    !parsed.plans.every(
      (plan) =>
        isObject(plan) &&
        Array.isArray(plan.items) &&
        plan.items.every(isObject),
    ) ||
    !isObject(parsed.archive) ||
    !Array.isArray(parsed.archive.legacyFocusRecords) ||
    typeof parsed.updatedAt !== "string"
  ) {
    throw new Error("이전 Daymark 데이터가 손상되었습니다.");
  }
  return parsed as unknown as V2Data;
}

export function migrateV2Data(
  raw: string,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const legacy = parseV2Data(raw);
  const tasks = legacy.tasks.map<DaymarkTask>((task) => ({
    ...task,
    nextStep: "",
    settledAt: task.settledAt ?? task.completedAt ?? null,
    reviewOn:
      task.status === "later" && task.reviewOn === null
        ? today
        : task.reviewOn,
  }));
  const plans = legacy.plans.map<DailyPlan>((plan) => {
    const initialCommitmentIds =
      plan.status === "draft"
        ? []
        : plan.items.slice(0, 3).map((item) => item.taskId);
    const closedAt =
      plan.closedAt ??
      (plan.status === "closed" ? legacy.updatedAt : null);
    const migratedPlan: DailyPlan = {
      ...plan,
      initialCommitmentIds,
      closedAt,
      receipt: null,
    };
    return {
      ...migratedPlan,
      receipt:
        plan.status === "closed" && closedAt
          ? createReceipt(migratedPlan, tasks, closedAt)
          : null,
    };
  });
  return parseDaymarkData(
    JSON.stringify({
      schemaVersion: DATA_VERSION,
      revision: 0,
      tasks,
      plans,
      archive: legacy.archive,
      updatedAt: now.toISOString(),
    }),
  );
}

function isLegacyTask(value: unknown): value is LegacyTask {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    (value.status === "inbox" ||
      value.status === "today" ||
      value.status === "done") &&
    typeof value.createdAt === "string" &&
    isNullableString(value.completedAt) &&
    isNullableString(value.scheduledDate) &&
    isNullableString(value.scheduledTime) &&
    typeof value.durationMinutes === "number" &&
    typeof value.isTop3 === "boolean" &&
    (value.top3Rank === null || typeof value.top3Rank === "number")
  );
}

function parseLegacyData(raw: string): LegacyData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("이전 Daymark 데이터를 읽을 수 없습니다.");
  }
  if (
    !isObject(parsed) ||
    parsed.schemaVersion !== 1 ||
    !Array.isArray(parsed.tasks) ||
    !parsed.tasks.every(isLegacyTask)
  ) {
    throw new Error("이전 Daymark 데이터가 손상되었습니다.");
  }
  const focusRecords = Array.isArray(parsed.focusRecords)
    ? parsed.focusRecords.filter(isLegacyFocusRecord)
    : [];
  return {
    schemaVersion: 1,
    tasks: parsed.tasks,
    focusRecords,
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
  };
}

function legacyTaskOrder(a: LegacyTask, b: LegacyTask): number {
  if (a.isTop3 !== b.isTop3) return a.isTop3 ? -1 : 1;
  if (a.isTop3 && b.isTop3) {
    return (a.top3Rank ?? 99) - (b.top3Rank ?? 99);
  }
  return (a.scheduledTime ?? "99:99").localeCompare(
    b.scheduledTime ?? "99:99",
  );
}

export function migrateLegacyData(
  raw: string,
  today = localDateKey(),
  now = new Date(),
): DaymarkData {
  const legacy = parseLegacyData(raw);
  const tasks = legacy.tasks.map<DaymarkTask>((task) => {
    let status: TaskStatus = "inbox";
    let reviewOn: string | null = null;
    if (task.status === "done") status = "done";
    if (
      task.status === "today" &&
      task.scheduledDate &&
      task.scheduledDate > today
    ) {
      status = "later";
      reviewOn = task.scheduledDate;
    }
    return {
      id: task.id,
      title: task.title,
      notes: task.notes,
      nextStep: "",
      status,
      estimateMinutes:
        Number.isFinite(task.durationMinutes) &&
        task.durationMinutes >= 5 &&
        task.durationMinutes <= 720
          ? task.durationMinutes
          : null,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      settledAt: task.completedAt,
      blockedReason: null,
      reviewOn,
      legacy: {
        tags: [...task.tags],
        scheduledTime: task.scheduledTime,
      },
    };
  });

  const plans: DailyPlan[] = [];
  const grouped = new Map<string, LegacyTask[]>();
  for (const task of legacy.tasks) {
    if (task.status !== "today") continue;
    const date = task.scheduledDate ?? today;
    if (date > today) continue;
    const list = grouped.get(date) ?? [];
    list.push(task);
    grouped.set(date, list);
  }

  for (const [date, legacyTasks] of grouped) {
    const ordered = [...legacyTasks].sort(legacyTaskOrder);
    const promised = ordered.slice(0, 3);
    const overflow = ordered.slice(3);
    for (const task of promised) {
      const migrated = tasks.find((item) => item.id === task.id);
      if (migrated) migrated.status = "planned";
    }
    for (const task of overflow) {
      const migrated = tasks.find((item) => item.id === task.id);
      if (migrated) migrated.status = "inbox";
    }
    plans.push({
      date,
      status: "draft",
      items: promised.map((task) => ({
        taskId: task.id,
        addedAt: task.createdAt,
        outcome: "pending",
        resolvedAt: null,
      })),
      initialCommitmentIds: [],
      currentTaskId: null,
      startedAt: null,
      closedAt: null,
      receipt: null,
    });
  }

  return {
    schemaVersion: DATA_VERSION,
    revision: 0,
    tasks,
    plans: plans.sort((a, b) => a.date.localeCompare(b.date)),
    archive: {
      legacyFocusRecords: legacy.focusRecords,
    },
    updatedAt: now.toISOString(),
  };
}
