import type { DaymarkData, DaymarkTask } from "../types";

export const DATA_VERSION = 3 as const;

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


export function stamp(data: DaymarkData, now: Date): DaymarkData {
  return {
    ...data,
    revision: data.revision + 1,
    updatedAt: now.toISOString(),
  };
}
