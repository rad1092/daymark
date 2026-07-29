import { describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  CORRUPT_HISTORY_KEY,
  CORRUPT_PRIMARY_KEY,
  LEGACY_STORAGE_KEY,
  SNAPSHOTS_KEY,
  STORAGE_KEY,
  V2_STORAGE_KEY,
  actOnPlannedTask,
  adoptImportedData,
  addCapturedTask,
  addTaskToToday,
  beginDayClose,
  closeDay,
  confirmBackupRecovery,
  createEmptyData,
  getCommittedCount,
  getCleanupCandidates,
  getPlan,
  getRecentDaySummaries,
  getRecentReceipts,
  getReviewItems,
  getTask,
  loadSnapshots,
  loadStoredData,
  migrateLegacyData,
  parseBackupData,
  parseDaymarkData,
  pruneSettledTasks,
  removeTaskFromToday,
  replaceUnreadableStoredData,
  reorderPendingTask,
  reopenDay,
  resolveReviewItem,
  restoreSnapshotData,
  saveSnapshot,
  saveStoredData,
  searchTaskHistory,
  startPlan,
  updateTask,
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
    expect(data.schemaVersion).toBe(3);
    expect(data.revision).toBe(0);
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

  it("lets a draft promise be removed and replaced before starting", () => {
    let data = createEmptyData(NOW);
    const ids: string[] = [];
    for (const title of ["하나", "둘", "셋", "교체"]) {
      data = addCapturedTask(data, title, NOW);
      ids.push(data.tasks[0].id);
    }
    for (const id of ids.slice(0, 3)) {
      data = addTaskToToday(data, id, TODAY, NOW);
    }
    data = removeTaskFromToday(data, ids[0], TODAY, NOW);
    data = addTaskToToday(data, ids[3], TODAY, NOW);

    expect(getPlan(data, TODAY)?.items).toHaveLength(3);
    expect(getTask(data, ids[0])?.status).toBe("inbox");
    expect(getCommittedCount(getPlan(data, TODAY))).toBe(3);
    expect(() => parseDaymarkData(JSON.stringify(data))).not.toThrow();
  });

  it("locks the original commitment count after starting, even after a defer", () => {
    let data = createEmptyData(NOW);
    const ids: string[] = [];
    for (const title of ["하나", "둘", "셋", "넷"]) {
      data = addCapturedTask(data, title, NOW);
      ids.push(data.tasks[0].id);
    }
    for (const id of ids.slice(0, 3)) {
      data = addTaskToToday(data, id, TODAY, NOW);
    }
    data = startPlan(data, TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, ids[0], "tomorrow", TODAY, NOW, {
      reviewOn: TOMORROW,
      nextStep: "첫 문단부터 다시 읽기",
    });

    expect(getPlan(data, TODAY)?.initialCommitmentIds).toEqual(ids.slice(0, 3));
    expect(() => addTaskToToday(data, ids[3], TODAY, NOW)).toThrow(
      "약속을 늘릴 수 없습니다",
    );
  });

  it("reorders the draft before locking the execution order", () => {
    let data = createEmptyData(NOW);
    data = addCapturedTask(data, "첫째", NOW);
    const firstId = data.tasks[0].id;
    data = addCapturedTask(data, "둘째", NOW);
    const secondId = data.tasks[0].id;
    data = addTaskToToday(data, firstId, TODAY, NOW);
    data = addTaskToToday(data, secondId, TODAY, NOW);

    data = reorderPendingTask(data, secondId, -1, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);

    expect(getPlan(data, TODAY)?.initialCommitmentIds).toEqual([
      secondId,
      firstId,
    ]);
    expect(getPlan(data, TODAY)?.currentTaskId).toBe(secondId);
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
    data = startPlan(data, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "today", TODAY, NOW);

    expect(getPlan(data, YESTERDAY)?.status).toBe("closed");
    expect(getPlan(data, YESTERDAY)?.receipt?.items[0].outcome).toBe(
      "carried",
    );
    expect(getPlan(data, TODAY)?.items[0].taskId).toBe(first.task.id);
    expect(getPlan(data, TODAY)?.items[0].outcome).toBe("pending");
  });

  it("returns a tomorrow decision to review on the next day", () => {
    const first = captured("내일 결정할 일");
    let data = addTaskToToday(first.data, first.task.id, YESTERDAY, NOW);
    data = startPlan(data, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "tomorrow", TODAY, NOW, {
      reviewOn: TOMORROW,
      nextStep: "첫 항목부터 확인",
    });

    expect(getReviewItems(data, TODAY)).toEqual([]);
    expect(getTask(data, first.task.id)).toMatchObject({
      reviewOn: TOMORROW,
      nextStep: "첫 항목부터 확인",
    });
    expect(getPlan(data, YESTERDAY)?.receipt?.items[0]).toMatchObject({
      outcome: "tomorrow",
      nextStep: "첫 항목부터 확인",
    });
    expect(getReviewItems(data, TOMORROW)[0]?.taskId).toBe(first.task.id);
  });

  it("keeps a blocked item parked until its chosen review date", () => {
    const first = captured("외부 회신 대기");
    let data = addTaskToToday(first.data, first.task.id, YESTERDAY, NOW);
    const item = getReviewItems(data, TODAY)[0];
    data = resolveReviewItem(data, item, "blocked", TODAY, NOW, {
      reason: "외부 회신 대기",
      reviewOn: "2026-07-31",
      nextStep: "회신 금액 확인",
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
    expect(getRecentReceipts(data)[0]?.items).toEqual([
      expect.objectContaining({
        taskId: first.task.id,
        title: "끝낸 일",
        outcome: "done",
      }),
    ]);
  });

  it("requires a reason, future date, and next action for blocked work", () => {
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
        { reason: "", reviewOn: TOMORROW, nextStep: "회신 확인" },
      ),
    ).toThrow("막힌 이유");

    data = actOnPlannedTask(
      data,
      TODAY,
      first.task.id,
      "blocked",
      TODAY,
      NOW,
      {
        reason: "견적 회신 대기",
        reviewOn: TOMORROW,
        nextStep: "회신 금액 확인",
      },
    );
    expect(getTask(data, first.task.id)).toMatchObject({
      status: "blocked",
      blockedReason: "견적 회신 대기",
      reviewOn: TOMORROW,
      nextStep: "회신 금액 확인",
    });
  });

  it("reopens a closed day with the same commitments", () => {
    const first = captured("다시 열 일");
    let data = addTaskToToday(first.data, first.task.id, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, first.task.id, "done", TODAY, NOW);
    data = beginDayClose(data, TODAY, NOW);
    data = closeDay(data, TODAY, NOW);
    data = reopenDay(data, TODAY, NOW);

    expect(getPlan(data, TODAY)).toMatchObject({
      status: "active",
      currentTaskId: first.task.id,
      receipt: null,
    });
    expect(getPlan(data, TODAY)?.items[0].outcome).toBe("pending");
    expect(getTask(data, first.task.id)?.status).toBe("planned");
  });

  it("records all three results and the restart clues at close", () => {
    let data = createEmptyData(NOW);
    const ids: string[] = [];
    for (const title of ["완료할 일", "내일 할 일", "막힌 일"]) {
      data = addCapturedTask(data, title, NOW);
      ids.push(data.tasks[0].id);
    }
    for (const id of ids) data = addTaskToToday(data, id, TODAY, NOW);
    data = startPlan(data, TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, ids[0], "done", TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, ids[1], "tomorrow", TODAY, NOW, {
      reviewOn: TOMORROW,
      nextStep: "배포 로그 열기",
    });
    data = actOnPlannedTask(data, TODAY, ids[2], "blocked", TODAY, NOW, {
      reason: "회신 대기",
      reviewOn: TOMORROW,
      nextStep: "회신 금액 확인",
    });
    data = beginDayClose(data, TODAY, NOW);
    data = closeDay(data, TODAY, NOW);

    expect(getPlan(data, TODAY)?.receipt?.items).toMatchObject([
      { outcome: "done", nextStep: "" },
      { outcome: "tomorrow", nextStep: "배포 로그 열기" },
      { outcome: "blocked", nextStep: "회신 금액 확인" },
    ]);
  });
});

