import {
  type ChangeEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BACKUP_KEY,
  CORRUPT_HISTORY_KEY,
  CORRUPT_PRIMARY_KEY,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  SNAPSHOTS_KEY,
  STORAGE_KEY,
  V2_BACKUP_KEY,
  V2_STORAGE_KEY,
  adoptImportedData,
  confirmBackupRecovery,
  createEmptyData,
  parseBackupData,
  parseDaymarkData,
  removeSnapshot,
  replaceUnreadableStoredData,
  restoreSnapshotData,
  saveSnapshot,
  saveStoredData,
} from "../../lib/daymark";
import type {
  DaymarkData,
  DaymarkSnapshot,
} from "../../types";
import {
  downloadBackup,
  downloadText,
  getBrowserInitialState,
} from "../browserData";
import type { DemoCommit } from "../types";

interface UseBrowserStoreOptions {
  today: string;
  settingsRef: RefObject<HTMLDialogElement | null>;
}

export interface BrowserStoreState {
  data: DaymarkData;
  snapshots: DaymarkSnapshot[];
  notice: string;
  storageLocked: boolean;
  recoveryNeeded: boolean;
  storageConflict: DaymarkData | null;
  savedAt: string;
  undoAvailable: boolean;
}

export interface BrowserStoreActions {
  commit: DemoCommit;
  notify: (message: string) => void;
  dismissNotice: () => void;
  undoLatest: () => void;
  restoreSnapshot: (snapshot: DaymarkSnapshot) => void;
  reloadExternalData: () => void;
  importBackup: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  downloadBackup: () => void;
  downloadRecovery: () => void;
  resetToEmpty: () => void;
  confirmRecovery: () => void;
}

export interface BrowserStoreController {
  state: BrowserStoreState;
  actions: BrowserStoreActions;
}

