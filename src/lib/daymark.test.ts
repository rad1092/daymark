import { describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  actOnPlannedTask,
  addCapturedTask,
  addTaskToToday,
  beginDayClose,
  closeDay,
  createEmptyData,
  getCommittedCount,
  getPlan,
  getReviewItems,
  getTask,
  loadStoredData,
  migrateLegacyData,
  parseBackupData,
  parseDaymarkData,
  resolveReviewItem,
  saveStoredData,
  startPlan,
} from "./daymark";

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

const TODAY = "2026-07-28";
const YESTERDAY = "2026-07-27";
const TOMORROW = "2026-07-29";
const NOW = new Date("2026-07-28T09:00:00+09:00");

function captured(title: string) {
  const data = addCapturedTask(createEmptyData(NOW), title, NOW);
  const task = data.tasks[0];
  return { data, task };
}

function legacyTask(
  id: string,
  options: Partial<Record<string, unknown>> = {},
) {
  return {
    id,
    title: `이전 할 일 ${id}`,
    notes: "",
    tags: ["legacy"],
    status: "today",
    createdAt: "2026-07-27T01:00:00.000Z",
    completedAt: null,
    scheduledDate: TODAY,
    scheduledTime: "09:00",
    durationMinutes: 30,
    isTop3: true,
    top3Rank: Number(id.replace(/\D/g, "")) || 1,
    ...options,
  };
}

describe("first run and capture", () => {
  it("starts with a truly empty state", () => {
    const data = createEmptyData(NOW);
    expect(data.schemaVersion).toBe(2);
    expect(data.tasks).toEqual([]);
    expect(data.plans).toEqual([]);
  });

  it("keeps newly captured work in the inbox during an active day", () => {
    const first = captured("첫 약속");
    let data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);
    data = addCapturedTask(data, "갑자기 생긴 일", NOW);

    expect(getTask(data, data.tasks[0].id)?.status).toBe("inbox");
    expect(getCommittedCount(getPlan(data, TODAY))).toBe(1);
  });
});

describe("three promises and one current task", () => {
  it("rejects a fourth active promise", () => {
    let data = createEmptyData(NOW);
    const ids: string[] = [];
    for (const title of ["하나", "둘", "셋", "넷"]) {
      data = addCapturedTask(data, title, NOW);
      ids.push(data.tasks[0].id);
    }
    for (const id of ids.slice(0, 3)) {
      data = addTaskToToday(data, id, TODAY, NOW);
    }
    expect(() => addTaskToToday(data, ids[3], TODAY, NOW)).toThrow(
      "세 자리가 모두 찼습니다",
    );
  });

  it("starts with one current task and advances after completion", () => {
    let data = createEmptyData(NOW);
    data = addCapturedTask(data, "첫 번째", NOW);
    const firstId = data.tasks[0].id;
    data = addCapturedTask(data, "두 번째", NOW);
    const secondId = data.tasks[0].id;
    data = addTaskToToday(data, firstId, TODAY, NOW);
    data = addTaskToToday(data, secondId, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);

    expect(getPlan(data, TODAY)?.currentTaskId).toBe(firstId);
    data = actOnPlannedTask(
      data,
      TODAY,
      firstId,
      "done",
      TODAY,
      NOW,
    );
    expect(getPlan(data, TODAY)?.currentTaskId).toBe(secondId);
    expect(getTask(data, firstId)?.status).toBe("done");
  });

  it("lets a moved promise free its slot without erasing the decision history", () => {
    let data = createEmptyData(NOW);
    const ids: string[] = [];
    for (const title of ["하나", "둘", "셋", "교체"]) {
      data = addCapturedTask(data, title, NOW);
      ids.push(data.tasks[0].id);
    }
    for (const id of ids.slice(0, 3)) {
      data = addTaskToToday(data, id, TODAY, NOW);
    }
    data = actOnPlannedTask(
      data,
      TODAY,
      ids[0],
      "later",
      TODAY,
      NOW,
    );
    data = addTaskToToday(data, ids[3], TODAY, NOW);

    expect(getPlan(data, TODAY)?.items).toHaveLength(4);
    expect(getCommittedCount(getPlan(data, TODAY))).toBe(3);
    expect(() => parseDaymarkData(JSON.stringify(data))).not.toThrow();
  });
});

