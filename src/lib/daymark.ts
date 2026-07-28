import type {
  BlockedDetails,
  DailyPlan,
  DaymarkData,
  DaymarkTask,
  LegacyFocusRecord,
  PlanItem,
  PlanOutcome,
  ReviewItem,
  StorageLoadResult,
  TaskAction,
  TaskStatus,
} from "../types";

export const DATA_VERSION = 2 as const;
export const STORAGE_KEY = "daymark:data:v2";
export const BACKUP_KEY = "daymark:data:backup:v2";
export const LEGACY_STORAGE_KEY = "daymark:data:v1";
export const LEGACY_BACKUP_KEY = "daymark:data:backup";

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
    status: "inbox",
    estimateMinutes: null,
    createdAt: now.toISOString(),
    completedAt: null,
    blockedReason: null,
    reviewOn: null,
    legacy: null,
    ...options,
  };
}

export function createEmptyData(now = new Date()): DaymarkData {
  return {
    schemaVersion: DATA_VERSION,
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
    TASK_STATUSES.includes(value.status as TaskStatus) &&
    (value.estimateMinutes === null ||
      (typeof value.estimateMinutes === "number" &&
        Number.isFinite(value.estimateMinutes) &&
        value.estimateMinutes >= 5 &&
        value.estimateMinutes <= 720)) &&
    typeof value.createdAt === "string" &&
    isNullableString(value.completedAt) &&
    isNullableString(value.blockedReason) &&
    isNullableString(value.reviewOn) &&
    (value.reviewOn === null || DATE_PATTERN.test(value.reviewOn)) &&
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
    isNullableString(value.currentTaskId) &&
    isNullableString(value.startedAt) &&
    isNullableString(value.closedAt)
  );
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
  return data;
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
  if (header.schemaVersion === 1) {
    return { data: migrateLegacyData(raw, today, now), migrated: true };
  }
  throw new Error("지원하지 않는 Daymark 백업 버전입니다.");
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
      status,
      estimateMinutes:
        Number.isFinite(task.durationMinutes) &&
        task.durationMinutes >= 5 &&
        task.durationMinutes <= 720
          ? task.durationMinutes
          : null,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
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
      currentTaskId: null,
      startedAt: null,
      closedAt: null,
    });
  }

  return {
    schemaVersion: DATA_VERSION,
    tasks,
    plans: plans.sort((a, b) => a.date.localeCompare(b.date)),
    archive: {
      legacyFocusRecords: legacy.focusRecords,
    },
    updatedAt: now.toISOString(),
  };
}

function tryParseV2(raw: string | null): DaymarkData | null {
  if (!raw) return null;
  try {
    return parseDaymarkData(raw);
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
  const primary = tryParseV2(primaryRaw);
  if (primary) {
    return {
      data: primary,
      recovered: false,
      migrated: false,
      issue: null,
    };
  }

  const backupRaw = storage.getItem(BACKUP_KEY);
  const backup = tryParseV2(backupRaw);
  if (backup) {
    return {
      data: backup,
      recovered: true,
      migrated: false,
      issue: "마지막 정상 백업에서 데이터를 복구했습니다.",
    };
  }

  if (primaryRaw || backupRaw) {
    return {
      data: null,
      recovered: false,
      migrated: false,
      issue:
        "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다.",
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
      migrated: true,
      issue:
        "이전 백업을 새 형식으로 옮겼습니다. 이전 원본은 그대로 보관됩니다.",
    };
  }

  const hadUnreadableData = Boolean(
    storage.getItem(LEGACY_STORAGE_KEY) ||
      storage.getItem(LEGACY_BACKUP_KEY),
  );
  return {
    data: null,
    recovered: false,
    migrated: false,
    issue: hadUnreadableData
      ? "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다."
      : null,
  };
}

export function saveStoredData(
  storage: StorageLike,
  data: DaymarkData,
): void {
  const previous = storage.getItem(STORAGE_KEY);
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

function stamp(data: DaymarkData, now: Date): DaymarkData {
  return {
    ...data,
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
    currentTaskId: null,
    startedAt: null,
    closedAt: null,
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
  patch: Pick<Partial<DaymarkTask>, "title" | "notes" | "estimateMinutes">,
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
  if (getPendingPlanItems(plan).length > 0) {
    throw new Error("남은 약속을 먼저 처리해 주세요.");
  }
  return stamp(
    replacePlan(data, {
      ...plan,
      status: "closed",
      currentTaskId: null,
      closedAt: now.toISOString(),
    }),
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
  blocked?: BlockedDetails,
): DaymarkTask {
  if (action === "done") {
    return {
      ...task,
      status: "done",
      completedAt: now.toISOString(),
      reviewOn: null,
      blockedReason: null,
    };
  }
  if (action === "tomorrow") {
    return {
      ...task,
      status: "later",
      completedAt: null,
      reviewOn: shiftDate(today, 1),
      blockedReason: null,
    };
  }
  if (action === "later") {
    return {
      ...task,
      status: "later",
      completedAt: null,
      reviewOn: null,
      blockedReason: null,
    };
  }
  if (action === "blocked") {
    if (
      !blocked?.reason.trim() ||
      !DATE_PATTERN.test(blocked.reviewOn) ||
      blocked.reviewOn <= today
    ) {
      throw new Error("막힌 이유와 오늘 이후의 다시 볼 날짜를 입력해 주세요.");
    }
    return {
      ...task,
      status: "blocked",
      completedAt: null,
      reviewOn: blocked.reviewOn,
      blockedReason: blocked.reason.trim(),
    };
  }
  return {
    ...task,
    status: "deleted",
    completedAt: null,
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
    plans: data.plans.map((plan) =>
      plan.date < today &&
      plan.status !== "closed" &&
      getPendingPlanItems(plan).length === 0
        ? {
            ...plan,
            status: "closed",
            currentTaskId: null,
            closedAt: plan.closedAt ?? now.toISOString(),
          }
        : plan,
    ),
  };
}

export function actOnPlannedTask(
  data: DaymarkData,
  planDate: string,
  taskId: string,
  action: TaskAction,
  today = localDateKey(),
  now = new Date(),
  blocked?: BlockedDetails,
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
        ? applyTaskFields(item, action, today, now, blocked)
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
  blocked?: BlockedDetails,
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
          ? applyTaskFields(item, action, today, now, blocked)
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
  blocked?: BlockedDetails,
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
      blocked,
    );
  }
  const task = getTask(data, item.taskId);
  if (!task) throw new Error("검토할 할 일을 찾지 못했습니다.");
  return stamp(
    {
      ...data,
      tasks: data.tasks.map((candidate) =>
        candidate.id === item.taskId
          ? applyTaskFields(candidate, action, today, now, blocked)
          : candidate,
      ),
    },
    now,
  );
}
