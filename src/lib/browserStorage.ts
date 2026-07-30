import type {
  DaymarkData,
  DaymarkSnapshot,
  StorageLoadResult,
} from "../types";
import { createId, localDateKey, stamp } from "./common";
import {
  isObject,
  migrateLegacyData,
  migrateV2Data,
  parseDaymarkData,
} from "./schema";

export const STORAGE_KEY = "daymark:data:v3";
export const BACKUP_KEY = "daymark:data:backup:v3";
export const CORRUPT_PRIMARY_KEY = "daymark:data:corrupt:v3";
export const CORRUPT_HISTORY_KEY = "daymark:data:corrupt-history:v3";
export const SNAPSHOTS_KEY = "daymark:snapshots:v3";
export const V2_STORAGE_KEY = "daymark:data:v2";
export const V2_BACKUP_KEY = "daymark:data:backup:v2";
export const LEGACY_STORAGE_KEY = "daymark:data:v1";
export const LEGACY_BACKUP_KEY = "daymark:data:backup";
const SNAPSHOT_LIMIT = 20;
const CORRUPT_HISTORY_LIMIT = 5;
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface CorruptStorageRecord {
  capturedAt: string;
  source: "primary" | "backup";
  raw: string;
}


function tryParseV3(raw: string | null): DaymarkData | null {
  if (!raw) return null;
  try {
    return parseDaymarkData(raw);
  } catch {
    return null;
  }
}

function tryMigrateV2(
  raw: string | null,
  today: string,
  now: Date,
): DaymarkData | null {
  if (!raw) return null;
  try {
    return migrateV2Data(raw, today, now);
  } catch {
    return null;
  }
}

function tryMigrateV1(
  raw: string | null,
  today: string,
  now: Date,
): DaymarkData | null {
  if (!raw) return null;
  try {
    return migrateLegacyData(raw, today, now);
  } catch {
    return null;
  }
}

export function loadStoredData(
  storage: StorageLike,
  today = localDateKey(),
  now = new Date(),
): StorageLoadResult {
  const primaryRaw = storage.getItem(STORAGE_KEY);
  const primary = tryParseV3(primaryRaw);
  if (primary) {
    return {
      data: primary,
      recovered: false,
      needsRecovery: false,
      migrated: false,
      issue: null,
    };
  }

  const backupRaw = storage.getItem(BACKUP_KEY);
  const backup = tryParseV3(backupRaw);
  if (backup) {
    return {
      data: backup,
      recovered: true,
      needsRecovery: true,
      migrated: false,
      issue: "마지막 정상 백업을 열었습니다. 복구를 확정해 주세요.",
    };
  }

  if (primaryRaw || backupRaw) {
    return {
      data: null,
      recovered: false,
      needsRecovery: false,
      migrated: false,
      issue:
        "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다.",
    };
  }

  const v2Primary = tryMigrateV2(
    storage.getItem(V2_STORAGE_KEY),
    today,
    now,
  );
  if (v2Primary) {
    return {
      data: v2Primary,
      recovered: false,
      needsRecovery: false,
      migrated: true,
      issue:
        "기존 데이터를 새 형식으로 옮겼습니다. 날짜가 없던 나중 항목은 오늘 검토에 올렸습니다.",
    };
  }

  const v2Backup = tryMigrateV2(
    storage.getItem(V2_BACKUP_KEY),
    today,
    now,
  );
  if (v2Backup) {
    return {
      data: v2Backup,
      recovered: true,
      needsRecovery: false,
      migrated: true,
      issue:
        "이전 백업을 새 형식으로 옮겼습니다. 날짜가 없던 나중 항목은 오늘 검토에 올렸습니다.",
    };
  }

  const legacyPrimary = tryMigrateV1(
    storage.getItem(LEGACY_STORAGE_KEY),
    today,
    now,
  );
  if (legacyPrimary) {
    return {
      data: legacyPrimary,
      recovered: false,
      needsRecovery: false,
      migrated: true,
      issue:
        "기존 데이터를 새 형식으로 옮겼습니다. 이전 원본은 그대로 보관됩니다.",
    };
  }

  const legacyBackup = tryMigrateV1(
    storage.getItem(LEGACY_BACKUP_KEY),
    today,
    now,
  );
  if (legacyBackup) {
    return {
      data: legacyBackup,
      recovered: true,
      needsRecovery: false,
      migrated: true,
      issue:
        "이전 백업을 새 형식으로 옮겼습니다. 이전 원본은 그대로 보관됩니다.",
    };
  }

  const hadUnreadableData = Boolean(
    storage.getItem(V2_STORAGE_KEY) ||
      storage.getItem(V2_BACKUP_KEY) ||
    storage.getItem(LEGACY_STORAGE_KEY) ||
      storage.getItem(LEGACY_BACKUP_KEY),
  );
  return {
    data: null,
    recovered: false,
    needsRecovery: false,
    migrated: false,
    issue: hadUnreadableData
      ? "저장된 데이터를 읽지 못했습니다. 원본을 보관하고 자동 저장을 중지했습니다."
      : null,
  };
}

