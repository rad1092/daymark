import {
  act,
  renderHook,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  addCapturedTask,
  createEmptyData,
  updateTask,
} from "../lib/daymark";
import type {
  DaymarkBackup,
  DaymarkRepository,
} from "../storage/repository";
import type { DaymarkData } from "../types";
import { useDaymarkStore } from "./useDaymarkStore";

class QueuedRepository implements DaymarkRepository {
  readonly kind = "browser-preview" as const;
  readonly saves: Array<{
    data: DaymarkData;
    expectedRevision: number | null;
  }> = [];
  data: DaymarkData;
  releaseFirstSave: (() => void) | null = null;

  constructor(data: DaymarkData) {
    this.data = data;
  }

  async load() {
    return this.data;
  }

  async save(
    data: DaymarkData,
    expectedRevision: number | null,
  ) {
    this.saves.push({ data, expectedRevision });
    if (this.saves.length === 1) {
      await new Promise<void>((resolve) => {
        this.releaseFirstSave = resolve;
      });
    }
    this.data = data;
  }

  async createBackup() {
    // Not needed by the store hook.
  }

  async listBackups(): Promise<DaymarkBackup[]> {
    return [];
  }
}

describe("useDaymarkStore", () => {
  it("queues an on-blur edit behind an in-flight save", async () => {
    const initial = addCapturedTask(
      createEmptyData(),
      "기존 약속",
    );
    const existingTask = initial.tasks[0];
    const repository = new QueuedRepository(initial);
    const { result } = renderHook(() =>
      useDaymarkStore(repository),
    );

    await waitFor(() =>
      expect(result.current.status).toBe("ready"),
    );

    let firstSave: Promise<boolean>;
    let blurSave: Promise<boolean>;
    act(() => {
      firstSave = result.current.commit((current) =>
        addCapturedTask(current, "동시에 수집한 일"),
      );
      blurSave = result.current.commit((current) =>
        updateTask(current, existingTask.id, {
          nextStep: "저장 중에도 잃지 않을 시작점",
        }),
      );
    });

    await waitFor(() => expect(repository.saves).toHaveLength(1));
    expect(repository.saves[0].expectedRevision).toBe(1);
    act(() => repository.releaseFirstSave?.());

    await act(async () => {
      expect(await firstSave).toBe(true);
      expect(await blurSave).toBe(true);
    });

    expect(repository.saves).toHaveLength(2);
    expect(repository.saves[1].expectedRevision).toBe(2);
    expect(repository.data.tasks).toHaveLength(2);
    expect(
      repository.data.tasks.find(
        (task) => task.id === existingTask.id,
      )?.nextStep,
    ).toBe("저장 중에도 잃지 않을 시작점");
  });
});
