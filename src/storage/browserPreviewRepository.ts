import {
  createEmptyData,
  parseDaymarkData,
} from "../lib/daymark";
import type { DaymarkData } from "../types";
import {
  RepositoryConflictError,
  type DaymarkBackup,
  type DaymarkRepository,
} from "./repository";

const PREVIEW_DATA_KEY = "daymark:software-preview:data:v3";
const PREVIEW_BACKUPS_KEY = "daymark:software-preview:backups:v1";
const BACKUP_LIMIT = 20;

function readBackups(): DaymarkBackup[] {
  const raw = window.localStorage.getItem(PREVIEW_BACKUPS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((candidate) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        typeof candidate.id !== "number" ||
        typeof candidate.createdAt !== "string" ||
        typeof candidate.label !== "string" ||
        typeof candidate.data !== "object"
      ) {
        return [];
      }
      try {
        return [
          {
            id: candidate.id,
            createdAt: candidate.createdAt,
            label: candidate.label,
            data: parseDaymarkData(JSON.stringify(candidate.data)),
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

export class BrowserPreviewRepository implements DaymarkRepository {
  readonly kind = "browser-preview" as const;

  async load(): Promise<DaymarkData | null> {
    const raw = window.localStorage.getItem(PREVIEW_DATA_KEY);
    return raw ? parseDaymarkData(raw) : null;
  }

  async save(
    data: DaymarkData,
    expectedRevision: number | null,
  ): Promise<void> {
    const raw = window.localStorage.getItem(PREVIEW_DATA_KEY);
    if (raw) {
      const current = parseDaymarkData(raw);
      if (
        expectedRevision === null ||
        current.revision !== expectedRevision
      ) {
        throw new RepositoryConflictError();
      }
    } else if (expectedRevision !== null) {
      throw new RepositoryConflictError(
        "저장 데이터가 사라졌습니다. 다시 열어 확인해 주세요.",
      );
    }
    window.localStorage.setItem(PREVIEW_DATA_KEY, JSON.stringify(data));
  }

  async createBackup(data: DaymarkData, label: string): Promise<void> {
    const backups = readBackups();
    const next: DaymarkBackup[] = [
      {
        id: Date.now(),
        createdAt: new Date().toISOString(),
        label: label.trim() || "수동 백업",
        data: parseDaymarkData(JSON.stringify(data)),
      },
      ...backups,
    ].slice(0, BACKUP_LIMIT);
    window.localStorage.setItem(PREVIEW_BACKUPS_KEY, JSON.stringify(next));
  }

  async listBackups(): Promise<DaymarkBackup[]> {
    return readBackups();
  }
}

export async function createFreshPreviewData(): Promise<DaymarkData> {
  return createEmptyData();
}