describe("date boundary review", () => {
  it("surfaces yesterday's unfinished promise without carrying it", () => {
    const first = captured("어제 남은 일");
    let data = addTaskToToday(
      first.data,
      first.task.id,
      YESTERDAY,
      new Date("2026-07-27T09:00:00+09:00"),
    );
    data = startPlan(
      data,
      YESTERDAY,
      new Date("2026-07-27T09:01:00+09:00"),
    );

    const review = getReviewItems(data, TODAY);
    expect(review).toEqual([
      {
        taskId: first.task.id,
        source: "stale-plan",
        planDate: YESTERDAY,
      },
    ]);
    expect(getPlan(data, TODAY)).toBeUndefined();
    expect(getTask(data, first.task.id)?.status).toBe("planned");
  });

  it("carries a reviewed item only after an explicit today decision", () => {
    const first = captured("다시 정할 일");
    let data = addTaskToToday(first.data, first.task.id, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "today", TODAY, NOW);

    expect(getPlan(data, YESTERDAY)?.status).toBe("closed");
    expect(getPlan(data, TODAY)?.items[0].taskId).toBe(first.task.id);
    expect(getPlan(data, TODAY)?.items[0].outcome).toBe("pending");
  });

  it("returns a tomorrow decision to review on the next day", () => {
    const first = captured("내일 결정할 일");
    let data = addTaskToToday(first.data, first.task.id, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "tomorrow", TODAY, NOW);

    expect(getReviewItems(data, TODAY)).toEqual([]);
    expect(getTask(data, first.task.id)?.reviewOn).toBe(TOMORROW);
    expect(getReviewItems(data, TOMORROW)[0]?.taskId).toBe(first.task.id);
  });

  it("keeps a blocked item parked until its chosen review date", () => {
    const first = captured("외부 회신 대기");
    let data = addTaskToToday(first.data, first.task.id, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "blocked", TODAY, NOW, {
      reason: "외부 회신 대기",
      reviewOn: "2026-07-31",
    });

    expect(getReviewItems(data, TOMORROW)).toEqual([]);
    expect(getReviewItems(data, "2026-07-31")[0]?.taskId).toBe(first.task.id);
  });
});

describe("day closing", () => {
  it("persists closing mode and refuses to close with pending promises", () => {
    const first = captured("정리할 일");
    let data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);
    data = beginDayClose(data, TODAY, NOW);

    const reloaded = parseDaymarkData(JSON.stringify(data));
    expect(getPlan(reloaded, TODAY)?.status).toBe("closing");
    expect(() => closeDay(reloaded, TODAY, NOW)).toThrow(
      "남은 약속을 먼저 처리",
    );
  });

  it("closes only after every promise has a disposition", () => {
    const first = captured("끝낸 일");
    let data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);
    data = beginDayClose(data, TODAY, NOW);
    data = actOnPlannedTask(
      data,
      TODAY,
      first.task.id,
      "done",
      TODAY,
      NOW,
    );
    data = closeDay(data, TODAY, NOW);

    expect(getPlan(data, TODAY)?.status).toBe("closed");
    expect(getPlan(data, TODAY)?.closedAt).toBe(NOW.toISOString());
  });

  it("requires a reason and future date for blocked work", () => {
    const first = captured("회신 대기");
    let data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    expect(() =>
      actOnPlannedTask(
        data,
        TODAY,
        first.task.id,
        "blocked",
        TODAY,
        NOW,
        { reason: "", reviewOn: TOMORROW },
      ),
    ).toThrow("막힌 이유");

    data = actOnPlannedTask(
      data,
      TODAY,
      first.task.id,
      "blocked",
      TODAY,
      NOW,
      { reason: "견적 회신 대기", reviewOn: TOMORROW },
    );
    expect(getTask(data, first.task.id)).toMatchObject({
      status: "blocked",
      blockedReason: "견적 회신 대기",
      reviewOn: TOMORROW,
    });
  });
});