export function saveStoredData(
  storage: StorageLike,
  data: DaymarkData,
  expectedData?: DaymarkData,
): void {
  const currentRaw = storage.getItem(STORAGE_KEY);
  if (expectedData && currentRaw) {
    const current = parseDaymarkData(currentRaw);
    if (
      current.revision !== expectedData.revision ||
      JSON.stringify(current) !== JSON.stringify(expectedData)
    ) {
      throw new Error(
        "다른 탭에서 데이터가 바뀌었습니다. 이 탭을 새로 불러오세요.",
      );
    }
  }
  const previous = currentRaw;
  if (previous) {
    try {
      parseDaymarkData(previous);
      storage.setItem(BACKUP_KEY, previous);
    } catch {
      // Preserve the last known-good backup when the primary is invalid.
    }
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadCorruptHistory(storage: StorageLike): CorruptStorageRecord[] {
  const raw = storage.getItem(CORRUPT_HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CorruptStorageRecord =>
        isObject(item) &&
        typeof item.capturedAt === "string" &&
        (item.source === "primary" || item.source === "backup") &&
        typeof item.raw === "string",
    );
  } catch {
    return [];
  }
}

function appendCorruptHistory(
  storage: StorageLike,
  records: CorruptStorageRecord[],
): void {
  if (records.length === 0) return;
  const combined = [...loadCorruptHistory(storage), ...records];
  const unique = combined.filter(
    (record, index) =>
      combined.findIndex(
        (candidate) =>
          candidate.source === record.source &&
          candidate.raw === record.raw,
      ) === index,
  );
  storage.setItem(
    CORRUPT_HISTORY_KEY,
    JSON.stringify(unique.slice(-CORRUPT_HISTORY_LIMIT)),
  );
}

function preserveCorruptPrimary(
  storage: StorageLike,
  primaryRaw: string,
  now = new Date(),
  additionalRecords: CorruptStorageRecord[] = [],
): void {
  const previous = storage.getItem(CORRUPT_PRIMARY_KEY);
  const historyRecords = [...additionalRecords];
  if (previous && previous !== primaryRaw) {
    historyRecords.push({
      capturedAt: now.toISOString(),
      source: "primary",
      raw: previous,
    });
  }
  appendCorruptHistory(storage, historyRecords);
  storage.setItem(CORRUPT_PRIMARY_KEY, primaryRaw);
}

export function confirmBackupRecovery(
  storage: StorageLike,
  recoveredData: DaymarkData,
  now = new Date(),
): void {
  const backupRaw = storage.getItem(BACKUP_KEY);
  if (!backupRaw) {
    throw new Error("확정할 정상 백업을 찾지 못했습니다.");
  }
  const backup = parseDaymarkData(backupRaw);
  if (JSON.stringify(backup) !== JSON.stringify(recoveredData)) {
    throw new Error("열린 데이터가 마지막 정상 백업과 다릅니다.");
  }

  const primaryRaw = storage.getItem(STORAGE_KEY);
  if (primaryRaw && tryParseV3(primaryRaw)) {
    throw new Error("현재 저장 데이터가 정상이므로 복구를 덮어쓸 수 없습니다.");
  }
  if (primaryRaw) {
    preserveCorruptPrimary(storage, primaryRaw, now);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(backup));
}

export function replaceUnreadableStoredData(
  storage: StorageLike,
  replacement: DaymarkData,
  now = new Date(),
): void {
  const primaryRaw = storage.getItem(STORAGE_KEY);
  if (primaryRaw && tryParseV3(primaryRaw)) {
    throw new Error("현재 저장 데이터가 정상이므로 덮어쓸 수 없습니다.");
  }

  const backupRaw = storage.getItem(BACKUP_KEY);
  const additionalRecords: CorruptStorageRecord[] = [];
  if (
    backupRaw &&
    !tryParseV3(backupRaw) &&
    backupRaw !== primaryRaw
  ) {
    additionalRecords.push({
      capturedAt: now.toISOString(),
      source: "backup",
      raw: backupRaw,
    });
  }
  if (primaryRaw) {
    preserveCorruptPrimary(
      storage,
      primaryRaw,
      now,
      additionalRecords,
    );
  } else {
    appendCorruptHistory(storage, additionalRecords);
  }
  storage.setItem(STORAGE_KEY, JSON.stringify(replacement));
}

function parseSnapshot(value: unknown): DaymarkSnapshot | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.label !== "string" ||
    !isObject(value.data)
  ) {
    return null;
  }
  try {
    return {
      id: value.id,
      createdAt: value.createdAt,
      label: value.label,
      data: parseDaymarkData(JSON.stringify(value.data)),
    };
  } catch {
    return null;
  }
}

export function loadSnapshots(storage: StorageLike): DaymarkSnapshot[] {
  const raw = storage.getItem(SNAPSHOTS_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseSnapshot)
      .filter(
        (snapshot): snapshot is DaymarkSnapshot => snapshot !== null,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, SNAPSHOT_LIMIT);
  } catch {
    return [];
  }
}

export function saveSnapshot(
  storage: StorageLike,
  data: DaymarkData,
  label: string,
  now = new Date(),
): DaymarkSnapshot[] {
  const snapshot: DaymarkSnapshot = {
    id: createId("snapshot"),
    createdAt: now.toISOString(),
    label: label.trim() || "변경 전",
    data,
  };
  const snapshots = [snapshot, ...loadSnapshots(storage)].slice(
    0,
    SNAPSHOT_LIMIT,
  );
  storage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  return snapshots;
}

export function removeSnapshot(
  storage: StorageLike,
  snapshotId: string,
): DaymarkSnapshot[] {
  const snapshots = loadSnapshots(storage).filter(
    (snapshot) => snapshot.id !== snapshotId,
  );
  storage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
  return snapshots;
}

export function restoreSnapshotData(
  current: DaymarkData,
  snapshot: DaymarkSnapshot,
  now = new Date(),
): DaymarkData {
  return adoptImportedData(current, snapshot.data, now);
}

export function adoptImportedData(
  current: DaymarkData,
  imported: DaymarkData,
  now = new Date(),
): DaymarkData {
  return stamp(
    {
      ...imported,
      revision: current.revision,
    },
    now,
  );
}
