import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getCleanupCandidates,
  getRecentDaySummaries,
  getRecentReceipts,
  localDateKey,
  pruneSettledTasks,
  searchTaskHistory,
  shiftDate,
} from "./lib/daymark";
import { DataSettingsDialog } from "./web/components/DataSettingsDialog";
import {
  DemoShell,
  type DemoView,
} from "./web/components/DemoShell";
import { DecisionDialog } from "./web/components/DecisionDialog";
import { useBrowserStore } from "./web/hooks/useBrowserStore";
import { useDecisionController } from "./web/hooks/useDecisionController";
import { useInstallability } from "./web/hooks/useInstallability";
import { useTaskActions } from "./web/hooks/useTaskActions";
import { useTodayViewModel } from "./web/hooks/useTodayViewModel";
import { RecordsView } from "./web/views/RecordsView";
import { TodayView } from "./web/views/TodayView";
import "./styles.css";

function WebDemoApp() {
  const [today, setToday] = useState(localDateKey);
  const [view, setView] = useState<DemoView>("today");
  const [historyQuery, setHistoryQuery] = useState("");
  const captureRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const store = useBrowserStore({ today, settingsRef });
  const { state: storeState, actions: storeActions } = store;
  const {
    data,
    snapshots,
    notice,
    storageLocked,
    recoveryNeeded,
    storageConflict,
    savedAt,
    undoAvailable,
  } = storeState;
  const taskActions = useTaskActions(today, storeActions.commit);
  const decision = useDecisionController({
    data,
    today,
    taskActions,
  });
  const installability = useInstallability(storeActions.notify);
  const todayViewModel = useTodayViewModel(
    data,
    today,
    Boolean(storageConflict),
  );

  useEffect(() => {
    const refreshDate = () => setToday(localDateKey());
    const interval = window.setInterval(refreshDate, 60_000);
    window.addEventListener("focus", refreshDate);
    document.addEventListener("visibilitychange", refreshDate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshDate);
      document.removeEventListener("visibilitychange", refreshDate);
    };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (event.key === "Escape") {
        settingsRef.current?.close();
        decision.dialogRef.current?.close();
        return;
      }
      if (!isTyping && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        captureRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [decision.dialogRef]);

  const recentSummaries = useMemo(
    () => getRecentDaySummaries(data, today),
    [data, today],
  );
  const recentReceipts = useMemo(() => getRecentReceipts(data), [data]);
  const historyEntries = useMemo(
    () => searchTaskHistory(data, historyQuery),
    [data, historyQuery],
  );
  const cleanupCutoff = shiftDate(today, -30);
  const cleanupCandidates = useMemo(
    () => getCleanupCandidates(data, cleanupCutoff),
    [cleanupCutoff, data],
  );

  const cleanupOldTasks = () => {
    if (cleanupCandidates.length === 0) return;
    if (
      !window.confirm(
        `30일이 지난 완료·삭제 항목 ${cleanupCandidates.length}개를 정리할까요? 먼저 백업 파일을 내려받습니다.`,
      )
    ) {
      return;
    }
    storeActions.downloadBackup();
    storeActions.commit(
      (current) => pruneSettledTasks(current, cleanupCutoff),
      `${cleanupCandidates.length}개 항목을 정리했습니다.`,
      "오래된 기록 정리 전",
    );
  };

  const content =
    view === "today" ? (
      <TodayView
        viewModel={todayViewModel}
        actions={{
          captureRef,
          commit: storeActions.commit,
          reloadExternalData: storeActions.reloadExternalData,
          openDecision: decision.open,
          ...taskActions,
        }}
      />
    ) : (
      <RecordsView
        viewModel={{
          today,
          recentReceipts,
          recentSummaries,
          historyEntries,
          historyQuery,
          cleanupCandidates,
        }}
        actions={{
          onHistoryQueryChange: setHistoryQuery,
          onCleanup: cleanupOldTasks,
        }}
      />
    );

  return (
    <DemoShell
      viewModel={{
        view,
        storageLocked,
        recoveryNeeded,
        savedAt,
        notice,
        undoAvailable,
      }}
      actions={{
        onViewChange: setView,
        onOpenSettings: () => settingsRef.current?.showModal(),
        onUndo: storeActions.undoLatest,
        onDismissNotice: storeActions.dismissNotice,
      }}
      content={content}
      dialogs={
        <>
          <DataSettingsDialog
            dialogRef={settingsRef}
            importRef={importRef}
            viewModel={{
              data,
              snapshots,
              storageLocked,
              recoveryNeeded,
              savedAt,
              persistenceState: installability.persistenceState,
              isStandalone: installability.isStandalone,
              installAvailable: installability.installAvailable,
            }}
            actions={{
              onClose: () => settingsRef.current?.close(),
              onConfirmRecovery: storeActions.confirmRecovery,
              onDownloadRecovery: storeActions.downloadRecovery,
              onDownloadBackup: storeActions.downloadBackup,
              onImportBackup: storeActions.importBackup,
              onRequestPersistentStorage:
                installability.requestPersistentStorage,
              onRestoreSnapshot: storeActions.restoreSnapshot,
              onInstall: installability.install,
              onReset: storeActions.resetToEmpty,
            }}
          />
          <DecisionDialog
            dialogRef={decision.dialogRef}
            viewModel={decision.viewModel}
            actions={decision.dialogActions}
          />
        </>
      }
    />
  );
}

export default WebDemoApp;
