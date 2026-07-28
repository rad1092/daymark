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
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  actOnLooseTask,
  actOnPlannedTask,
  addCapturedTask,
  addTaskToToday,
  beginDayClose,
  chooseCurrentTask,
  closeDay,
  createEmptyData,
  formatLongDate,
  formatMinutes,
  formatPlanDate,
  getCommittedCount,
  getPendingPlanItems,
  getPlan,
  getReviewItems,
  getTask,
  loadStoredData,
  localDateKey,
  parseBackupData,
  reorderPendingTask,
  resolveReviewItem,
  resumeDay,
  saveStoredData,
  shiftDate,
  startPlan,
  updateTask,
} from "./lib/daymark";
import type {
  BlockedDetails,
  DaymarkData,
  DaymarkTask,
  ReviewItem,
  TaskAction,
} from "./types";

interface InitialState {
  data: DaymarkData;
  notice: string;
  storageLocked: boolean;
}

type BlockTarget =
  | { kind: "planned"; taskId: string; planDate: string }
  | { kind: "loose"; taskId: string }
  | { kind: "review"; item: ReviewItem };

function getInitialState(): InitialState {
  if (typeof window === "undefined") {
    return {
      data: createEmptyData(),
      notice: "",
      storageLocked: false,
    };
  }
  try {
    const result = loadStoredData(window.localStorage);
    if (result.data) {
      return {
        data: result.data,
        notice: result.issue ?? "",
        storageLocked: false,
      };
    }
    return {
      data: createEmptyData(),
      notice: result.issue ?? "",
      storageLocked: Boolean(result.issue),
    };
  } catch {
    return {
      data: createEmptyData(),
      notice: "브라우저 저장 공간을 열 수 없어 임시 상태로 시작합니다.",
      storageLocked: true,
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
    patch: Pick<Partial<DaymarkTask>, "title" | "notes" | "estimateMinutes">,
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
  onLater,
  onTomorrow,
  onBlocked,
  onDelete,
  todayDisabled = false,
  compact = false,
  primaryAction,
}: {
  onDone?: () => void;
  onToday?: () => void;
  onLater?: () => void;
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
      onLater ||
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
            {onLater && (
              <button type="button" onClick={onLater}>
                나중
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
  const [notice, setNotice] = useState(initial.notice);
  const [storageLocked, setStorageLocked] = useState(initial.storageLocked);
  const [today, setToday] = useState(localDateKey);
  const [blockTarget, setBlockTarget] = useState<BlockTarget | null>(null);
  const [blockReason, setBlockReason] = useState("");
  const [blockReviewOn, setBlockReviewOn] = useState(() =>
    shiftDate(localDateKey(), 1),
  );
  const captureRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef<HTMLDialogElement>(null);
  const blockedRef = useRef<HTMLDialogElement>(null);

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
      saveStoredData(window.localStorage, data);
    } catch {
      const timeout = window.setTimeout(() => {
        setStorageLocked(true);
        setNotice(
          "자동 저장을 멈췄습니다. 데이터 메뉴에서 백업 파일을 받아 주세요.",
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [data, storageLocked]);

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
        blockedRef.current?.close();
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
    if (blockTarget && !blockedRef.current?.open) {
      blockedRef.current?.showModal();
    }
  }, [blockTarget]);

  const plan = useMemo(() => getPlan(data, today), [data, today]);
  const reviewItems = useMemo(
    () => getReviewItems(data, today),
    [data, today],
  );
  const pendingItems = useMemo(() => getPendingPlanItems(plan), [plan]);
  const committedItems = useMemo(
    () =>
      plan?.items.filter(
        (item) => item.outcome === "pending" || item.outcome === "done",
      ) ?? [],
    [plan],
  );
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

  const commit = (
    operation: (current: DaymarkData) => DaymarkData,
    success?: string,
  ) => {
    try {
      const next = operation(data);
      setData(next);
      if (success) setNotice(success);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "작업을 처리하지 못했습니다.",
      );
    }
  };

  const confirmDelete = (title: string, action: () => void) => {
    if (window.confirm(`“${title}”을 삭제할까요?`)) action();
  };

  const openBlocked = (target: BlockTarget) => {
    setBlockTarget(target);
    setBlockReason("");
    setBlockReviewOn(shiftDate(today, 1));
  };

  const updateTaskDetails = (
    taskId: string,
    patch: Pick<
      Partial<DaymarkTask>,
      "title" | "notes" | "estimateMinutes"
    >,
  ) => commit((current) => updateTask(current, taskId, patch));

  const handlePlannedAction = (
    planDate: string,
    task: DaymarkTask,
    action: TaskAction,
    blocked?: BlockedDetails,
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
          blocked,
        ),
      action === "done"
        ? "완료했습니다."
        : action === "tomorrow"
          ? "내일 다시 봅니다."
          : action === "later"
            ? "나중 목록으로 옮겼습니다."
            : "막힌 일로 표시했습니다.",
    );
  };

  const handleLooseAction = (
    task: DaymarkTask,
    action: Exclude<TaskAction, "done">,
    blocked?: BlockedDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            actOnLooseTask(current, task.id, action, today),
          "삭제했습니다.",
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
          blocked,
        ),
      action === "tomorrow"
        ? "내일 다시 봅니다."
        : action === "later"
          ? "나중 목록으로 옮겼습니다."
          : "막힌 일로 표시했습니다.",
    );
  };

  const handleReviewAction = (
    item: ReviewItem,
    task: DaymarkTask,
    action: TaskAction | "today",
    blocked?: BlockedDetails,
  ) => {
    if (action === "deleted") {
      confirmDelete(task.title, () =>
        commit(
          (current) =>
            resolveReviewItem(current, item, action, today),
          "삭제했습니다.",
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
          blocked,
        ),
      action === "today"
        ? "오늘 할 일로 가져왔습니다."
        : action === "done"
          ? "완료했습니다."
          : action === "tomorrow"
            ? "내일 다시 봅니다."
            : action === "later"
              ? "나중 목록으로 옮겼습니다."
              : "막힌 일로 표시했습니다.",
    );
  };

  const submitBlocked = (event: FormEvent) => {
    event.preventDefault();
    if (!blockTarget) return;
    const details = {
      reason: blockReason,
      reviewOn: blockReviewOn,
    };
    const task = getTask(
      data,
      blockTarget.kind === "review"
        ? blockTarget.item.taskId
        : blockTarget.taskId,
    );
    if (!task) return;
    if (blockTarget.kind === "planned") {
      handlePlannedAction(
        blockTarget.planDate,
        task,
        "blocked",
        details,
      );
    } else if (blockTarget.kind === "loose") {
      handleLooseAction(task, "blocked", details);
    } else {
      handleReviewAction(blockTarget.item, task, "blocked", details);
    }
    blockedRef.current?.close();
    setBlockTarget(null);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
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
      setData(parsed.data);
      setStorageLocked(false);
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
    if (
      !window.confirm(
        "현재 백업 파일을 먼저 저장한 뒤 빈 상태로 시작합니다. 계속할까요?",
      )
    ) {
      return;
    }
    downloadBackup(data);
    setData(createEmptyData());
    setStorageLocked(false);
    settingsRef.current?.close();
    setNotice("빈 상태로 시작했습니다.");
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
              오늘 {slotsLeft}자리 남음
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
                    plan?.status === "closing" ||
                    plan?.status === "closed"
                  }
                  onTomorrow={() =>
                    handleReviewAction(item, task, "tomorrow")
                  }
                  onLater={() => handleReviewAction(item, task, "later")}
                  onBlocked={() =>
                    openBlocked({ kind: "review", item })
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
    outcome: "pending" | "done",
    index: number,
  ) => {
    const isCurrent = plan?.currentTaskId === task.id;
    const pendingIndex = pendingItems.findIndex(
      (item) => item.taskId === task.id,
    );
    return (
      <article
        className={`promise-slot${isCurrent ? " is-current" : ""}${
          outcome === "done" ? " is-done" : ""
        }`}
        key={task.id}
      >
        <div className="promise-index">
          <span>{String(index + 1).padStart(2, "0")}</span>
          {isCurrent && <strong>현재 작업</strong>}
          {outcome === "done" && <strong>완료</strong>}
        </div>
        <div className="promise-copy">
          <h3>{task.title}</h3>
          <TaskMeta task={task} />
          {outcome === "pending" && (
            <TaskDetails
              task={task}
              onUpdate={(patch) => updateTaskDetails(task.id, patch)}
            />
          )}
        </div>
        {outcome === "pending" && plan && plan.status !== "closing" && (
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
                  pendingIndex < 0 || pendingIndex === pendingItems.length - 1
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
            {isCurrent && (
              <ActionRow
                onDone={() =>
                  handlePlannedAction(plan.date, task, "done")
                }
                onTomorrow={() =>
                  handlePlannedAction(plan.date, task, "tomorrow")
                }
                onLater={() =>
                  handlePlannedAction(plan.date, task, "later")
                }
                onBlocked={() =>
                  openBlocked({
                    kind: "planned",
                    taskId: task.id,
                    planDate: plan.date,
                  })
                }
                onDelete={() =>
                  handlePlannedAction(plan.date, task, "deleted")
                }
              />
            )}
            {!isCurrent && (
              <ActionRow
                compact
                onTomorrow={() =>
                  handlePlannedAction(plan.date, task, "tomorrow")
                }
                onLater={() =>
                  handlePlannedAction(plan.date, task, "later")
                }
                onBlocked={() =>
                  openBlocked({
                    kind: "planned",
                    taskId: task.id,
                    planDate: plan.date,
                  })
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
              각 항목을 완료하거나 내일·나중·막힘·삭제 중 하나로
              처리하세요.
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
                      handlePlannedAction(plan.date, task, "tomorrow")
                    }
                    onLater={() =>
                      handlePlannedAction(plan.date, task, "later")
                    }
                    onBlocked={() =>
                      openBlocked({
                        kind: "planned",
                        taskId: task.id,
                        planDate: plan.date,
                      })
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
          plan?.status === "closing" ||
          plan?.status === "closed"
        }
        onTomorrow={() => handleLooseAction(task, "tomorrow")}
        onLater={
          task.status === "inbox"
            ? () => handleLooseAction(task, "later")
            : undefined
        }
        onBlocked={() => openBlocked({ kind: "loose", taskId: task.id })}
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
    const promises = plan?.status !== "closing" && (
      <section className="promises" aria-labelledby="promises-title">
        <SectionHeader
          eyebrow="오늘"
          title={`할 일 ${committedItems.length}/3`}
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
          {committedItems.map((item, index) => {
            const task = getTask(data, item.taskId);
            if (!task) return null;
            return renderPromiseCard(
              task,
              item.outcome as "pending" | "done",
              index,
            );
          })}
          {Array.from({
            length: Math.max(0, 3 - committedItems.length),
          }).map((_, index) => (
            <EmptySlot
              key={index}
              index={committedItems.length + index + 1}
              onAdd={() => captureRef.current?.focus()}
            />
          ))}
        </div>
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

        {plan?.status !== "active" &&
          plan?.status !== "closing" &&
          reviewItems.length > 0 &&
          renderReview()}
        {renderClosing()}

        {plan?.status === "closed" && (
          <section className="closed-day">
            <div>
              <span>정리 완료</span>
              <strong>{planDone ?? 0}개 완료</strong>
            </div>
            <p>지금 추가하는 일은 수집함에 보관됩니다.</p>
          </section>
        )}

        {isPlanning && capture}
        {isPlanning && inbox}
        {promises}

        {(plan?.status === "active" || plan?.status === "closing") &&
          reviewItems.length > 0 &&
          renderReview()}

        {!isPlanning && capture}
        {!isPlanning && inbox}

        <details className="parked">
          <summary>
            <span>나중 및 막힘</span>
            <strong>{parkedTasks.length}</strong>
          </summary>
          <div className="parked-body">
            {parkedTasks.length ? (
              <div className="loose-list">
                {parkedTasks.map(renderLooseCard)}
              </div>
            ) : (
              <p className="empty-copy">보류 중인 일이 없습니다.</p>
            )}
          </div>
        </details>
      </main>
    );
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 바로가기
      </a>
      <header className="app-header">
        <a className="wordmark" href="/daymark/" aria-label="Daymark 홈">
          <span aria-hidden="true">D</span>
          Daymark
        </a>
        <div className="header-meta">
          <span className={storageLocked ? "save-state is-paused" : "save-state"}>
            {storageLocked ? "저장 멈춤" : "이 브라우저에 저장"}
          </span>
          <button
            type="button"
            onClick={() => settingsRef.current?.showModal()}
          >
            데이터
          </button>
        </div>
      </header>

      {renderWorkspace()}

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
            <strong>자동 저장이 멈춰 있습니다.</strong>
            <p>읽을 수 없는 원본을 보관하고 자동 저장을 중지했습니다.</p>
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
          <button type="button" onClick={() => importRef.current?.click()}>
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
        <button className="reset-button" type="button" onClick={resetToEmpty}>
          빈 상태로 시작
        </button>
      </dialog>

      <dialog
        className="dialog dialog--blocked"
        ref={blockedRef}
        onClose={() => setBlockTarget(null)}
      >
        <header>
          <div>
            <p>막힘</p>
            <h2>다시 볼 조건을 남기세요.</h2>
          </div>
          <button
            className="dialog-close"
            type="button"
            aria-label="닫기"
            onClick={() => blockedRef.current?.close()}
          >
            ×
          </button>
        </header>
        <form onSubmit={submitBlocked}>
          <label>
            막힌 이유
            <textarea
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="예: 견적 회신 대기"
              rows={3}
              required
              autoFocus
            />
          </label>
          <label>
            다시 볼 날짜
            <input
              type="date"
              value={blockReviewOn}
              min={shiftDate(today, 1)}
              onChange={(event) => setBlockReviewOn(event.target.value)}
              required
            />
          </label>
          <button
            className="primary-button"
            type="submit"
            disabled={!blockReason.trim() || blockReviewOn <= today}
          >
            막힌 일로 옮기기
          </button>
        </form>
      </dialog>
    </div>
  );
}

export default App;
