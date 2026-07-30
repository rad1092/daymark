import { invoke } from "@tauri-apps/api/core";
import { parseDaymarkData } from "../lib/daymark";
import type { DaymarkData } from "../types";
import {
  RepositoryConflictError,
  type DaymarkBackup,
  type DaymarkRepository,
} from "./repository";

interface NativeBackup {
  id: number;
  createdAt: string;
  label: string;
  dataJson: string;
}

function translateNativeError(error: unknown): never {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "Daymark 저장소를 열 수 없습니다.";
  if (message.startsWith("REVISION_CONFLICT:")) {
    throw new RepositoryConflictError(
      message.slice("REVISION_CONFLICT:".length).trim(),
    );
  }
  throw new Error(message);
}

export class NativeDaymarkRepository implements DaymarkRepository {
  readonly kind = "native-sqlite" as const;

  async load(): Promise<DaymarkData | null> {
    try {
      const raw = await invoke<string | null>("load_daymark_data");
      return raw ? parseDaymarkData(raw) : null;
    } catch (error) {
      return translateNativeError(error);
    }
  }

  async save(
    data: DaymarkData,
    expectedRevision: number | null,
  ): Promise<void> {
    try {
      await invoke("save_daymark_data", {
        dataJson: JSON.stringify(data),
        expectedRevision,
      });
    } catch (error) {
      translateNativeError(error);
    }
  }

  async createBackup(data: DaymarkData, label: string): Promise<void> {
    try {
      await invoke("create_daymark_backup", {
        dataJson: JSON.stringify(data),
        label,
      });
    } catch (error) {
      translateNativeError(error);
    }
  }

  async listBackups(): Promise<DaymarkBackup[]> {
    try {
      const backups = await invoke<NativeBackup[]>("list_daymark_backups");
      return backups.map((backup) => ({
        id: backup.id,
        createdAt: backup.createdAt,
        label: backup.label,
        data: parseDaymarkData(backup.dataJson),
      }));
    } catch (error) {
      return translateNativeError(error);
    }
  }
}
