import { describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  STORAGE_KEY,
  createEmptyData,
  createTask,
  extractCapture,
  loadStoredData,
  localDateKey,
  matchesTask,
  parseDaymarkData,
  saveStoredData,
  startOfWeek,
  weeklySummary,
} from "./daymark";
import type { FocusRecord } from "../types";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("capture parsing", () => {
  it("extracts and deduplicates Korean and English tags", () => {
    expect(extractCapture("랜딩 문구 다듬기 #Website #출시 #website")).toEqual({
      title: "랜딩 문구 다듬기",
      tags: ["website", "출시"],
    });
  });
});

describe("date and weekly summaries", () => {
  it("uses Monday as the beginning of the week", () => {
    expect(localDateKey(startOfWeek(new Date(2026, 6, 29)))).toBe("2026-07-27");
    expect(localDateKey(startOfWeek(new Date(2026, 7, 2)))).toBe("2026-07-27");
  });

  it("counts completed tasks and focus minutes for the current week", () => {
    const completed = createTask("완료한 일", {
      status: "done",
      scheduledDate: "2026-07-28",
      completedAt: new Date("2026-07-28T10:00:00+09:00").toISOString(),
      tags: ["launch"],
    });
    const planned = createTask("계획한 일", {
      status: "today",
      scheduledDate: "2026-07-29",
    });
    const record: FocusRecord = {
      id: "focus_1",
      taskId: completed.id,
      taskTitle: completed.title,
      startedAt: new Date("2026-07-28T09:00:00+09:00").toISOString(),
      endedAt: new Date("2026-07-28T09:25:00+09:00").toISOString(),
      minutes: 25,
    };
    const summary = weeklySummary(
      [completed, planned],
      [record],
      new Date(2026, 6, 29),
    );
    expect(summary.completed).toBe(1);
    expect(summary.focusMinutes).toBe(25);
    expect(summary.activeDays).toBe(1);
    expect(summary.topTag).toBe("launch");
    expect(summary.completionRate).toBe(50);
  });
});

describe("local persistence", () => {
  it("round-trips a valid Daymark backup", () => {
    const data = createEmptyData(new Date("2026-07-28T00:00:00Z"));
    data.tasks.push(createTask("백업할 일"));
    expect(parseDaymarkData(JSON.stringify(data))).toEqual(data);
  });

  it("recovers the previous valid copy when the primary value is corrupt", () => {
    const storage = new MemoryStorage();
    const first = createEmptyData();
    first.tasks.push(createTask("복구할 일"));
    saveStoredData(storage, first);
    const second = {
      ...first,
      tasks: [...first.tasks, createTask("두 번째 일")],
    };
    saveStoredData(storage, second);
    storage.setItem(STORAGE_KEY, "{broken");

    const result = loadStoredData(storage);
    expect(result.recovered).toBe(true);
    expect(result.data?.tasks).toHaveLength(1);
    expect(storage.getItem(BACKUP_KEY)).not.toBeNull();
  });

  it("rejects files that only look like JSON", () => {
    expect(() => parseDaymarkData('{"schemaVersion":1}')).toThrow(
      "할 일 데이터가 손상되었습니다.",
    );
  });
});

describe("search and filters", () => {
  it("searches titles, notes, and tags together", () => {
    const task = createTask("제안서 보내기", {
      notes: "민지에게 금요일까지",
      tags: ["sales"],
    });
    expect(matchesTask(task, "민지", "all", "")).toBe(true);
    expect(matchesTask(task, "sales", "all", "sales")).toBe(true);
    expect(matchesTask(task, "", "done", "")).toBe(false);
  });
});
