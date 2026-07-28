import type {
  DaymarkData,
  DaymarkTask,
  FocusRecord,
  TaskStatus,
  WeeklySummary,
} from "../types";

export const DATA_VERSION = 1 as const;
export const STORAGE_KEY = "daymark:data:v1";
export const BACKUP_KEY = "daymark:data:backup";

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

export function startOfWeek(date = new Date()): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  return start;
}

export function formatLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

export function formatShortDate(key: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
  }).format(parseLocalDate(key));
}

export function formatClock(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function extractCapture(raw: string): { title: string; tags: string[] } {
  const tags = Array.from(
    new Set(
      Array.from(raw.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)).map((match) =>
        match[1].toLocaleLowerCase(),
      ),
    ),
  );
  const title = raw
    .replace(/(?:^|\s)#[\p{L}\p{N}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { title, tags };
}

export function createTask(
  title: string,
  options: Partial<DaymarkTask> = {},
): DaymarkTask {
  const now = new Date().toISOString();
  return {
    id: createId("task"),
    title,
    notes: "",
    tags: [],
    status: "inbox",
    createdAt: now,
    completedAt: null,
    scheduledDate: null,
    scheduledTime: null,
    durationMinutes: 30,
    isTop3: false,
    top3Rank: null,
    ...options,
  };
}

export function createEmptyData(now = new Date()): DaymarkData {
  return {
    schemaVersion: DATA_VERSION,
    tasks: [],
    focusRecords: [],
    activeFocus: null,
    preferences: {
      defaultFocusMinutes: 25,
      lastView: "today",
      hasSeenWelcome: false,
    },
    updatedAt: now.toISOString(),
  };
}

function demoCompletedTask(
  title: string,
  date: string,
  tags: string[],
  durationMinutes: number,
): DaymarkTask {
  const completedAt = new Date(`${date}T16:30:00`).toISOString();
  return createTask(title, {
    status: "done",
    tags,
    durationMinutes,
    scheduledDate: date,
    completedAt,
  });
}

function demoFocusRecord(
  task: DaymarkTask,
  date: string,
  minutes: number,
): FocusRecord {
  const startedAt = new Date(`${date}T14:00:00`).toISOString();
  const endedAt = new Date(
    new Date(startedAt).getTime() + minutes * 60_000,
  ).toISOString();
  return {
    id: createId("focus"),
    taskId: task.id,
    taskTitle: task.title,
    startedAt,
    endedAt,
    minutes,
  };
}

export function createDemoData(now = new Date()): DaymarkData {
  const today = localDateKey(now);
  const topOne = createTask("고객 인터뷰 질문지 최종 정리", {
    status: "today",
    tags: ["launch"],
    scheduledDate: today,
    scheduledTime: "09:30",
    durationMinutes: 60,
    isTop3: true,
    top3Rank: 1,
  });
  const topTwo = createTask("랜딩 페이지 핵심 문구 확정", {
    status: "today",
    tags: ["website"],
    scheduledDate: today,
    scheduledTime: "11:00",
    durationMinutes: 45,
    isTop3: true,
    top3Rank: 2,
  });
  const topThree = createTask("이번 주 비용 내역 검토", {
    status: "today",
    tags: ["admin"],
    scheduledDate: today,
    scheduledTime: "15:00",
    durationMinutes: 30,
    isTop3: true,
    top3Rank: 3,
  });
  const todayExtra = createTask("민지에게 제안서 피드백 보내기", {
    status: "today",
    tags: ["follow-up"],
    scheduledDate: today,
    durationMinutes: 20,
  });
  const inbox = [
    createTask("경쟁사 가격표 다시 확인", { tags: ["research"] }),
    createTask("도메인 갱신일 캘린더에 넣기", { tags: ["admin"] }),
    createTask("다음 뉴스레터 소재 메모", { tags: ["writing"] }),
  ];
  const doneA = demoCompletedTask(
    "베타 사용자 다섯 명에게 초대 발송",
    shiftDate(today, -1),
    ["launch"],
    40,
  );
  const doneB = demoCompletedTask(
    "7월 운영비 시트 정리",
    shiftDate(today, -2),
    ["admin"],
    35,
  );
  const doneC = demoCompletedTask(
    "소개 페이지 와이어프레임",
    shiftDate(today, -4),
    ["website"],
    50,
  );

  return {
    ...createEmptyData(now),
    tasks: [
      topOne,
      topTwo,
      topThree,
      todayExtra,
      ...inbox,
      doneA,
      doneB,
      doneC,
    ],
    focusRecords: [
      demoFocusRecord(doneA, shiftDate(today, -1), 25),
      demoFocusRecord(doneB, shiftDate(today, -2), 30),
      demoFocusRecord(doneC, shiftDate(today, -4), 45),
    ],
    preferences: {
      defaultFocusMinutes: 25,
      lastView: "today",
      hasSeenWelcome: true,
    },
  };
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "inbox" || value === "today" || value === "done";
}

function isTask(value: unknown): value is DaymarkTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    typeof task.notes === "string" &&
    Array.isArray(task.tags) &&
    task.tags.every((tag) => typeof tag === "string") &&
    isTaskStatus(task.status) &&
    typeof task.createdAt === "string" &&
    (task.completedAt === null || typeof task.completedAt === "string") &&
    (task.scheduledDate === null || typeof task.scheduledDate === "string") &&
    (task.scheduledTime === null || typeof task.scheduledTime === "string") &&
    typeof task.durationMinutes === "number" &&
    typeof task.isTop3 === "boolean" &&
    (task.top3Rank === null || typeof task.top3Rank === "number")
  );
}

