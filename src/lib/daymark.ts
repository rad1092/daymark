import type {
  BlockedDetails,
  DayReceipt,
  DayReceiptItem,
  DaySummary,
  DaySummaryOutcome,
  DailyPlan,
  DaymarkData,
  DaymarkSnapshot,
  DaymarkTask,
  DeferredDetails,
  LegacyFocusRecord,
  PlanItem,
  PlanOutcome,
  ReviewItem,
  StorageLoadResult,
  TaskAction,
  TaskHistoryEntry,
  TaskStatus,
} from "../types";

export const DATA_VERSION = 3 as const;
export const STORAGE_KEY = "daymark:data:v3";
export const BACKUP_KEY = "daymark:data:backup:v3";
export const CORRUPT_PRIMARY_KEY = "daymark:data:corrupt:v3";
export const CORRUPT_HISTORY_KEY = "daymark:data:corrupt-history:v3";
export const SNAPSHOTS_KEY = "daymark:snapshots:v3";
export const V2_STORAGE_KEY = "daymark:data:v2";
export const V2_BACKUP_KEY = "daymark:data:backup:v2";
export const LEGACY_STORAGE_KEY = "daymark:data:v1";
export const LEGACY_BACKUP_KEY = "daymark:data:backup";
const SNAPSHOT_LIMIT = 20;
const CORRUPT_HISTORY_LIMIT = 5;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
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

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CorruptStorageRecord {
  capturedAt: string;
  source: "primary" | "backup";
  raw: string;
}

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