describe("v1 migration", () => {
  it("keeps all tasks, caps promises at three, and archives focus records", () => {
    const legacy = {
      schemaVersion: 1,
      tasks: [
        legacyTask("1"),
        legacyTask("2"),
        legacyTask("3"),
        legacyTask("4", { isTop3: false, top3Rank: null }),
        legacyTask("5", {
          status: "done",
          completedAt: "2026-07-27T08:00:00.000Z",
        }),
      ],
      focusRecords: [
        {
          id: "focus-1",
          taskId: "5",
          taskTitle: "이전 완료",
          startedAt: "2026-07-27T07:00:00.000Z",
          endedAt: "2026-07-27T07:30:00.000Z",
          minutes: 30,
        },
      ],
      preferences: {
        defaultFocusMinutes: 25,
        lastView: "today",
        hasSeenWelcome: true,
      },
      updatedAt: "2026-07-27T09:00:00.000Z",
    };
    const migrated = migrateLegacyData(JSON.stringify(legacy), TODAY, NOW);

    expect(migrated.tasks).toHaveLength(5);
    expect(getCommittedCount(getPlan(migrated, TODAY))).toBe(3);
    expect(getTask(migrated, "4")?.status).toBe("inbox");
    expect(getTask(migrated, "1")?.legacy?.tags).toEqual(["legacy"]);
    expect(migrated.archive.legacyFocusRecords).toHaveLength(1);
  });

  it("moves a future legacy task to a dated review instead of a future plan", () => {
    const legacy = {
      schemaVersion: 1,
      tasks: [legacyTask("1", { scheduledDate: TOMORROW })],
      focusRecords: [],
    };
    const migrated = migrateLegacyData(JSON.stringify(legacy), TODAY, NOW);

    expect(getPlan(migrated, TOMORROW)).toBeUndefined();
    expect(getTask(migrated, "1")).toMatchObject({
      status: "later",
      reviewOn: TOMORROW,
    });
  });

  it("loads v1 into v2 without writing over the legacy key", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      schemaVersion: 1,
      tasks: [legacyTask("1")],
      focusRecords: [],
    });
    storage.setItem(LEGACY_STORAGE_KEY, raw);

    const result = loadStoredData(storage, TODAY, NOW);
    expect(result.migrated).toBe(true);
    expect(result.data?.schemaVersion).toBe(2);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("accepts both v1 and v2 JSON backups", () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      tasks: [legacyTask("1")],
      focusRecords: [],
    });
    expect(parseBackupData(v1, TODAY, NOW).migrated).toBe(true);

    const v2 = createEmptyData(NOW);
    expect(parseBackupData(JSON.stringify(v2), TODAY, NOW)).toEqual({
      data: v2,
      migrated: false,
    });
  });
});

describe("reload and recovery", () => {
  it("round-trips the complete v2 state through storage", () => {
    const storage = new MemoryStorage();
    const first = captured("새로고침 뒤에도 남을 일");
    const data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    saveStoredData(storage, data);

    const result = loadStoredData(storage, TODAY, NOW);
    expect(result.data).toEqual(data);
    expect(result.recovered).toBe(false);
  });

  it("uses the last valid backup when the primary is corrupt", () => {
    const storage = new MemoryStorage();
    const first = createEmptyData(NOW);
    saveStoredData(storage, first);
    const second = addCapturedTask(first, "두 번째 상태", NOW);
    saveStoredData(storage, second);
    expect(storage.getItem(BACKUP_KEY)).toBe(JSON.stringify(first));
    storage.setItem(STORAGE_KEY, "{broken");

    const result = loadStoredData(storage, TODAY, NOW);
    expect(result.recovered).toBe(true);
    expect(result.data).toEqual(first);
  });

  it("does not replace corrupt v2 data with an older v1 copy", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{broken");
    storage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        tasks: [legacyTask("1")],
        focusRecords: [],
      }),
    );

    const result = loadStoredData(storage, TODAY, NOW);
    expect(result.data).toBeNull();
    expect(result.migrated).toBe(false);
    expect(result.issue).toContain("자동 저장을 중지했습니다");
    expect(storage.getItem(STORAGE_KEY)).toBe("{broken");
  });
});
