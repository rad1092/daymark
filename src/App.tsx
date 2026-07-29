import {
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
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
  actOnLooseTask,
  actOnPlannedTask,
  adoptImportedData,
  addCapturedTask,
  addTaskToToday,
  beginDayClose,
  chooseCurrentTask,
  closeDay,
  confirmBackupRecovery,
  createEmptyData,
  formatLongDate,
  formatMinutes,
  formatPlanDate,
  getCommittedCount,
  getCleanupCandidates,
  getPendingPlanItems,
  getPlan,
  getRecentReceipts,
  getRecentDaySummaries,
  getReviewItems,
  getTask,
  loadStoredData,
  loadSnapshots,
  localDateKey,
  parseBackupData,
  parseDaymarkData,
  pruneSettledTasks,
  removeSnapshot,
  removeTaskFromToday,
  replaceUnreadableStoredData,
  reorderPendingTask,
  reopenDay,
  resolveReviewItem,
  restoreSnapshotData,
  resumeDay,
  saveSnapshot,
  saveStoredData,
  searchTaskHistory,
  shiftDate,
  startPlan,
  updateTask,
} from "./lib/daymark";
import type {
  BlockedDetails,
  DaymarkSnapshot,
  DaymarkData,
  DaymarkTask,
  DeferredDetails,
  ReviewItem,
  TaskAction,
} from "./types";

interface InitialState {
  data: DaymarkData;
  snapshots: DaymarkSnapshot[];
  notice: string;
  storageLocked: boolean;
  recoveryNeeded: boolean;
}

type DecisionTarget =
  | { kind: "planned"; taskId: string; planDate: string }
  | { kind: "loose"; taskId: string }
  | { kind: "review"; item: ReviewItem };

type DecisionMode = "tomorrow" | "schedule" | "blocked";

type AppView = "today" | "records";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const OUTCOME_LABELS: Record<string, string> = {
  done: "완료",
  tomorrow: "내일",
  later: "날짜 지정",
  blocked: "막힘",
  deleted: "삭제",
  carried: "다시 선택",
  planned: "계획",
  inbox: "수집",
};

const SUMMARY_COLUMNS = [
  { key: "done", label: "완료" },
  { key: "tomorrow", label: "내일" },
  { key: "later", label: "나중" },
  { key: "blocked", label: "막힘" },
  { key: "deleted", label: "삭제" },
] as const;

function getInitialState(): InitialState {
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

function downloadText(
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

function downloadBackup(data: DaymarkData): void {
  downloadText(
    JSON.stringify(data, null, 2),
    `daymark-backup-${localDateKey()}.json`,
  );
}

function formatSavedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장됨";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function CaptureForm({
  inputRef,
  onCapture,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onCapture: (title: string) => void;
}) {
  const [title, setTitle] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    onCapture(clean);
    setTitle("");
  };

  return (
    <form className="capture" onSubmit={submit}>
      <label htmlFor="new-task">새 일</label>
      <div className="capture-field">
        <input
          ref={inputRef}
          id="new-task"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="해야 할 일을 적으세요"
          autoComplete="off"
        />
        <button type="submit" disabled={!title.trim()}>
          수집함에 추가
        </button>
      </div>
      <p>수집함에 저장</p>
    </form>
  );
}