export function createId(prefix = "item"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDate(key: string, days: number): string {
  const date = parseLocalDate(key);
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

export function formatLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatPlanDate(key: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parseLocalDate(key));
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "시간 미정";
  if (value < 60) return `${value}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

export function createTask(
  title: string,
  now = new Date(),
  options: Partial<DaymarkTask> = {},
): DaymarkTask {
  return {
    id: createId("task"),
    title: title.trim(),
    notes: "",
    nextStep: "",
    status: "inbox",
    estimateMinutes: null,
    createdAt: now.toISOString(),
    completedAt: null,
    settledAt: null,
    blockedReason: null,
    reviewOn: null,
    legacy: null,
    ...options,
  };
}

export function createEmptyData(now = new Date()): DaymarkData {
  return {
    schemaVersion: DATA_VERSION,
    revision: 0,
    tasks: [],
    plans: [],
    archive: {
      legacyFocusRecords: [],
    },
    updatedAt: now.toISOString(),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
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

function createReceipt(
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

function tryParseV3(raw: string | null): DaymarkData | null {
  if (!raw) return null;
  try {
    return parseDaymarkData(raw);
  } catch {
    return null;
  }
}

function tryMigrateV2(
  raw: string | null,
  today: string,
  now: Date,
): DaymarkData | null {
  if (!raw) return null;
  try {
    return migrateV2Data(raw, today, now);
  } catch {
    return null;
  }
}

function tryMigrateV1(
  raw: string | null,
  today: string,
  now: Date,
): DaymarkData | null {
  if (!raw) return null;
  try {
    return migrateLegacyData(raw, today, now);
  } catch {
    return null;
  }
}

export function loadStoredData(
  storage: StorageLike,
  today = localDateKey(),
  now = new Date(),
): StorageLoadResult {
  const primaryRaw = storage.getItem(STORAGE_KEY);
  const primary = tryParseV3(primaryRaw);
  if (primary) {
    return {
      data: primary,
      recovered: false,
      needsRecovery: false,
      migrated: false,
      issue: null,
    };
  }

  const backupRaw = storage.getItem(BACKUP_KEY);
  const backup = tryParseV3(backupRaw);
  if (backup) {
    return {
      data: backup,
      recovered: true,
      needsRecovery: true,
      migrated: false,
      issue: "마지막 정상 백업을 열었습니다. 복구를 확정해 주세요.",
    };
  }

  if (primaryRaw || backupRaw) {
    return {
      data: null,
      recovered: false,
      needsRecovery: false,
      migrated: false,
      issue:
        "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다.",
    };
  }

  const v2Primary = tryMigrateV2(
    storage.getItem(V2_STORAGE_KEY),
    today,
    now,
  );
  if (v2Primary) {
    return {
      data: v2Primary,
      recovered: false,
      needsRecovery: false,
      migrated: true,
      issue:
        "기존 데이터를 새 형식으로 옮겼습니다. 날짜가 없던 나중 항목은 오늘 검토에 올렸습니다.",
    };
  }

  const v2Backup = tryMigrateV2(
    storage.getItem(V2_BACKUP_KEY),
    today,
    now,
  );
  if (v2Backup) {
    return {
      data: v2Backup,
      recovered: true,
      needsRecovery: false,
      migrated: true,
      issue:
        "이전 백업을 새 형식으로 옮겼습니다. 날짜가 없던 나중 항목은 오늘 검토에 올렸습니다.",
    };
  }

  const legacyPrimary = tryMigrateV1(
    storage.getItem(LEGACY_STORAGE_KEY),
    today,
    now,
  );
  if (legacyPrimary) {
    return {
      data: legacyPrimary,
      recovered: false,
      needsRecovery: false,
      migrated: true,
      issue:
        "기존 데이터를 새 형식으로 옮겼습니다. 이전 원본은 그대로 보관됩니다.",
    };
  }

  const legacyBackup = tryMigrateV1(
    storage.getItem(LEGACY_BACKUP_KEY),
    today,
    now,
  );
  if (legacyBackup) {
    return {
      data: legacyBackup,
      recovered: true,
      needsRecovery: false,
      migrated: true,
      issue:
        "이전 백업을 새 형식으로 옮겼습니다. 이전 원본은 그대로 보관됩니다.",
    };
  }

  const hadUnreadableData = Boolean(
    storage.getItem(V2_STORAGE_KEY) ||
      storage.getItem(V2_BACKUP_KEY) ||
    storage.getItem(LEGACY_STORAGE_KEY) ||
      storage.getItem(LEGACY_BACKUP_KEY),
  );
  return {
    data: null,
    recovered: false,
    needsRecovery: false,
    migrated: false,
    issue: hadUnreadableData
      ? "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다."
      : null,
  };
}

export function saveStoredData(
  storage: StorageLike,
  data: DaymarkData,
  expectedData?: DaymarkData,
): void {
  const currentRaw = storage.getItem(STORAGE_KEY);
  if (expectedData && currentRaw) {
    const current = parseDaymarkData(currentRaw);
    if (
      current.revision !== expectedData.revision ||
      JSON.stringify(current) !== JSON.stringify(expectedData)
    ) {
      throw new Error(
        "다른 탭에서 데이터가 바뀌었습니다. 이 탭을 새로 불러오세요.",
      );
    }
  }
  const previous = currentRaw;
  if (previous) {
    try {
      parseDaymarkData(previous);
      storage.setItem(BACKUP_KEY, previous);
    } catch {
      // Preserve the last known-good backup when the primary is invalid.
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadCorruptHistory(storage: StorageLike): CorruptStorageRecord[] {
  const raw = storage.getItem(CORRUPT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CorruptStorageRecord =>
        isObject(item) &&
        typeof item.capturedAt === "string" &&
        (item.source === "primary" || item.source === "backup") &&
        typeof item.raw === "string",
    );
  } catch {
    return [];
  }
}

function appendCorruptHistory(
  storage: StorageLike,
  records: CorruptStorageRecord[],
): void {
  if (records.length === 0) return;
  const combined = [...loadCorruptHistory(storage), ...records];
  const unique = combined.filter(
    (record, index) =>
      combined.findIndex(
        (candidate) =>
          candidate.source === record.source &&
          candidate.raw === record.raw,
      ) === index,
  );
  storage.setItem(
    CORRUPT_HISTORY_KEY,
    JSON.stringify(unique.slice(-CORRUPT_HISTORY_LIMIT)),
  );
}

function preserveCorruptPrimary(
  storage: StorageLike,
  primaryRaw: string,
  now = new Date(),
  additionalRecords: CorruptStorageRecord[] = [],
): void {
  const previous = storage.getItem(CORRUPT_PRIMARY_KEY);
  const historyRecords = [...additionalRecords];
  if (previous && previous !== primaryRaw) {
    historyRecords.push({
      capturedAt: now.toISOString(),
      source: "primary",
      raw: previous,
    });
  }
  appendCorruptHistory(storage, historyRecords);
  storage.setItem(CORRUPT_PRIMARY_KEY, primaryRaw);
}

export function confirmBackupRecovery(
  storage: StorageLike,
  recoveredData: DaymarkData,
  now = new Date(),
): void {
  const backupRaw = storage.getItem(BACKUP_KEY);
  if (!backupRaw) {
    throw new Error("확정할 정상 백업을 찾지 못했습니다.");
  }
  const backup = parseDaymarkData(backupRaw);
  if (JSON.stringify(backup) !== JSON.stringify(recoveredData)) {
    throw new Error("열린 데이터가 마지막 정상 백업과 다릅니다.");
  }

  const primaryRaw = storage.getItem(STORAGE_KEY);
  if (primaryRaw && tryParseV3(primaryRaw)) {
    throw new Error("현재 저장 데이터가 정상이므로 복구를 덮어쓸 수 없습니다.");
  }
  if (primaryRaw) {
    preserveCorruptPrimary(storage, primaryRaw, now);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(backup));
}

export function replaceUnreadableStoredData(
  storage: StorageLike,
  replacement: DaymarkData,
  now = new Date(),
): void {
  const primaryRaw = storage.getItem(STORAGE_KEY);
  if (primaryRaw && tryParseV3(primaryRaw)) {
    throw new Error("현재 저장 데이터가 정상이므로 덮어쓸 수 없습니다.");
  }

  const backupRaw = storage.getItem(BACKUP_KEY);
  const additionalRecords: CorruptStorageRecord[] = [];
  if (
    backupRaw &&
    !tryParseV3(backupRaw) &&
    backupRaw !== primaryRaw
  ) {
    additionalRecords.push({
      capturedAt: now.toISOString(),
      source: "backup",
      raw: backupRaw,
    });
  }
  if (primaryRaw) {
    preserveCorruptPrimary(
      storage,
      primaryRaw,
      now,
      additionalRecords,
    );
  } else {
    appendCorruptHistory(storage, additionalRecords);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(replacement));
}

function parseSnapshot(value: unknown): DaymarkSnapshot | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.label !== "string" ||
    !isObject(value.data)
  ) {
    return null;
  }
  try {
    return {
      id: value.id,
      createdAt: value.createdAt,
      label: value.label,
      data: parseDaymarkData(JSON.stringify(value.data)),
    };
  } catch {
    return null;
  }
}

export function loadSnapshots(storage: StorageLike): DaymarkSnapshot[] {
  const raw = storage.getItem(SNAPSHOTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSnapshot)
      .filter(
        (snapshot): snapshot is DaymarkSnapshot => snapshot !== null,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, SNAPSHOT_LIMIT);
  } catch {
    return [];
  }
}

export function saveSnapshot(
  storage: StorageLike,
  data: DaymarkData,
  label: string,
  now = new Date(),
): DaymarkSnapshot[] {
  const snapshot: DaymarkSnapshot = {
    id: createId("snapshot"),
    createdAt: now.toISOString(),
    label: label.trim() || "변경 전",
    data,
  };
  const snapshots = [snapshot, ...loadSnapshots(storage)].slice(
    0,
    SNAPSHOT_LIMIT,
  );
  storage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  return snapshots;
}

export function removeSnapshot(
  storage: StorageLike,
  snapshotId: string,
): DaymarkSnapshot[] {
  const snapshots = loadSnapshots(storage).filter(
    (snapshot) => snapshot.id !== snapshotId,
  );
  storage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  return snapshots;
}

export function restoreSnapshotData(
  current: DaymarkData,
  snapshot: DaymarkSnapshot,
  now = new Date(),
): DaymarkData {
  return adoptImportedData(current, snapshot.data, now);
}

export function adoptImportedData(
  current: DaymarkData,
  imported: DaymarkData,
  now = new Date(),
): DaymarkData {
  return stamp(
    {
      ...imported,
      revision: current.revision,
    },
    now,
  );
}

function stamp(data: DaymarkData, now: Date): DaymarkData {
  return {
    ...data,
    revision: data.revision + 1,
    updatedAt: now.toISOString(),
  };
}

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
