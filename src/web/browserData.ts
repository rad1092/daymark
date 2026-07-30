import {
  createEmptyData,
  loadSnapshots,
  loadStoredData,
  localDateKey,
} from "../lib/daymark";
import type {
  DaymarkData,
  DaymarkSnapshot,
} from "../types";

export interface BrowserInitialState {
  data: DaymarkData;
  snapshots: DaymarkSnapshot[];
  notice: string;
  storageLocked: boolean;
  recoveryNeeded: boolean;
}

export function getBrowserInitialState(): BrowserInitialState {
  if (typeof window === "undefined") {
    return {
      data: createEmptyData(),
      snapshots: [],
      notice: "",
      storageLocked: false,
      recoveryNeeded: false,
    };
  }
  try {
    const result = loadStoredData(window.localStorage);
    const snapshots = loadSnapshots(window.localStorage);
    if (result.data) {
      return {
        data: result.data,
        snapshots,
        notice: result.issue ?? "",
        storageLocked: result.needsRecovery,
        recoveryNeeded: result.needsRecovery,
      };
    }
    return {
      data: createEmptyData(),
      snapshots,
      notice: result.issue ?? "",
      storageLocked: Boolean(result.issue),
      recoveryNeeded: false,
    };
  } catch {
    return {
      data: createEmptyData(),
      snapshots: [],
      notice: "브라우저 저장 공간을 열 수 없어 임시 상태로 시작합니다.",
      storageLocked: true,
      recoveryNeeded: false,
    };
  }
}

export function downloadText(
  content: string,
  filename: string,
  type = "application/json",
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadBackup(data: DaymarkData): void {
  downloadText(
    JSON.stringify(data, null, 2),
    `daymark-backup-${localDateKey()}.json`,
  );
}