function isActiveFocus(value: unknown): value is NonNullable<DaymarkData["activeFocus"]> {
  if (!value || typeof value !== "object") return false;
  const focus = value as Record<string, unknown>;
  return (
    (focus.taskId === null || typeof focus.taskId === "string") &&
    typeof focus.taskTitle === "string" &&
    typeof focus.durationMinutes === "number" &&
    typeof focus.startedAt === "string" &&
    (focus.mode === "running" || focus.mode === "paused") &&
    (focus.endAt === null || typeof focus.endAt === "string") &&
    typeof focus.remainingSeconds === "number"
  );
}

export function parseDaymarkData(raw: string): DaymarkData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("JSON 형식을 읽을 수 없습니다.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Daymark 백업 파일이 아닙니다.");
  }

  const data = parsed as Partial<DaymarkData>;
  if (data.schemaVersion !== DATA_VERSION) {
    throw new Error("지원하지 않는 Daymark 백업 버전입니다.");
  }
  if (!Array.isArray(data.tasks) || !data.tasks.every(isTask)) {
    throw new Error("할 일 데이터가 손상되었습니다.");
  }
  if (!Array.isArray(data.focusRecords)) {
    throw new Error("집중 기록 데이터가 없습니다.");
  }
  if (
    !data.preferences ||
    typeof data.preferences.defaultFocusMinutes !== "number" ||
    !["today", "inbox", "week", "log"].includes(data.preferences.lastView)
  ) {
    throw new Error("환경설정 데이터가 손상되었습니다.");
  }

  const normalized: DaymarkData = {
    schemaVersion: DATA_VERSION,
    tasks: data.tasks,
    focusRecords: data.focusRecords.filter((record) => {
      if (!record || typeof record !== "object") return false;
      const item = record as unknown as Record<string, unknown>;
      return (
        typeof item.id === "string" &&
        (item.taskId === null || typeof item.taskId === "string") &&
        typeof item.taskTitle === "string" &&
        typeof item.startedAt === "string" &&
        typeof item.endedAt === "string" &&
        typeof item.minutes === "number"
      );
    }),
    activeFocus: isActiveFocus(data.activeFocus) ? data.activeFocus : null,
    preferences: {
      defaultFocusMinutes: Math.max(
        5,
        Math.min(120, data.preferences.defaultFocusMinutes),
      ),
      lastView: data.preferences.lastView,
      hasSeenWelcome: Boolean(data.preferences.hasSeenWelcome),
    },
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
  return normalized;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function loadStoredData(
  storage: StorageLike,
): { data: DaymarkData | null; recovered: boolean; issue: string | null } {
  const primary = storage.getItem(STORAGE_KEY);
  if (primary) {
    try {
      return { data: parseDaymarkData(primary), recovered: false, issue: null };
    } catch {
      // Continue to the last known-good backup.
    }
  }

  const backup = storage.getItem(BACKUP_KEY);
  if (backup) {
    try {
      return {
        data: parseDaymarkData(backup),
        recovered: true,
        issue: "마지막 정상 백업에서 데이터를 복구했습니다.",
      };
    } catch {
      return {
        data: null,
        recovered: false,
        issue: "저장된 데이터를 읽지 못해 데모로 시작합니다.",
      };
    }
  }

  return {
    data: null,
    recovered: false,
    issue: primary ? "저장된 데이터를 읽지 못해 데모로 시작합니다." : null,
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
      // Keep the existing backup when the current value is invalid.
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function weeklySummary(
  tasks: DaymarkTask[],
  records: FocusRecord[],
  now = new Date(),
): WeeklySummary {
  const start = startOfWeek(now);
  const dayKeys = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return localDateKey(date);
  });
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short" });
  const days = dayKeys.map((date) => ({
    date,
    label: weekday.format(parseLocalDate(date)).replace("요일", ""),
    completed: tasks.filter(
      (task) =>
        task.completedAt && localDateKey(new Date(task.completedAt)) === date,
    ).length,
    focusMinutes: records
      .filter((record) => localDateKey(new Date(record.startedAt)) === date)
      .reduce((sum, record) => sum + record.minutes, 0),
  }));
  const completedTasks = tasks.filter(
    (task) =>
      task.completedAt &&
      dayKeys.includes(localDateKey(new Date(task.completedAt))),
  );
  const plannedThisWeek = tasks.filter(
    (task) => task.scheduledDate && dayKeys.includes(task.scheduledDate),
  );
  const tagCounts = completedTasks
    .flatMap((task) => task.tags)
    .reduce<Record<string, number>>((counts, tag) => {
      counts[tag] = (counts[tag] ?? 0) + 1;
      return counts;
    }, {});
  const topTag =
    Object.entries(tagCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const focusMinutes = days.reduce((sum, day) => sum + day.focusMinutes, 0);

  return {
    completed: completedTasks.length,
    focusMinutes,
    activeDays: days.filter(
      (day) => day.completed > 0 || day.focusMinutes > 0,
    ).length,
    completionRate: plannedThisWeek.length
      ? Math.round((completedTasks.length / plannedThisWeek.length) * 100)
      : 0,
    topTag,
    days,
  };
}

export function matchesTask(
  task: DaymarkTask,
  query: string,
  status: "all" | TaskStatus,
  tag: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  const searchable = [task.title, task.notes, ...task.tags]
    .join(" ")
    .toLocaleLowerCase();
  return (
    (!normalized || searchable.includes(normalized)) &&
    (status === "all" || task.status === status) &&
    (!tag || task.tags.includes(tag))
  );
}
