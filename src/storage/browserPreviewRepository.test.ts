import { beforeEach, describe, expect, it } from "vitest";
import { addCapturedTask, createEmptyData } from "../lib/daymark";
import { BrowserPreviewRepository } from "./browserPreviewRepository";
import { RepositoryConflictError } from "./repository";

describe("BrowserPreviewRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("rejects a stale revision instead of overwriting", async () => {
    const repository = new BrowserPreviewRepository();
    const initial = createEmptyData();
    await repository.save(initial, null);
    await repository.save(addCapturedTask(initial, "첫 변경"), 0);

    await expect(
      repository.save(addCapturedTask(initial, "오래된 창의 변경"), 0),
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });
});