export function useBrowserStore({
  today,
  settingsRef,
}: UseBrowserStoreOptions): BrowserStoreController {
  const [initial] = useState(getBrowserInitialState);
  const [data, setData] = useState(initial.data);
  const [snapshots, setSnapshots] = useState(initial.snapshots);
  const [undoSnapshotId, setUndoSnapshotId] = useState<string | null>(null);
  const [notice, setNotice] = useState(initial.notice);
  const [storageLocked, setStorageLocked] = useState(initial.storageLocked);
  const [recoveryNeeded, setRecoveryNeeded] = useState(
    initial.recoveryNeeded,
  );
  const [storageConflict, setStorageConflict] =
    useState<DaymarkData | null>(null);
  const [savedAt, setSavedAt] = useState(initial.data.updatedAt);
  const expectedDataRef = useRef(initial.data);

  useEffect(() => {
    if (storageLocked) return;
    try {
      saveStoredData(window.localStorage, data, expectedDataRef.current);
      expectedDataRef.current = data;
      setSavedAt(data.updatedAt);
    } catch (error) {
      const timeout = window.setTimeout(() => {
        let message =
          error instanceof Error
            ? error.message
            : "자동 저장을 멈췄습니다. 데이터 메뉴에서 백업 파일을 받아 주세요.";
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const external = parseDaymarkData(raw);
            if (JSON.stringify(external) !== JSON.stringify(data)) {
              setStorageConflict(external);
              message = "다른 탭에서 데이터가 바뀌었습니다.";
            }
          }
        } catch {
          // Keep the original save error when the primary is unreadable.
        }
        setStorageLocked(true);
        setNotice(message);
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [data, storageLocked]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const external = parseDaymarkData(event.newValue);
        if (
          external.revision !== data.revision ||
          JSON.stringify(external) !== JSON.stringify(data)
        ) {
          setStorageConflict(external);
          setStorageLocked(true);
          setNotice("다른 탭에서 데이터가 바뀌었습니다.");
        }
      } catch {
        setStorageLocked(true);
        setNotice("다른 탭의 저장 데이터를 읽지 못했습니다.");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [data]);

  const commit: DemoCommit = (operation, success, undoLabel) => {
    if (recoveryNeeded) {
      setNotice("열린 백업을 먼저 복구로 확정해 주세요.");
      settingsRef.current?.showModal();
      return;
    }
    if (storageConflict) {
      setNotice("다른 탭의 변경을 먼저 불러오세요.");
      return;
    }
    if (storageLocked) {
      setNotice("저장 문제를 먼저 해결해 주세요.");
      settingsRef.current?.showModal();
      return;
    }
    try {
      const next = operation(data);
      if (undoLabel) {
        const nextSnapshots = saveSnapshot(
          window.localStorage,
          data,
          undoLabel,
        );
        setSnapshots(nextSnapshots);
        setUndoSnapshotId(nextSnapshots[0]?.id ?? null);
      } else {
        setUndoSnapshotId(null);
      }
      setData(next);
      if (success) setNotice(success);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "작업을 처리하지 못했습니다.",
      );
    }
  };

  const undoLatest = () => {
    if (storageLocked) {
      setNotice("저장 문제를 먼저 해결해 주세요.");
      settingsRef.current?.showModal();
      return;
    }
    const latest = snapshots.find(
      (snapshot) => snapshot.id === undoSnapshotId,
    );
    if (!latest) return;
    try {
      const remaining = removeSnapshot(window.localStorage, latest.id);
      setSnapshots(remaining);
      setUndoSnapshotId(null);
      setData(restoreSnapshotData(data, latest));
      setNotice("최근 변경을 되돌렸습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "되돌리지 못했습니다.",
      );
    }
  };

  const restoreSnapshot = (snapshot: DaymarkSnapshot) => {
    if (recoveryNeeded) {
      setNotice("열린 백업을 먼저 복구로 확정해 주세요.");
      return;
    }
    if (storageConflict) {
      setNotice("다른 탭의 변경을 먼저 불러오세요.");
      return;
    }
    if (storageLocked) {
      setNotice("저장 문제를 먼저 해결해 주세요.");
      return;
    }
    try {
      const nextSnapshots = saveSnapshot(
        window.localStorage,
        data,
        "스냅샷 복원 전",
      );
      setSnapshots(nextSnapshots);
      setData(restoreSnapshotData(data, snapshot));
      settingsRef.current?.close();
      setNotice(`${snapshot.label} 상태를 복원했습니다.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "스냅샷을 복원하지 못했습니다.",
      );
    }
  };

  const reloadExternalData = () => {
    if (!storageConflict) return;
    expectedDataRef.current = storageConflict;
    setData(storageConflict);
    setStorageConflict(null);
    setRecoveryNeeded(false);
    setStorageLocked(false);
    setNotice("다른 탭의 변경을 불러왔습니다.");
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (recoveryNeeded) {
      setNotice("열린 백업을 먼저 복구로 확정해 주세요.");
      return;
    }
    if (storageConflict) {
      setNotice("다른 탭의 변경을 먼저 불러오세요.");
      return;
    }
    try {
      const parsed = parseBackupData(await file.text(), today);
      if (
        !window.confirm(
          "현재 백업 파일을 먼저 저장한 뒤 선택한 파일로 바꿀까요?",
        )
      ) {
        return;
      }
      downloadBackup(data);
      setSnapshots(
        saveSnapshot(window.localStorage, data, "백업 가져오기 전"),
      );
      const next = adoptImportedData(data, parsed.data);
      if (storageLocked) {
        replaceUnreadableStoredData(window.localStorage, next);
        expectedDataRef.current = next;
      }
      setData(next);
      setStorageLocked(false);
      setRecoveryNeeded(false);
      setStorageConflict(null);
      settingsRef.current?.close();
      setNotice(
        parsed.migrated
          ? "이전 백업을 새 형식으로 옮겨 불러왔습니다."
          : "백업을 불러왔습니다.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "백업을 불러오지 못했습니다.",
      );
    }
  };

  const downloadRecovery = () => {
    try {
      const raw = {
        [STORAGE_KEY]: window.localStorage.getItem(STORAGE_KEY),
        [BACKUP_KEY]: window.localStorage.getItem(BACKUP_KEY),
        [CORRUPT_PRIMARY_KEY]: window.localStorage.getItem(
          CORRUPT_PRIMARY_KEY,
        ),
        [CORRUPT_HISTORY_KEY]: window.localStorage.getItem(
          CORRUPT_HISTORY_KEY,
        ),
        [SNAPSHOTS_KEY]: window.localStorage.getItem(SNAPSHOTS_KEY),
        [V2_STORAGE_KEY]: window.localStorage.getItem(V2_STORAGE_KEY),
        [V2_BACKUP_KEY]: window.localStorage.getItem(V2_BACKUP_KEY),
        [LEGACY_STORAGE_KEY]: window.localStorage.getItem(LEGACY_STORAGE_KEY),
        [LEGACY_BACKUP_KEY]: window.localStorage.getItem(LEGACY_BACKUP_KEY),
      };
      downloadText(
        JSON.stringify(raw, null, 2),
        `daymark-recovery-${today}.json`,
      );
    } catch {
      setNotice("원본 데이터를 내려받지 못했습니다.");
    }
  };

  const resetToEmpty = () => {
    if (recoveryNeeded) {
      setNotice("열린 백업을 먼저 복구로 확정해 주세요.");
      return;
    }
    if (storageConflict) {
      setNotice("다른 탭의 변경을 먼저 불러오세요.");
      return;
    }
    if (
      !window.confirm(
        "현재 백업 파일을 먼저 저장한 뒤 빈 상태로 시작합니다. 계속할까요?",
      )
    ) {
      return;
    }
    downloadBackup(data);
    setSnapshots(
      saveSnapshot(window.localStorage, data, "빈 상태로 시작 전"),
    );
    const next = adoptImportedData(data, createEmptyData());
    if (storageLocked) {
      try {
        replaceUnreadableStoredData(window.localStorage, next);
        expectedDataRef.current = next;
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "저장 데이터를 교체하지 못했습니다.",
        );
        return;
      }
    }
    setData(next);
    setStorageLocked(false);
    setRecoveryNeeded(false);
    setStorageConflict(null);
    settingsRef.current?.close();
    setNotice("빈 상태로 시작했습니다.");
  };

  const confirmRecovery = () => {
    try {
      confirmBackupRecovery(window.localStorage, data);
      expectedDataRef.current = data;
      setRecoveryNeeded(false);
      setStorageLocked(false);
      setSavedAt(data.updatedAt);
      setNotice("마지막 정상 백업으로 저장 데이터를 복구했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "백업을 확정하지 못했습니다.",
      );
    }
  };

  return {
    state: {
      data,
      snapshots,
      notice,
      storageLocked,
      recoveryNeeded,
      storageConflict,
      savedAt,
      undoAvailable: Boolean(undoSnapshotId),
    },
    actions: {
      commit,
      notify: setNotice,
      dismissNotice: () => setNotice(""),
      undoLatest,
      restoreSnapshot,
      reloadExternalData,
      importBackup,
      downloadBackup: () => downloadBackup(data),
      downloadRecovery,
      resetToEmpty,
      confirmRecovery,
    },
  };
}