describe("records and cleanup", () => {
  it("summarizes the five explicit daily outcomes over seven dates", () => {
    let data = createEmptyData(NOW);
    const actions = ["done", "tomorrow", "later"] as const;
    const taskIds: string[] = [];
    for (const [index] of actions.entries()) {
      data = addCapturedTask(data, `결정 ${index}`, NOW);
      const taskId = data.tasks[0].id;
      taskIds.push(taskId);
      data = addTaskToToday(data, taskId, YESTERDAY, NOW);
    }
    for (const [index, action] of actions.entries()) {
      const details =
        action === "done"
          ? undefined
          : { reviewOn: TOMORROW, nextStep: `다음 행동 ${index}` };
      data = actOnPlannedTask(
        data,
        YESTERDAY,
        taskIds[index],
        action,
        TODAY,
        NOW,
        details,
      );
    }

    const summary = getRecentDaySummaries(data, TODAY).find(
      (item) => item.date === YESTERDAY,
    );
    expect(summary?.counts).toEqual({
      done: 1,
      tomorrow: 1,
      later: 1,
      blocked: 0,
      deleted: 0,
    });
  });

  it("searches resolved work by title and notes", () => {
    let data = addCapturedTask(createEmptyData(NOW), "견적서 검토", NOW);
    const taskId = data.tasks[0].id;
    data = updateTask(data, taskId, { notes: "거래처 회신 확인" }, NOW);
    data = addTaskToToday(data, taskId, TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, taskId, "done", TODAY, NOW);

    expect(searchTaskHistory(data, "회신")).toMatchObject([
      {
        task: { id: taskId, title: "견적서 검토" },
        outcome: "done",
      },
    ]);
    expect(searchTaskHistory(data, "없는 일")).toEqual([]);
  });

  it("removes only settled work older than the cutoff and its plan links", () => {
    const oldNow = new Date("2026-06-01T09:00:00+09:00");
    let data = addCapturedTask(createEmptyData(oldNow), "오래된 완료", oldNow);
    const oldId = data.tasks[0].id;
    data = addTaskToToday(data, oldId, "2026-06-01", oldNow);
    data = startPlan(data, "2026-06-01", oldNow);
    data = actOnPlannedTask(
      data,
      "2026-06-01",
      oldId,
      "done",
      "2026-06-01",
      oldNow,
    );
    data = beginDayClose(data, "2026-06-01", oldNow);
    data = closeDay(data, "2026-06-01", oldNow);
    data = addCapturedTask(data, "최근 완료", NOW);
    const recentId = data.tasks[0].id;
    data = addTaskToToday(data, recentId, TODAY, NOW);
    data = actOnPlannedTask(data, TODAY, recentId, "done", TODAY, NOW);

    expect(getCleanupCandidates(data, "2026-06-29").map((task) => task.id)).toEqual([
      oldId,
    ]);
    const pruned = pruneSettledTasks(data, "2026-06-29", NOW);
    expect(getTask(pruned, oldId)).toBeUndefined();
    expect(getPlan(pruned, "2026-06-01")).toBeUndefined();
    expect(getTask(pruned, recentId)).toBeDefined();
    expect(() => parseDaymarkData(JSON.stringify(pruned))).not.toThrow();
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

  it("loads v1 into v3 without writing over the legacy key", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({
      schemaVersion: 1,
      tasks: [legacyTask("1")],
      focusRecords: [],
    });
    storage.setItem(LEGACY_STORAGE_KEY, raw);

    const result = loadStoredData(storage, TODAY, NOW);
    expect(result.migrated).toBe(true);
    expect(result.data?.schemaVersion).toBe(3);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(raw);
    expect(storage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("accepts v1 and current JSON backups", () => {
    const v1 = JSON.stringify({
      schemaVersion: 1,
      tasks: [legacyTask("1")],
      focusRecords: [],
    });
    expect(parseBackupData(v1, TODAY, NOW).migrated).toBe(true);

    const current = createEmptyData(NOW);
    expect(parseBackupData(JSON.stringify(current), TODAY, NOW)).toEqual({
      data: current,
      migrated: false,
    });
  });
});

describe("v2 migration", () => {
  it("puts dateless later work into today's review", () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      tasks: [
        {
          id: "later-1",
          title: "날짜 없던 일",
          notes: "",
          status: "later",
          estimateMinutes: null,
          createdAt: NOW.toISOString(),
          completedAt: null,
          settledAt: null,
          blockedReason: null,
          reviewOn: null,
          legacy: null,
        },
      ],
      plans: [],
      archive: { legacyFocusRecords: [] },
      updatedAt: NOW.toISOString(),
    });
    const storage = new MemoryStorage();
    storage.setItem(V2_STORAGE_KEY, raw);

    const result = loadStoredData(storage, TODAY, NOW);

    expect(result.migrated).toBe(true);
    expect(result.data?.schemaVersion).toBe(3);
    expect(getTask(result.data!, "later-1")).toMatchObject({
      reviewOn: TODAY,
      nextStep: "",
    });
    expect(getReviewItems(result.data!, TODAY)[0]?.taskId).toBe("later-1");
    expect(storage.getItem(V2_STORAGE_KEY)).toBe(raw);
  });

  it("keeps a migrated draft editable and reloadable", () => {
    const ids = ["draft-1", "draft-2", "draft-3"];
    const raw = JSON.stringify({
      schemaVersion: 2,
      tasks: ids.map((id) => ({
        id,
        title: id,
        notes: "",
        status: "planned",
        estimateMinutes: null,
        createdAt: NOW.toISOString(),
        completedAt: null,
        settledAt: null,
        blockedReason: null,
        reviewOn: null,
        legacy: null,
      })),
      plans: [
        {
          date: TODAY,
          status: "draft",
          items: ids.map((taskId) => ({
            taskId,
            addedAt: NOW.toISOString(),
            outcome: "pending",
            resolvedAt: null,
          })),
          currentTaskId: null,
          startedAt: null,
          closedAt: null,
        },
      ],
      archive: { legacyFocusRecords: [] },
      updatedAt: NOW.toISOString(),
    });
    let data = parseBackupData(raw, TODAY, NOW).data;

    expect(getPlan(data, TODAY)?.initialCommitmentIds).toEqual([]);
    data = reorderPendingTask(data, ids[1], -1, TODAY, NOW);
    data = removeTaskFromToday(data, ids[0], TODAY, NOW);

    const storage = new MemoryStorage();
    saveStoredData(storage, data);
    const reloaded = loadStoredData(storage, TODAY, NOW).data;

    expect(reloaded).not.toBeNull();
    expect(getPlan(reloaded!, TODAY)?.initialCommitmentIds).toEqual([]);
    expect(getPlan(reloaded!, TODAY)?.items.map((item) => item.taskId)).toEqual([
      ids[1],
      ids[2],
    ]);
  });
});

describe("reload and recovery", () => {
  it("round-trips the complete v3 state through storage", () => {
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
    expect(result.needsRecovery).toBe(true);
    expect(result.data).toEqual(first);

    expect(() =>
      saveStoredData(storage, result.data!, result.data!),
    ).toThrow();
    confirmBackupRecovery(storage, result.data!);

    expect(storage.getItem(CORRUPT_PRIMARY_KEY)).toBe("{broken");
    expect(parseDaymarkData(storage.getItem(STORAGE_KEY)!)).toEqual(first);
    expect(loadStoredData(storage, TODAY, NOW).needsRecovery).toBe(false);
    const changed = addCapturedTask(first, "복구 뒤 변경", NOW);
    expect(() =>
      saveStoredData(storage, changed, first),
    ).not.toThrow();
  });

  it("does not use the recovery bypass over a valid primary", () => {
    const storage = new MemoryStorage();
    const data = createEmptyData(NOW);
    saveStoredData(storage, data);
    storage.setItem(BACKUP_KEY, JSON.stringify(data));

    expect(() => confirmBackupRecovery(storage, data)).toThrow(
      "현재 저장 데이터가 정상",
    );
    expect(storage.getItem(CORRUPT_PRIMARY_KEY)).toBeNull();
  });

  it("does not replace corrupt v3 data with an older v1 copy", () => {
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

  it("rejects a save made from a stale revision", () => {
    const storage = new MemoryStorage();
    const first = createEmptyData(NOW);
    saveStoredData(storage, first);
    const second = addCapturedTask(first, "다른 탭 변경", NOW);
    saveStoredData(storage, second, first);

    expect(() =>
      saveStoredData(
        storage,
        addCapturedTask(first, "현재 탭 변경", NOW),
        first,
      ),
    ).toThrow("다른 탭");
  });

  it("rejects a divergent save even when the revision is the same", () => {
    const storage = new MemoryStorage();
    const base = createEmptyData(NOW);
    saveStoredData(storage, base);
    const external = {
      ...addCapturedTask(base, "다른 탭 변경", NOW),
      revision: base.revision,
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(external));

    expect(() =>
      saveStoredData(
        storage,
        addCapturedTask(base, "현재 탭 변경", NOW),
        base,
      ),
    ).toThrow("다른 탭");
    expect(parseDaymarkData(storage.getItem(STORAGE_KEY)!)).toEqual(
      external,
    );
  });

  it("preserves each corrupt primary across repeated recovery", () => {
    const storage = new MemoryStorage();
    const first = createEmptyData(NOW);
    saveStoredData(storage, first);
    const second = addCapturedTask(first, "두 번째 상태", NOW);
    saveStoredData(storage, second, first);

    storage.setItem(STORAGE_KEY, "{broken-first");
    const firstRecovery = loadStoredData(storage, TODAY, NOW);
    confirmBackupRecovery(storage, firstRecovery.data!, NOW);

    const third = addCapturedTask(firstRecovery.data!, "복구 뒤 변경", NOW);
    saveStoredData(storage, third, firstRecovery.data!);
    const fourth = addCapturedTask(third, "백업 회전", NOW);
    saveStoredData(storage, fourth, third);
    storage.setItem(STORAGE_KEY, "{broken-second");
    const secondRecovery = loadStoredData(storage, TODAY, NOW);
    confirmBackupRecovery(storage, secondRecovery.data!, NOW);

    expect(storage.getItem(CORRUPT_PRIMARY_KEY)).toBe("{broken-second");
    expect(
      JSON.parse(storage.getItem(CORRUPT_HISTORY_KEY) ?? "[]"),
    ).toEqual([
      expect.objectContaining({
        source: "primary",
        raw: "{broken-first",
      }),
    ]);
  });

  it("keeps only the five most recent prior corrupt primaries", () => {
    const storage = new MemoryStorage();
    const backup = createEmptyData(NOW);
    storage.setItem(BACKUP_KEY, JSON.stringify(backup));

    for (let index = 1; index <= 7; index += 1) {
      storage.setItem(STORAGE_KEY, `{broken-${index}`);
      const recovery = loadStoredData(storage, TODAY, NOW);
      confirmBackupRecovery(storage, recovery.data!, NOW);
    }

    expect(storage.getItem(CORRUPT_PRIMARY_KEY)).toBe("{broken-7");
    const history = JSON.parse(
      storage.getItem(CORRUPT_HISTORY_KEY) ?? "[]",
    );
    expect(history).toHaveLength(5);
    expect(
      history.map((record: { raw: string }) => record.raw),
    ).toEqual([
      "{broken-2",
      "{broken-3",
      "{broken-4",
      "{broken-5",
      "{broken-6",
    ]);
  });

  it("explicitly replaces unreadable storage while preserving raw inputs", () => {
    const storage = new MemoryStorage();
    storage.setItem(STORAGE_KEY, "{broken-primary");
    storage.setItem(BACKUP_KEY, "{broken-backup");
    const replacement = addCapturedTask(
      createEmptyData(NOW),
      "가져온 백업",
      NOW,
    );

    replaceUnreadableStoredData(storage, replacement, NOW);

    expect(parseDaymarkData(storage.getItem(STORAGE_KEY)!)).toEqual(
      replacement,
    );
    expect(storage.getItem(CORRUPT_PRIMARY_KEY)).toBe("{broken-primary");
    expect(
      JSON.parse(storage.getItem(CORRUPT_HISTORY_KEY) ?? "[]"),
    ).toEqual([
      expect.objectContaining({
        source: "backup",
        raw: "{broken-backup",
      }),
    ]);
    expect(() =>
      replaceUnreadableStoredData(storage, createEmptyData(NOW), NOW),
    ).toThrow("현재 저장 데이터가 정상");
  });

  it("stores timestamped snapshots and restores them as a new revision", () => {
    const storage = new MemoryStorage();
    const first = captured("복구할 일").data;
    const snapshots = saveSnapshot(
      storage,
      first,
      "완료 전",
      new Date("2026-07-28T10:00:00+09:00"),
    );
    const changed = addCapturedTask(first, "두 번째 일", NOW);
    const restored = restoreSnapshotData(changed, snapshots[0], NOW);

    expect(storage.getItem(SNAPSHOTS_KEY)).not.toBeNull();
    expect(loadSnapshots(storage)[0]).toMatchObject({
      label: "완료 전",
      createdAt: "2026-07-28T01:00:00.000Z",
    });
    expect(restored.tasks).toHaveLength(1);
    expect(restored.revision).toBe(changed.revision + 1);
  });

  it("adopts an imported backup without going backwards in revision", () => {
    const current = addCapturedTask(createEmptyData(NOW), "현재", NOW);
    const imported = createEmptyData(NOW);
    const adopted = adoptImportedData(current, imported, NOW);

    expect(adopted.tasks).toEqual([]);
    expect(adopted.revision).toBe(current.revision + 1);
  });
});