function EstimateSelect({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <label className="estimate-select">
      예상시간
      <select
        value={value ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? Number(event.target.value) : null)
        }
      >
        <option value="">미정</option>
        {[15, 30, 45, 60, 90, 120, 180].map((minutes) => (
          <option key={minutes} value={minutes}>
            {formatMinutes(minutes)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskDetails({
  task,
  onUpdate,
}: {
  task: DaymarkTask;
  onUpdate: (
    patch: Pick<
      Partial<DaymarkTask>,
      "title" | "notes" | "estimateMinutes"
    >,
  ) => void;
}) {
  return (
    <details className="task-details">
      <summary>세부 내용</summary>
      <div className="task-details-panel">
        <label>
          제목
          <input
            key={`${task.id}-${task.title}`}
            defaultValue={task.title}
            onBlur={(event) => {
              const nextTitle = event.target.value.trim();
              if (!nextTitle) {
                event.target.value = task.title;
              } else if (nextTitle !== task.title) {
                onUpdate({ title: nextTitle });
              }
            }}
          />
        </label>
        <label>
          메모
          <textarea
            value={task.notes}
            onChange={(event) => onUpdate({ notes: event.target.value })}
            rows={3}
            placeholder="필요한 맥락이나 완료 조건"
          />
        </label>
        <EstimateSelect
          value={task.estimateMinutes}
          onChange={(estimateMinutes) => onUpdate({ estimateMinutes })}
        />
      </div>
    </details>
  );
}

function ActionRow({
  onDone,
  onToday,
  onSchedule,
  onTomorrow,
  onBlocked,
  onDelete,
  todayDisabled = false,
  compact = false,
  primaryAction,
}: {
  onDone?: () => void;
  onToday?: () => void;
  onSchedule?: () => void;
  onTomorrow?: () => void;
  onBlocked?: () => void;
  onDelete?: () => void;
  todayDisabled?: boolean;
  compact?: boolean;
  primaryAction?: "done" | "today";
}) {
  const primary =
    primaryAction ?? (onDone ? "done" : onToday ? "today" : null);
  const hasMore = Boolean(
    (onDone && primary !== "done") ||
      (onToday && primary !== "today") ||
      onTomorrow ||
      onSchedule ||
      onBlocked ||
      onDelete,
  );
  return (
    <div className={`action-row${compact ? " action-row--compact" : ""}`}>
      {onDone && primary === "done" && (
        <button className="action-primary" type="button" onClick={onDone}>
          완료
        </button>
      )}
      {onToday && primary === "today" && (
        <button
          className="action-primary"
          type="button"
          onClick={onToday}
          disabled={todayDisabled}
        >
          오늘
        </button>
      )}
      {hasMore && (
        <details className="action-more">
          <summary>더보기</summary>
          <div>
            {onDone && primary !== "done" && (
              <button type="button" onClick={onDone}>
                완료
              </button>
            )}
            {onToday && primary !== "today" && (
              <button type="button" onClick={onToday} disabled={todayDisabled}>
                오늘
              </button>
            )}
            {onTomorrow && (
              <button type="button" onClick={onTomorrow}>
                내일
              </button>
            )}
            {onSchedule && (
              <button type="button" onClick={onSchedule}>
                날짜 지정
              </button>
            )}
            {onBlocked && (
              <button type="button" onClick={onBlocked}>
                막힘
              </button>
            )}
            {onDelete && (
              <button
                className="action-delete"
                type="button"
                onClick={onDelete}
              >
                삭제
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

function TaskMeta({ task }: { task: DaymarkTask }) {
  return (
    <div className="task-meta">
      <span>{formatMinutes(task.estimateMinutes)}</span>
      {task.reviewOn && <span>{formatPlanDate(task.reviewOn)} 다시 보기</span>}
      {task.blockedReason && <span>막힘: {task.blockedReason}</span>}
      {task.nextStep && <span>다음: {task.nextStep}</span>}
    </div>
  );
}

function EmptySlot({
  index,
  onAdd,
}: {
  index: number;
  onAdd: () => void;
}) {
  return (
    <button
      className="promise-slot promise-slot--empty"
      type="button"
      onClick={onAdd}
    >
      <span>{String(index).padStart(2, "0")}</span>
      <p>빈 자리</p>
      <small>할 일 추가</small>
    </button>
  );
}

function SectionHeader({
  eyebrow,
  title,
  aside,
  titleId,
}: {
  eyebrow: string;
  title: string;
  aside?: ReactNode;
  titleId?: string;
}) {
  return (
    <header className="section-header">
      <div>
        <p>{eyebrow}</p>
        <h2 id={titleId}>{title}</h2>
      </div>
      {aside}
    </header>
  );
}

function App() {
  const [initial] = useState(getInitialState);
  const [data, setData] = useState(initial.data);
  const [snapshots, setSnapshots] = useState(initial.snapshots);
  const [undoSnapshotId, setUndoSnapshotId] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState(initial.notice);
  const [storageLocked, setStorageLocked] = useState(initial.storageLocked);
  const [recoveryNeeded, setRecoveryNeeded] = useState(
    initial.recoveryNeeded,
  );
  const [storageConflict, setStorageConflict] =
    useState<DaymarkData | null>(null);
  const [savedAt, setSavedAt] = useState(initial.data.updatedAt);
  const [today, setToday] = useState(localDateKey);
  const [view, setView] = useState<AppView>("today");
  const [historyQuery, setHistoryQuery] = useState("");
  const [decisionTarget, setDecisionTarget] =
    useState<DecisionTarget | null>(null);
  const [decisionMode, setDecisionMode] =
    useState<DecisionMode>("tomorrow");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionNextStep, setDecisionNextStep] = useState("");
  const [decisionReviewOn, setDecisionReviewOn] = useState(() =>
    shiftDate(localDateKey(), 1),
  );
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [persistenceState, setPersistenceState] = useState<
    "checking" | "persistent" | "best-effort" | "unsupported"
  >("checking");
  const captureRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const decisionRef = useRef<HTMLDialogElement>(null);
  const expectedDataRef = useRef(initial.data);

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
    if (storageLocked) return;
    try {
      saveStoredData(
        window.localStorage,
        data,
        expectedDataRef.current,
      );
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

  useEffect(() => {
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const syncStandalone = () =>
      setIsStandalone(
        Boolean(displayMode?.matches) ||
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean })
              .standalone,
          ),
      );
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    syncStandalone();
    displayMode?.addEventListener?.("change", syncStandalone);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => {
      displayMode?.removeEventListener?.("change", syncStandalone);
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt,
      );
    };
  }, []);

  useEffect(() => {
    if (!navigator.storage?.persisted) {
      setPersistenceState("unsupported");
      return;
    }
    navigator.storage
      .persisted()
      .then((persisted) =>
        setPersistenceState(persisted ? "persistent" : "best-effort"),
      )
      .catch(() => setPersistenceState("unsupported"));
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
        decisionRef.current?.close();
        return;
      }
      if (!isTyping && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        captureRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (decisionTarget && !decisionRef.current?.open) {
      decisionRef.current?.showModal();
    }
  }, [decisionTarget]);

  const plan = useMemo(() => getPlan(data, today), [data, today]);
  const reviewItems = useMemo(
    () => getReviewItems(data, today),
    [data, today],
  );
  const pendingItems = useMemo(() => getPendingPlanItems(plan), [plan]);
  const committedItems = useMemo(() => {
    if (!plan) return [];
    if (plan.status === "draft") {
      return plan.items.filter((item) => item.outcome === "pending");
    }
    const itemByTask = new Map(
      plan.items.map((item) => [item.taskId, item]),
    );
    return plan.initialCommitmentIds
      .map((taskId) => itemByTask.get(taskId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [plan]);
  const executionItems = useMemo(() => {
    if (!plan || plan.status === "draft") return committedItems;
    const pending = committedItems.filter(
      (item) => item.outcome === "pending",
    );
    return [
      ...pending.filter((item) => item.taskId === plan.currentTaskId),
      ...pending.filter((item) => item.taskId !== plan.currentTaskId),
    ];
  }, [committedItems, plan]);
  const inboxTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => task.status === "inbox")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.tasks],
  );
  const parkedTasks = useMemo(
    () =>
      data.tasks
        .filter(
          (task) =>
            (task.status === "later" || task.status === "blocked") &&
            !reviewItems.some((review) => review.taskId === task.id),
        )
        .sort((a, b) => {
          if (a.reviewOn && b.reviewOn) {
            return a.reviewOn.localeCompare(b.reviewOn);
          }
          if (a.reviewOn) return -1;
          if (b.reviewOn) return 1;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [data.tasks, reviewItems],
  );
  const commitmentTasks = committedItems
    .map((item) => getTask(data, item.taskId))
    .filter((task): task is DaymarkTask => Boolean(task));
  const estimatedTasks = commitmentTasks.filter(
    (task) => task.estimateMinutes !== null,
  );
  const estimatedMinutes = estimatedTasks.reduce(
    (total, task) => total + (task.estimateMinutes ?? 0),
    0,
  );
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

  const commit = (
    operation: (current: DaymarkData) => DaymarkData,
    success?: string,
    undoLabel?: string,
  ) => {
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
      const remaining = removeSnapshot(
        window.localStorage,
        latest.id,
      );
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

  const restoreSelectedSnapshot = (snapshot: DaymarkSnapshot) => {
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

  const confirmDelete = (title: string, action: () => void) => {
    if (window.confirm(`“${title}”을 삭제할까요?`)) action();
  };

  const openDecision = (
    target: DecisionTarget,
    mode: DecisionMode,
    task: DaymarkTask,
  ) => {
    setDecisionTarget(target);
    setDecisionMode(mode);
    setDecisionReason(task.blockedReason ?? "");
    setDecisionNextStep(task.nextStep);
    setDecisionReviewOn(shiftDate(today, 1));
  };

  const updateTaskDetails = (
    taskId: string,
    patch: Pick<
      Partial<DaymarkTask>,
      "title" | "notes" | "nextStep" | "estimateMinutes"
    >,
  ) => commit((current) => updateTask(current, taskId, patch));

  const handlePlannedAction = (
    planDate: string,
    task: DaymarkTask,
    action: TaskAction,
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            actOnPlannedTask(
              current,
              planDate,
              task.id,
              action,
              today,
          ),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        actOnPlannedTask(
          current,
          planDate,
          task.id,
          action,
          today,
          new Date(),
          details,
        ),
      action === "done"
        ? "완료했습니다."
        : action === "tomorrow"
          ? "내일 다시 봅니다."
          : action === "later"
            ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
            : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  const handleLooseAction = (
    task: DaymarkTask,
    action: Exclude<TaskAction, "done">,
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            actOnLooseTask(current, task.id, action, today),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        actOnLooseTask(
          current,
          task.id,
          action,
          today,
          new Date(),
          details,
        ),
      action === "tomorrow"
        ? "내일 다시 봅니다."
        : action === "later"
          ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
          : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  const handleReviewAction = (
    item: ReviewItem,
    task: DaymarkTask,
    action: TaskAction | "today",
    details?: BlockedDetails | DeferredDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            resolveReviewItem(current, item, action, today),
          "삭제했습니다.",
          `${task.title} 삭제 전`,
        ),
      );
      return;
    }
    commit(
      (current) =>
        resolveReviewItem(
          current,
          item,
          action,
          today,
          new Date(),
          details,
        ),
      action === "today"
        ? "오늘 할 일로 가져왔습니다."
        : action === "done"
          ? "완료했습니다."
          : action === "tomorrow"
            ? "내일 다시 봅니다."
            : action === "later"
              ? `${details?.reviewOn ?? ""}에 다시 봅니다.`
              : "막힌 일로 표시했습니다.",
      `${task.title} 상태 변경 전`,
    );
  };

  const submitDecision = (event: FormEvent) => {
    event.preventDefault();
    if (!decisionTarget) return;
    const action: "tomorrow" | "later" | "blocked" =
      decisionMode === "schedule" ? "later" : decisionMode;
    const details: DeferredDetails | BlockedDetails =
      action === "blocked"
        ? {
            reason: decisionReason,
            reviewOn: decisionReviewOn,
            nextStep: decisionNextStep,
          }
        : {
            reviewOn:
              action === "tomorrow"
                ? shiftDate(today, 1)
                : decisionReviewOn,
            nextStep: decisionNextStep,
          };
    const task = getTask(
      data,
      decisionTarget.kind === "review"
        ? decisionTarget.item.taskId
        : decisionTarget.taskId,
    );
    if (!task) return;
    if (decisionTarget.kind === "planned") {
      handlePlannedAction(
        decisionTarget.planDate,
        task,
        action,
        details,
      );
    } else if (decisionTarget.kind === "loose") {
      handleLooseAction(task, action, details);
    } else {
      handleReviewAction(
        decisionTarget.item,
        task,
        action,
        details,
      );
    }
    decisionRef.current?.close();
    setDecisionTarget(null);
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

  const cleanupOldTasks = () => {
    if (cleanupCandidates.length === 0) return;
    if (
      !window.confirm(
        `30일이 지난 완료·삭제 항목 ${cleanupCandidates.length}개를 정리할까요? 먼저 백업 파일을 내려받습니다.`,
      )
    ) {
      return;
    }
    downloadBackup(data);
    commit(
      (current) => pruneSettledTasks(current, cleanupCutoff),
      `${cleanupCandidates.length}개 항목을 정리했습니다.`,
      "오래된 기록 정리 전",
    );
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

  const requestPersistentStorage = async () => {
    if (!navigator.storage?.persist) {
      setPersistenceState("unsupported");
      return;
    }
    try {
      const granted = await navigator.storage.persist();
      setPersistenceState(granted ? "persistent" : "best-effort");
      setNotice(
        granted
          ? "이 기기에서 Daymark 저장 공간을 유지합니다."
          : "브라우저가 일반 저장 모드를 유지했습니다. 백업 파일을 받아 두세요.",
      );
    } catch {
      setPersistenceState("unsupported");
      setNotice("저장 공간 유지 요청을 사용할 수 없습니다.");
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setNotice("Daymark를 설치했습니다.");
    }
    setInstallPrompt(null);
  };

  const renderReview = () => {
    const slotsLeft = Math.max(0, 3 - getCommittedCount(plan));
    return (
      <section className="review-panel" aria-labelledby="review-title">
        <SectionHeader
          eyebrow="검토"
          title={`처리할 일 ${reviewItems.length}개`}
          titleId="review-title"
          aside={
            <span className="review-capacity">
              {plan?.status === "draft" || !plan
                ? `오늘 ${slotsLeft}자리 남음`
                : "오늘 계획 확정"}
            </span>
          }
        />
        <div className="review-list" aria-label="다시 결정할 일">
          {reviewItems.map((item) => {
            const task = getTask(data, item.taskId);
            if (!task) return null;
            return (
              <article className="review-card" key={`${item.source}-${item.taskId}`}>
                <div className="review-card-copy">
                  <p>
                    {item.source === "stale-plan" && item.planDate
                      ? `${formatPlanDate(item.planDate)}에 남음`
                      : `${formatPlanDate(task.reviewOn ?? today)} 다시 보기`}
                  </p>
                  <h2>{task.title}</h2>
                  {task.notes && <div className="task-note">{task.notes}</div>}
                  <TaskMeta task={task} />
                </div>
                <ActionRow
                  primaryAction="today"
                  onDone={() => handleReviewAction(item, task, "done")}
                  onToday={() => handleReviewAction(item, task, "today")}
                  todayDisabled={
                    slotsLeft === 0 ||
                    plan?.status === "active" ||
                    plan?.status === "closing" ||
                    plan?.status === "closed"
                  }
                  onTomorrow={() =>
                    openDecision({ kind: "review", item }, "tomorrow", task)
                  }
                  onSchedule={() =>
                    openDecision({ kind: "review", item }, "schedule", task)
                  }
                  onBlocked={() =>
                    openDecision({ kind: "review", item }, "blocked", task)
                  }
                  onDelete={() => handleReviewAction(item, task, "deleted")}
                />
              </article>
            );
          })}
        </div>
      </section>
    );
  };

  const renderPromiseCard = (
    task: DaymarkTask,
    index: number,
  ) => {
    const isCurrent = plan?.currentTaskId === task.id;
    const pendingIndex = pendingItems.findIndex(
      (item) => item.taskId === task.id,
    );
    return (
      <article
        className={`promise-slot${isCurrent ? " is-current" : ""}`}
        key={task.id}
      >
        <div className="promise-index">
          <span>{String(index + 1).padStart(2, "0")}</span>
          {isCurrent && <strong>현재 작업</strong>}
        </div>
        <div className="promise-copy">
          <h3>{task.title}</h3>
          <TaskMeta task={task} />
          {isCurrent && (
            <label className="current-next-step">
              <span>끝낼 조건 · 다음 행동</span>
              <input
                value={task.nextStep}
                onChange={(event) =>
                  updateTaskDetails(task.id, {
                    nextStep: event.target.value,
                  })
                }
                placeholder="끝내려면 지금 무엇을 해야 하나요?"
              />
            </label>
          )}
          <TaskDetails
            task={task}
            onUpdate={(patch) => updateTaskDetails(task.id, patch)}
          />
        </div>
        {plan && plan.status !== "closing" && (
          <div className="promise-controls">
            {plan.status === "active" && !isCurrent && (
              <button
                className="small-primary"
                type="button"
                onClick={() =>
                  commit((current) =>
                    chooseCurrentTask(current, task.id, today),
                  )
                }
              >
                지금 하기
              </button>
            )}
            {plan.status === "draft" && (
              <div className="reorder">
                <button
                  type="button"
                  aria-label={`${task.title} 위로`}
                  disabled={pendingIndex <= 0}
                  onClick={() =>
                    commit((current) =>
                      reorderPendingTask(current, task.id, -1, today),
                    )
                  }
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`${task.title} 아래로`}
                  disabled={
                    pendingIndex < 0 ||
                    pendingIndex === pendingItems.length - 1
                  }
                  onClick={() =>
                    commit((current) =>
                      reorderPendingTask(current, task.id, 1, today),
                    )
                  }
                >
                  ↓
                </button>
              </div>
            )}
            {plan.status === "draft" && (
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  commit(
                    (current) =>
                      removeTaskFromToday(
                        current,
                        task.id,
                        today,
                      ),
                    "수집함으로 돌렸습니다.",
                    `${task.title} 오늘 선택 해제 전`,
                  )
                }
              >
                오늘에서 빼기
              </button>
            )}
            {isCurrent && (
              <ActionRow
                onDone={() =>
                  handlePlannedAction(plan.date, task, "done")
                }
                onTomorrow={() =>
                  openDecision(
                    {
                      kind: "planned",
                      taskId: task.id,
                      planDate: plan.date,
                    },
                    "tomorrow",
                    task,
                  )
                }
                onSchedule={() =>
                  openDecision(
                    {
                      kind: "planned",
                      taskId: task.id,
                      planDate: plan.date,
                    },
                    "schedule",
                    task,
                  )
                }
                onBlocked={() =>
                  openDecision(
                    {
                      kind: "planned",
                      taskId: task.id,
                      planDate: plan.date,
                    },
                    "blocked",
                    task,
                  )
                }
                onDelete={() =>
                  handlePlannedAction(plan.date, task, "deleted")
                }
              />
            )}
          </div>
        )}
      </article>
    );
  };

  const renderClosing = () => {
    if (!plan || plan.status !== "closing") return null;
    const doneCount = plan.items.filter(
      (item) => item.outcome === "done",
    ).length;
    return (
      <section className="closing-panel" aria-labelledby="closing-title">
        <SectionHeader
          eyebrow="하루 정리"
          titleId="closing-title"
          title={
            pendingItems.length
              ? `남은 일 ${pendingItems.length}개`
              : "오늘을 닫을 준비가 됐습니다"
          }
          aside={
            <button
              className="text-button"
              type="button"
              onClick={() =>
                commit((current) => resumeDay(current, today))
              }
            >
              계속 일하기
            </button>
          }
        />
        {pendingItems.length ? (
          <div className="closing-list">
            <p>
              끝내지 못한 일에는 다시 볼 날짜와 다음 행동을 남기세요.
            </p>
            {pendingItems.map((item) => {
              const task = getTask(data, item.taskId);
              if (!task) return null;
              return (
                <article key={task.id}>
                  <div>
                    <h3>{task.title}</h3>
                    <TaskMeta task={task} />
                  </div>
                  <ActionRow
                    onDone={() =>
                      handlePlannedAction(plan.date, task, "done")
                    }
                    onTomorrow={() =>
                      openDecision(
                        {
                          kind: "planned",
                          taskId: task.id,
                          planDate: plan.date,
                        },
                        "tomorrow",
                        task,
                      )
                    }
                    onSchedule={() =>
                      openDecision(
                        {
                          kind: "planned",
                          taskId: task.id,
                          planDate: plan.date,
                        },
                        "schedule",
                        task,
                      )
                    }
                    onBlocked={() =>
                      openDecision(
                        {
                          kind: "planned",
                          taskId: task.id,
                          planDate: plan.date,
                        },
                        "blocked",
                        task,
                      )
                    }
                    onDelete={() =>
                      handlePlannedAction(plan.date, task, "deleted")
                    }
                  />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="close-summary">
            <p>
              완료 <strong>{doneCount}</strong>개
            </p>
            <button
              className="primary-button"
              type="button"
              onClick={() =>
                commit(
                  (current) => closeDay(current, today),
                  "오늘 정리를 마쳤습니다.",
                  "오늘 닫기 전",
                )
              }
            >
              오늘 닫기
            </button>
          </div>
        )}
      </section>
    );
  };

  const renderLooseCard = (task: DaymarkTask) => (
    <article className="loose-card" key={task.id}>
      <div className="loose-copy">
        <h3>{task.title}</h3>
        <TaskMeta task={task} />
        <TaskDetails
          task={task}
          onUpdate={(patch) => updateTaskDetails(task.id, patch)}
        />
      </div>
      <ActionRow
        compact
        onToday={() =>
          commit(
            (current) => addTaskToToday(current, task.id, today),
            "오늘 할 일에 넣었습니다. 아래에서 순서를 확인하고 시작하세요.",
          )
        }
        todayDisabled={
          getCommittedCount(plan) >= 3 ||
          plan?.status === "active" ||
          plan?.status === "closing" ||
          plan?.status === "closed"
        }
        onTomorrow={() =>
          openDecision(
            { kind: "loose", taskId: task.id },
            "tomorrow",
            task,
          )
        }
        onSchedule={() =>
          openDecision(
            { kind: "loose", taskId: task.id },
            "schedule",
            task,
          )
        }
        onBlocked={() =>
          openDecision(
            { kind: "loose", taskId: task.id },
            "blocked",
            task,
          )
        }
        onDelete={() => handleLooseAction(task, "deleted")}
      />
    </article>
  );

  const renderWorkspace = () => {
    const planDone = plan?.items.filter(
      (item) => item.outcome === "done",
    ).length;
    const headline =
      plan?.status === "closed"
        ? "오늘 정리 완료"
        : plan?.status === "closing"
          ? "오늘 정리"
          : "오늘 할 일";
    const planState =
      plan?.status === "active"
        ? "진행 중"
        : plan?.status === "closing"
          ? "정리 중"
          : plan?.status === "closed"
            ? "정리 완료"
            : plan
              ? "시작 전"
              : "계획 전";
    const capture = (
      <CaptureForm
        inputRef={captureRef}
        onCapture={(title) =>
          commit(
            (current) => addCapturedTask(current, title),
            "수집함에 추가했습니다.",
          )
        }
      />
    );
    const isPlanning =
      plan?.status !== "active" &&
      plan?.status !== "closing" &&
      plan?.status !== "closed";
    const promises =
      plan?.status !== "closing" && plan?.status !== "closed" && (
      <section className="promises" aria-labelledby="promises-title">
        <SectionHeader
          eyebrow={plan?.status === "active" ? "실행" : "오늘"}
          title={
            plan?.status === "active"
              ? `현재 작업과 다음 ${Math.max(0, executionItems.length - 1)}개`
              : `할 일 ${committedItems.length}/3`
          }
          titleId="promises-title"
          aside={
            plan?.status === "draft" && pendingItems.length > 0 ? (
              <button
                className="primary-button"
                type="button"
                onClick={() =>
                  commit(
                    (current) => startPlan(current, today),
                    "오늘 계획을 시작했습니다.",
                    "오늘 시작 전",
                  )
                }
              >
                이 순서로 시작
              </button>
            ) : plan?.status === "active" ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  commit((current) => beginDayClose(current, today))
                }
              >
                하루 정리
              </button>
            ) : null
          }
        />
        <div className="promise-list">
          {(plan?.status === "active"
            ? executionItems
            : committedItems
          ).map((item) => {
            const task = getTask(data, item.taskId);
            if (!task) return null;
            const originalIndex = committedItems.findIndex(
              (candidate) => candidate.taskId === item.taskId,
            );
            return renderPromiseCard(task, originalIndex);
          })}
          {isPlanning &&
            Array.from({
              length: Math.max(0, 3 - committedItems.length),
            }).map((_, index) => (
              <EmptySlot
                key={index}
                index={committedItems.length + index + 1}
                onAdd={() => captureRef.current?.focus()}
              />
            ))}
        </div>
        {plan?.status === "active" &&
          committedItems.some((item) => item.outcome !== "pending") && (
            <ol className="settled-today" aria-label="오늘 처리한 약속">
              {committedItems
                .filter((item) => item.outcome !== "pending")
                .map((item) => {
                  const task = getTask(data, item.taskId);
                  if (!task) return null;
                  return (
                    <li key={item.taskId}>
                      <span>{task.title}</span>
                      <strong>
                        {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                      </strong>
                    </li>
                  );
                })}
            </ol>
          )}
      </section>
    );
    const inbox = (
      <section className="inbox" aria-labelledby="inbox-title">
        <SectionHeader
          eyebrow="수집함"
          title="분류를 기다리는 일"
          titleId="inbox-title"
          aside={<span className="count-badge">{inboxTasks.length}</span>}
        />
        {inboxTasks.length ? (
          <div className="loose-list">{inboxTasks.map(renderLooseCard)}</div>
        ) : (
          <p className="empty-copy">수집함이 비었습니다.</p>
        )}
      </section>
    );
    const parked = (
      <details className="parked">
        <summary>
          <span>예정 및 막힘</span>
          <strong>{parkedTasks.length}</strong>
        </summary>
        <div className="parked-body">
          {parkedTasks.length ? (
            <div className="loose-list">
              {parkedTasks.map(renderLooseCard)}
            </div>
          ) : (
            <p className="empty-copy">기다리는 일이 없습니다.</p>
          )}
        </div>
      </details>
    );
    return (
      <main id="main" className="workspace">
        <section className="day-heading">
          <div>
            <p>{formatLongDate()}</p>
            <h1>{headline}</h1>
          </div>
          <div className="day-facts">
            <p>
              상태 <strong>{planState}</strong>
            </p>
            <p>
              {commitmentTasks.length === 0
                ? "오늘 0/3 선택"
                : estimatedTasks.length === 0
                  ? `${commitmentTasks.length}개 · 시간 미정`
                  : `${commitmentTasks.length}개 중 ${estimatedTasks.length}개 입력 · ${formatMinutes(
                      estimatedMinutes,
                    )}`}
            </p>
          </div>
        </section>

        {storageConflict && (
          <section className="conflict-banner" aria-live="assertive">
            <div>
              <strong>다른 탭에서 변경됨</strong>
              <p>이 탭에서는 저장을 멈췄습니다.</p>
            </div>
            <button type="button" onClick={reloadExternalData}>
              변경 불러오기
            </button>
          </section>
        )}

        {plan?.status !== "active" &&
          plan?.status !== "closing" &&
          reviewItems.length > 0 &&
          renderReview()}
        {renderClosing()}

        {plan?.status === "closed" && (
          <section className="closed-day closed-receipt">
            <header>
              <div>
                <span>정리 완료</span>
                <strong>{planDone ?? 0}개 완료</strong>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  commit(
                    (current) => reopenDay(current, today),
                    "오늘 계획을 다시 열었습니다.",
                    "오늘 다시 열기 전",
                  )
                }
              >
                오늘 다시 열기
              </button>
            </header>
            {plan.receipt && (
              <ol>
                {plan.receipt.items.map((item) => (
                  <li key={item.taskId}>
                    <div>
                      <strong>{item.title}</strong>
                      {item.nextStep && <p>{item.nextStep}</p>}
                    </div>
                    <span>
                      {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}

        {isPlanning && capture}
        {isPlanning && inbox}
        {promises}

        {(plan?.status === "active" || plan?.status === "closing") &&
          reviewItems.length > 0 &&
          renderReview()}

        {isPlanning && parked}

        {!isPlanning && (
          <details className="during-day-extras">
            <summary>
              <span>수집함 {inboxTasks.length}</span>
              <span>예정 및 막힘 {parkedTasks.length}</span>
            </summary>
            <div>
              {capture}
              {inbox}
              {parked}
            </div>
          </details>
        )}
      </main>
    );
  };

  const renderRecords = () => {
    const visibleEntries = historyEntries.slice(
      0,
      historyQuery.trim() ? 50 : 12,
    );
    return (
      <main id="main" className="workspace records-workspace">
        <section className="records-heading">
          <div>
            <p>지난 흐름</p>
            <h1>기록</h1>
          </div>
          <p>
            날짜별로 무엇을 끝냈고, 무엇을 미뤘는지 확인합니다.
          </p>
        </section>

        <section className="receipt-history" aria-labelledby="receipt-title">
          <SectionHeader
            eyebrow="최근 종료"
            title="하루 기록"
            titleId="receipt-title"
          />
          {recentReceipts.length ? (
            <ol>
              {recentReceipts.map((receipt) => (
                <li key={receipt.date}>
                  <header>
                    <time dateTime={receipt.date}>
                      {formatPlanDate(receipt.date)}
                    </time>
                    <strong>
                      {
                        receipt.items.filter(
                          (item) => item.outcome === "done",
                        ).length
                      }
                      /{receipt.items.length} 완료
                    </strong>
                  </header>
                  <ul>
                    {receipt.items.map((item) => (
                      <li key={item.taskId}>
                        <span>{item.title}</span>
                        <span>
                          {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                        </span>
                        {item.nextStep && <p>{item.nextStep}</p>}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy">아직 닫은 하루가 없습니다.</p>
          )}
        </section>

        <section className="week-record" aria-labelledby="week-record-title">
          <SectionHeader
            eyebrow="최근 7일"
            title="하루 결정"
            titleId="week-record-title"
          />
          <div className="record-table-wrap">
            <table className="record-table" aria-labelledby="week-record-title">
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  {SUMMARY_COLUMNS.map((column) => (
                    <th scope="col" key={column.key}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSummaries.map((summary) => (
                  <tr
                    key={summary.date}
                    className={summary.date === today ? "is-today" : ""}
                  >
                    <th scope="row">
                      <time dateTime={summary.date}>
                        {formatPlanDate(summary.date)}
                      </time>
                      {summary.date === today && <span>오늘</span>}
                    </th>
                    {SUMMARY_COLUMNS.map((column) => (
                      <td key={column.key}>
                        <span
                          className={
                            summary.counts[column.key] === 0 ? "is-zero" : ""
                          }
                        >
                          {summary.counts[column.key]}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="history-search" aria-labelledby="history-title">
          <SectionHeader
            eyebrow="지난 작업"
            title="찾기"
            titleId="history-title"
            aside={<span className="count-badge">{historyEntries.length}</span>}
          />
          <label className="history-search-field" htmlFor="history-query">
            <span>제목·메모·막힌 이유 검색</span>
            <input
              id="history-query"
              type="search"
              value={historyQuery}
              onChange={(event) => setHistoryQuery(event.target.value)}
              placeholder="예: 견적서, 회신, 배포"
              autoComplete="off"
            />
          </label>
          {visibleEntries.length ? (
            <ol className="history-results">
              {visibleEntries.map((entry) => (
                <li key={entry.task.id}>
                  <div>
                    <h3>{entry.task.title}</h3>
                    {entry.task.notes && <p>{entry.task.notes}</p>}
                  </div>
                  <div className="history-result-meta">
                    <span>{OUTCOME_LABELS[entry.outcome] ?? entry.outcome}</span>
                    <time dateTime={entry.date}>
                      {formatPlanDate(entry.date)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy">
              {historyQuery.trim()
                ? "검색어와 맞는 지난 작업이 없습니다."
                : "아직 지난 작업 기록이 없습니다."}
            </p>
          )}
        </section>

        <section className="cleanup-panel" aria-labelledby="cleanup-title">
          <div>
            <p>기록 정리</p>
            <h2 id="cleanup-title">30일이 지난 완료·삭제 항목</h2>
            <span>
              {cleanupCandidates.length
                ? `${cleanupCandidates.length}개를 정리할 수 있습니다.`
                : "정리할 오래된 항목이 없습니다."}
            </span>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={cleanupOldTasks}
            disabled={cleanupCandidates.length === 0}
          >
            백업 후 정리
          </button>
        </section>
      </main>
    );
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <header className="app-header">
        <a
          className="wordmark"
          href="/"
          aria-label="Daymark 오늘"
          onClick={(event) => {
            event.preventDefault();
            setView("today");
          }}
        >
          <span aria-hidden="true">D</span>
          Daymark
        </a>
        <div className="header-meta">
          <nav className="product-nav" aria-label="Daymark 화면">
            <button
              type="button"
              aria-label="오늘 화면"
              aria-current={view === "today" ? "page" : undefined}
              onClick={() => setView("today")}
            >
              오늘
            </button>
            <button
              type="button"
              aria-label="기록 화면"
              aria-current={view === "records" ? "page" : undefined}
              onClick={() => setView("records")}
            >
              기록
            </button>
          </nav>
          <span className={storageLocked ? "save-state is-paused" : "save-state"}>
            {recoveryNeeded
              ? "백업 확인 필요"
              : storageLocked
              ? "저장 멈춤"
              : `저장 ${formatSavedTime(savedAt)}`}
          </span>
          <button
            type="button"
            onClick={() => settingsRef.current?.showModal()}
          >
            데이터
          </button>
        </div>
      </header>

      {view === "today" ? renderWorkspace() : renderRecords()}

      <footer className="app-footer">
        <span>Daymark</span>
        <p>
          새 일 <kbd>N</kbd> · 데이터는 현재 브라우저에 저장
        </p>
      </footer>

      <div className="live-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            {undoSnapshotId && (
              <button type="button" onClick={undoLatest}>
                되돌리기
              </button>
            )}
            <button type="button" onClick={() => setNotice("")}>
              닫기
            </button>
          </div>
        )}
      </div>

      <dialog className="dialog" ref={settingsRef}>
        <header>
          <div>
            <p>데이터</p>
            <h2>백업과 복원</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="닫기"
            onClick={() => settingsRef.current?.close()}
          >
            ×
          </button>
        </header>
        <p className="dialog-intro">
          할 일과 하루 기록은 이 브라우저에 저장됩니다. 기기를 바꾸기 전에
          백업 파일을 받아 두세요.
        </p>
        {storageLocked && (
          <div className="storage-warning">
            <strong>
              {recoveryNeeded
                ? "마지막 정상 백업을 열었습니다."
                : "자동 저장이 멈춰 있습니다."}
            </strong>
            <p>
              {recoveryNeeded
                ? "내용을 확인한 뒤 이 백업을 저장 데이터로 확정해 주세요. 손상된 원본은 별도로 보관합니다."
                : "읽을 수 없는 원본을 보관하고 자동 저장을 중지했습니다."}
            </p>
            {recoveryNeeded && (
              <button type="button" onClick={confirmRecovery}>
                이 백업으로 복구
              </button>
            )}
            <button type="button" onClick={downloadRecovery}>
              원본 복구 파일 내려받기
            </button>
          </div>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={() => downloadBackup(data)}>
            <strong>백업 파일 받기</strong>
            <span>
              {data.tasks.filter((task) => task.status !== "deleted").length}개
              할 일 · {data.plans.length}일 기록
            </span>
          </button>
          <button
            type="button"
            onClick={() => importRef.current?.click()}
            disabled={recoveryNeeded}
          >
            <strong>백업 파일 가져오기</strong>
            <span>이전 버전의 백업도 열 수 있습니다.</span>
          </button>
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={importBackup}
          />
        </div>
        <section className="data-status">
          <div>
            <strong>저장 상태</strong>
            <span>
              {storageLocked
                ? recoveryNeeded
                  ? "백업 확인 필요"
                  : "저장 멈춤"
                : `마지막 저장 ${formatSavedTime(savedAt)}`}
            </span>
          </div>
          {persistenceState !== "persistent" &&
            persistenceState !== "unsupported" && (
              <button type="button" onClick={requestPersistentStorage}>
                이 기기에서 유지
              </button>
            )}
          {persistenceState === "persistent" && <span>지속 저장 사용 중</span>}
        </section>
        <section className="snapshot-list">
          <header>
            <strong>복구 지점</strong>
            <span>{snapshots.length}개</span>
          </header>
          {snapshots.length ? (
            <ol>
              {snapshots.slice(0, 5).map((snapshot) => (
                <li key={snapshot.id}>
                  <div>
                    <strong>{snapshot.label}</strong>
                    <time dateTime={snapshot.createdAt}>
                      {new Intl.DateTimeFormat("ko-KR", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(snapshot.createdAt))}
                    </time>
                  </div>
                  <button
                    type="button"
                    disabled={recoveryNeeded}
                    onClick={() => restoreSelectedSnapshot(snapshot)}
                  >
                    복원
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>상태를 바꾸면 복구 지점이 생깁니다.</p>
          )}
        </section>
        <section className="install-panel">
          <header>
            <strong>앱으로 사용</strong>
            <span>{isStandalone ? "설치됨" : "브라우저에서 사용 중"}</span>
          </header>
          {installPrompt && !isStandalone && (
            <button type="button" onClick={installApp}>
              Daymark 설치
            </button>
          )}
          <p>
            iPhone·iPad는 Safari의 공유 메뉴에서 홈 화면에 추가합니다.
            설치 앱은 Safari와 저장 공간이 다릅니다. 먼저 Safari에서 백업
            파일을 받고, 설치한 앱에서 가져오세요.
          </p>
        </section>
        <button
          className="reset-button"
          type="button"
          onClick={resetToEmpty}
          disabled={recoveryNeeded}
        >
          빈 상태로 시작
        </button>
      </dialog>

      <dialog
        className="dialog dialog--blocked"
        ref={decisionRef}
        onClose={() => setDecisionTarget(null)}
      >
        <header>
          <div>
            <p>
              {decisionMode === "blocked"
                ? "막힘"
                : decisionMode === "tomorrow"
                  ? "내일"
                  : "날짜 지정"}
            </p>
            <h2>다음 시작점을 남기세요.</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="닫기"
            onClick={() => decisionRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form onSubmit={submitDecision}>
          {decisionMode === "blocked" && (
            <label>
              막힌 이유
              <textarea
                value={decisionReason}
                onChange={(event) =>
                  setDecisionReason(event.target.value)
                }
                placeholder="예: 견적 회신 대기"
                rows={2}
                required
              />
            </label>
          )}
          <label>
            다음 행동
            <input
              value={decisionNextStep}
              onChange={(event) =>
                setDecisionNextStep(event.target.value)
              }
              placeholder="예: 회신에서 금액 확인"
              required
              autoFocus
            />
          </label>
          {decisionMode === "tomorrow" ? (
            <p className="decision-date">
              {formatPlanDate(shiftDate(today, 1))}에 다시 표시
            </p>
          ) : (
            <label>
              다시 볼 날짜
              <input
                type="date"
                value={decisionReviewOn}
                min={shiftDate(today, 1)}
                onChange={(event) =>
                  setDecisionReviewOn(event.target.value)
                }
                required
              />
            </label>
          )}
          <button
            className="primary-button"
            type="submit"
            disabled={
              !decisionNextStep.trim() ||
              (decisionMode === "blocked" &&
                !decisionReason.trim()) ||
              (decisionMode !== "tomorrow" &&
                decisionReviewOn <= today)
            }
          >
            {decisionMode === "blocked"
              ? "막힘으로 저장"
              : decisionMode === "tomorrow"
                ? "내일 보기"
                : "날짜 저장"}
          </button>
        </form>
      </dialog>
    </div>
  );
}

export default App;
