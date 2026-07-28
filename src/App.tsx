import {
  type CSSProperties,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BACKUP_KEY,
  STORAGE_KEY,
  createDemoData,
  createEmptyData,
  createId,
  createTask,
  extractCapture,
  formatClock,
  formatLongDate,
  formatShortDate,
  loadStoredData,
  localDateKey,
  matchesTask,
  parseDaymarkData,
  saveStoredData,
  weeklySummary,
} from "./lib/daymark";
import type {
  ActiveFocus,
  DaymarkData,
  DaymarkTask,
  TaskStatus,
  ViewName,
} from "./types";

const NAV_ITEMS: Array<{
  id: ViewName;
  label: string;
  shortLabel: string;
  shortcut: string;
}> = [
  { id: "today", label: "오늘", shortLabel: "오늘", shortcut: "1" },
  { id: "inbox", label: "수집함", shortLabel: "수집", shortcut: "2" },
  { id: "week", label: "주간", shortLabel: "주간", shortcut: "3" },
  { id: "log", label: "기록", shortLabel: "기록", shortcut: "4" },
];

const DURATION_OPTIONS = [15, 25, 30, 45, 60, 90];

function normalizeTopRanks(tasks: DaymarkTask[]): DaymarkTask[] {
  const orderedIds = tasks
    .filter((task) => task.status === "today" && task.isTop3)
    .sort((a, b) => (a.top3Rank ?? 99) - (b.top3Rank ?? 99))
    .map((task) => task.id);
  return tasks.map((task) => {
    const index = orderedIds.indexOf(task.id);
    return index >= 0 ? { ...task, top3Rank: index + 1 } : task;
  });
}

interface InitialState {
  data: DaymarkData;
  notice: string;
}

function getInitialState(): InitialState {
  if (typeof window === "undefined") {
    return { data: createDemoData(), notice: "" };
  }
  try {
    const stored = loadStoredData(window.localStorage);
    return {
      data: stored.data ?? createDemoData(),
      notice: stored.issue ?? "",
    };
  } catch {
    return {
      data: createDemoData(),
      notice: "이 브라우저에서는 저장소를 열 수 없어 임시 모드로 시작합니다.",
    };
  }
}

function remainingForFocus(focus: ActiveFocus, now: number): number {
  if (focus.mode === "paused" || !focus.endAt) {
    return Math.max(0, focus.remainingSeconds);
  }
  return Math.max(
    0,
    Math.ceil((new Date(focus.endAt).getTime() - now) / 1000),
  );
}

function formatTimer(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function downloadJson(data: DaymarkData): void {
  const payload: DaymarkData = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `daymark-backup-${localDateKey()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

interface QuickCaptureProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onCapture: (value: string) => void;
  compact?: boolean;
}

function QuickCapture({
  inputRef,
  onCapture,
  compact = false,
}: QuickCaptureProps) {
  const [value, setValue] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!value.trim()) return;
    onCapture(value);
    setValue("");
  };

  return (
    <form
      className={`quick-capture${compact ? " quick-capture--compact" : ""}`}
      onSubmit={submit}
    >
      <span className="capture-mark" aria-hidden="true">
        +
      </span>
      <label className="sr-only" htmlFor={compact ? "capture-compact" : "capture"}>
        수집함에 할 일 추가
      </label>
      <input
        id={compact ? "capture-compact" : "capture"}
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="떠오른 일을 바로 적으세요. #태그도 가능"
        autoComplete="off"
      />
      <button type="submit" disabled={!value.trim()}>
        수집
        <kbd>↵</kbd>
      </button>
    </form>
  );
}

interface TaskCardProps {
  task: DaymarkTask;
  top3Count: number;
  onComplete: (id: string) => void;
  onMoveToday: (id: string) => void;
  onRestore: (id: string) => void;
  onToggleTop: (id: string) => void;
  onReorderTop: (id: string, direction: -1 | 1) => void;
  onStartFocus: (task: DaymarkTask) => void;
  onUpdate: (id: string, patch: Partial<DaymarkTask>) => void;
  onDelete: (id: string) => void;
}

function TaskCard({
  task,
  top3Count,
  onComplete,
  onMoveToday,
  onRestore,
  onToggleTop,
  onReorderTop,
  onStartFocus,
  onUpdate,
  onDelete,
}: TaskCardProps) {
  const isDone = task.status === "done";
  const isToday = task.status === "today";

  return (
    <article
      className={`task-card${task.isTop3 ? " task-card--top" : ""}${
        isDone ? " task-card--done" : ""
      }`}
    >
      <div className="task-card__main">
        {isDone ? (
          <span className="task-check task-check--done" aria-hidden="true">
            ✓
          </span>
        ) : (
          <button
            className="task-check"
            type="button"
            onClick={() => onComplete(task.id)}
            aria-label={`${task.title} 완료`}
          >
            <span aria-hidden="true" />
          </button>
        )}
        <div className="task-copy">
          <h3>{task.title}</h3>
          <div className="task-meta">
            {task.scheduledTime && <span>{task.scheduledTime}</span>}
            <span>{task.durationMinutes}분</span>
            {task.tags.map((tag) => (
              <span className="tag" key={tag}>
                #{tag}
              </span>
            ))}
            {isDone && task.completedAt && (
              <span>{formatShortDate(localDateKey(new Date(task.completedAt)))}</span>
            )}
          </div>
        </div>
      </div>

      <div className="task-actions">
        {isDone ? (
          <button type="button" onClick={() => onRestore(task.id)}>
            다시 열기
          </button>
        ) : isToday ? (
          <>
            <button type="button" onClick={() => onStartFocus(task)}>
              집중
            </button>
            <button
              type="button"
              className={task.isTop3 ? "is-active" : ""}
              onClick={() => onToggleTop(task.id)}
              disabled={!task.isTop3 && top3Count >= 3}
              aria-pressed={task.isTop3}
              title={
                !task.isTop3 && top3Count >= 3
                  ? "핵심 3개가 이미 찼습니다."
                  : undefined
              }
            >
              {task.isTop3 ? "핵심 해제" : "핵심 지정"}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onMoveToday(task.id)}>
            오늘로
          </button>
        )}

        <details className="task-more">
          <summary aria-label={`${task.title} 세부 설정`}>•••</summary>
          <div className="task-more__panel">
            {!isDone && (
              <>
                <label>
                  메모
                  <textarea
                    value={task.notes}
                    onChange={(event) =>
                      onUpdate(task.id, { notes: event.target.value })
                    }
                    placeholder="맥락이나 다음 행동을 적어 두세요."
                    rows={3}
                  />
                </label>
                {isToday && (
                  <div className="schedule-fields">
                    <label>
                      시작
                      <input
                        type="time"
                        value={task.scheduledTime ?? ""}
                        onChange={(event) =>
                          onUpdate(task.id, {
                            scheduledTime: event.target.value || null,
                          })
                        }
                      />
                    </label>
                    <label>
                      길이
                      <select
                        value={task.durationMinutes}
                        onChange={(event) =>
                          onUpdate(task.id, {
                            durationMinutes: Number(event.target.value),
                          })
                        }
                      >
                        {DURATION_OPTIONS.map((duration) => (
                          <option value={duration} key={duration}>
                            {duration}분
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                {task.isTop3 && (
                  <div className="reorder-controls" aria-label="핵심 순서 변경">
                    <button
                      type="button"
                      onClick={() => onReorderTop(task.id, -1)}
                      disabled={task.top3Rank === 1}
                    >
                      위로
                    </button>
                    <button
                      type="button"
                      onClick={() => onReorderTop(task.id, 1)}
                      disabled={task.top3Rank === top3Count}
                    >
                      아래로
                    </button>
                  </div>
                )}
              </>
            )}
            <button
              className="danger-link"
              type="button"
              onClick={() => onDelete(task.id)}
            >
              삭제
            </button>
          </div>
        </details>
      </div>
    </article>
  );
}

interface FocusDockProps {
  activeFocus: ActiveFocus | null;
  tasks: DaymarkTask[];
  nowTick: number;
  defaultMinutes: number;
  onStart: (task: DaymarkTask | null, minutes: number) => void;
  onPause: () => void;
  onResume: () => void;
  onFinish: () => void;
  onCancel: () => void;
}

function FocusDock({
  activeFocus,
  tasks,
  nowTick,
  defaultMinutes,
  onStart,
  onPause,
  onResume,
  onFinish,
  onCancel,
}: FocusDockProps) {
  const [taskId, setTaskId] = useState("");
  const [minutes, setMinutes] = useState(defaultMinutes);
  const remaining = activeFocus
    ? remainingForFocus(activeFocus, nowTick)
    : minutes * 60;
  const progress = activeFocus
    ? Math.max(
        0,
        Math.min(
          100,
          100 -
            (remaining / Math.max(1, activeFocus.durationMinutes * 60)) * 100,
        ),
      )
    : 0;
  const selectedTask =
    tasks.find((task) => task.id === taskId) ?? tasks[0] ?? null;

  return (
    <section className="focus-dock" aria-labelledby="focus-heading">
      <div className="section-kicker">
        <span>집중 세션</span>
        <span className="signal-dot" aria-hidden="true" />
      </div>
      <h2 id="focus-heading">
        {activeFocus ? activeFocus.taskTitle : "한 번에 하나만."}
      </h2>
      <div
        className="focus-clock"
        style={{ "--progress": `${progress * 3.6}deg` } as CSSProperties}
        aria-label={`남은 시간 ${formatTimer(remaining)}`}
      >
        <div>
          <strong aria-hidden="true">{formatTimer(remaining)}</strong>
          <span>
            {activeFocus
              ? activeFocus.mode === "paused"
                ? "잠시 멈춤"
                : "집중 중"
              : "준비됨"}
          </span>
        </div>
      </div>

      {!activeFocus ? (
        <div className="focus-setup">
          <label>
            집중할 일
            <select
              value={selectedTask?.id ?? ""}
              onChange={(event) => setTaskId(event.target.value)}
            >
              <option value="">할 일 없이 집중</option>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <fieldset>
            <legend>세션 길이</legend>
            <div className="duration-pills">
              {[15, 25, 45, 60].map((duration) => (
                <button
                  key={duration}
                  type="button"
                  className={minutes === duration ? "is-active" : ""}
                  onClick={() => setMinutes(duration)}
                  aria-pressed={minutes === duration}
                >
                  {duration}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            className="primary-button primary-button--dark"
            type="button"
            onClick={() => onStart(selectedTask, minutes)}
          >
            세션 시작
          </button>
        </div>
      ) : (
        <div className="focus-controls">
          {activeFocus.mode === "running" ? (
            <button type="button" onClick={onPause}>
              일시정지
            </button>
          ) : (
            <button type="button" onClick={onResume}>
              계속하기
            </button>
          )}
          <button className="primary-button" type="button" onClick={onFinish}>
            세션 마치기
          </button>
          <button className="text-button" type="button" onClick={onCancel}>
            기록 없이 취소
          </button>
        </div>
      )}
    </section>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-state__mark" aria-hidden="true">
        /
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
      {actionLabel && onAction && (
        <button className="primary-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function App() {
  const [initial] = useState(getInitialState);
  const [data, setData] = useState<DaymarkData>(initial.data);
  const [view, setViewState] = useState<ViewName>(
    initial.data.preferences.lastView,
  );
  const [notice, setNotice] = useState(initial.notice);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [nowTick, setNowTick] = useState(() => new Date().getTime());
  const captureRef = useRef<HTMLInputElement>(null);
  const headerSearchRef = useRef<HTMLInputElement>(null);
  const logSearchRef = useRef<HTMLInputElement>(null);
  const settingsDialogRef = useRef<HTMLDialogElement>(null);
  const shortcutsDialogRef = useRef<HTMLDialogElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const today = localDateKey();

  const updateData = useCallback(
    (updater: (current: DaymarkData) => DaymarkData) => {
      setData((current) => ({
        ...updater(current),
        updatedAt: new Date().toISOString(),
      }));
    },
    [],
  );

  useEffect(() => {
    try {
      saveStoredData(window.localStorage, data);
    } catch {
      const timeout = window.setTimeout(() => {
        setNotice(
          "브라우저 저장 공간에 쓸 수 없습니다. 지금 작업을 JSON으로 백업해 주세요.",
        );
      }, 0);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [data]);

  const finishFocus = useCallback(
    (automatic = false) => {
      updateData((current) => {
        const focus = current.activeFocus;
        if (!focus) return current;
        const remaining = remainingForFocus(focus, Date.now());
        const elapsedSeconds = Math.max(
          60,
          focus.durationMinutes * 60 - remaining,
        );
        const minutes = automatic
          ? focus.durationMinutes
          : Math.max(1, Math.round(elapsedSeconds / 60));
        return {
          ...current,
          activeFocus: null,
          focusRecords: [
            {
              id: createId("focus"),
              taskId: focus.taskId,
              taskTitle: focus.taskTitle,
              startedAt: focus.startedAt,
              endedAt: new Date().toISOString(),
              minutes,
            },
            ...current.focusRecords,
          ],
        };
      });
      setNotice(automatic ? "집중 세션을 완주했습니다." : "집중 기록을 저장했습니다.");
    },
    [updateData],
  );

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentTime = new Date().getTime();
      setNowTick(currentTime);
      if (
        data.activeFocus?.mode === "running" &&
        remainingForFocus(data.activeFocus, currentTime) <= 0
      ) {
        finishFocus(true);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [data.activeFocus, finishFocus]);

  const setView = useCallback(
    (nextView: ViewName) => {
      setViewState(nextView);
      updateData((current) => ({
        ...current,
        preferences: { ...current.preferences, lastView: nextView },
      }));
    },
    [updateData],
  );

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (event.key === "Escape") {
        settingsDialogRef.current?.close();
        shortcutsDialogRef.current?.close();
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLocaleLowerCase() === "c") {
        event.preventDefault();
        captureRef.current?.focus();
      } else if (event.key === "/") {
        event.preventDefault();
        setView("log");
        window.requestAnimationFrame(() => logSearchRef.current?.focus());
      } else if (event.key === "?") {
        event.preventDefault();
        shortcutsDialogRef.current?.showModal();
      } else {
        const item = NAV_ITEMS.find((nav) => nav.shortcut === event.key);
        if (item) setView(item.id);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [setView]);

  const todayTasks = useMemo(
    () =>
      data.tasks.filter(
        (task) =>
          task.status === "today" &&
          (!task.scheduledDate || task.scheduledDate === today),
      ),
    [data.tasks, today],
  );
  const topTasks = useMemo(
    () =>
      todayTasks
        .filter((task) => task.isTop3)
        .sort((a, b) => (a.top3Rank ?? 99) - (b.top3Rank ?? 99)),
    [todayTasks],
  );
  const timelineTasks = useMemo(
    () =>
      todayTasks
        .filter((task) => !task.isTop3)
        .sort((a, b) =>
          (a.scheduledTime ?? "99:99").localeCompare(
            b.scheduledTime ?? "99:99",
          ),
        ),
    [todayTasks],
  );
  const inboxTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => task.status === "inbox")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.tasks],
  );
  const completedTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => task.status === "done")
        .sort((a, b) =>
          (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
        ),
    [data.tasks],
  );
  const summary = useMemo(
    () => weeklySummary(data.tasks, data.focusRecords),
    [data.focusRecords, data.tasks],
  );
  const allTags = useMemo(
    () =>
      Array.from(new Set(data.tasks.flatMap((task) => task.tags))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [data.tasks],
  );
  const filteredTasks = useMemo(
    () =>
      data.tasks
        .filter((task) => matchesTask(task, query, statusFilter, tagFilter))
        .sort((a, b) => {
          if (a.status === "done" && b.status !== "done") return 1;
          if (a.status !== "done" && b.status === "done") return -1;
          return b.createdAt.localeCompare(a.createdAt);
        }),
    [data.tasks, query, statusFilter, tagFilter],
  );

  const captureTask = (raw: string) => {
    const captured = extractCapture(raw);
    if (!captured.title) {
      setNotice("할 일 제목을 함께 적어 주세요.");
      return;
    }
    updateData((current) => ({
      ...current,
      tasks: [
        createTask(captured.title, { tags: captured.tags }),
        ...current.tasks,
      ],
    }));
    setNotice(`“${captured.title}”을 수집함에 넣었습니다.`);
  };

  const updateTask = (id: string, patch: Partial<DaymarkTask>) => {
    updateData((current) => ({
      ...current,
      tasks: current.tasks.map((task) =>
        task.id === id ? { ...task, ...patch } : task,
      ),
    }));
  };

  const completeTask = (id: string) => {
    updateData((current) => ({
      ...current,
      tasks: normalizeTopRanks(
        current.tasks.map((task) =>
          task.id === id
            ? {
                ...task,
                status: "done",
                completedAt: new Date().toISOString(),
                isTop3: false,
                top3Rank: null,
              }
            : task,
        ),
      ),
    }));
    setNotice("완료 기록에 남겼습니다.");
  };

  const moveToday = (id: string) => {
    updateTask(id, {
      status: "today",
      scheduledDate: today,
      completedAt: null,
    });
    setNotice("오늘 계획으로 옮겼습니다.");
  };

  const restoreTask = (id: string) => {
    updateTask(id, {
      status: "today",
      completedAt: null,
      scheduledDate: today,
    });
    setNotice("오늘 할 일로 다시 열었습니다.");
  };

  const toggleTop = (id: string) => {
    const target = data.tasks.find((task) => task.id === id);
    if (!target) return;
    if (!target.isTop3 && topTasks.length >= 3) {
      setNotice("핵심 3개가 이미 찼습니다. 하나를 해제한 뒤 지정하세요.");
      return;
    }
    updateData((current) => {
      const currentTop = current.tasks
        .filter((task) => task.status === "today" && task.isTop3)
        .sort((a, b) => (a.top3Rank ?? 99) - (b.top3Rank ?? 99));
      const remaining = target.isTop3
        ? currentTop.filter((task) => task.id !== id)
        : currentTop;
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          if (task.id === id) {
            return {
              ...task,
              isTop3: !target.isTop3,
              top3Rank: target.isTop3 ? null : remaining.length + 1,
            };
          }
          const newRank = remaining.findIndex((item) => item.id === task.id);
          return newRank >= 0 ? { ...task, top3Rank: newRank + 1 } : task;
        }),
      };
    });
  };

  const reorderTop = (id: string, direction: -1 | 1) => {
    updateData((current) => {
      const ordered = current.tasks
        .filter((task) => task.status === "today" && task.isTop3)
        .sort((a, b) => (a.top3Rank ?? 99) - (b.top3Rank ?? 99));
      const index = ordered.findIndex((task) => task.id === id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) {
        return current;
      }
      [ordered[index], ordered[nextIndex]] = [
        ordered[nextIndex],
        ordered[index],
      ];
      return {
        ...current,
        tasks: current.tasks.map((task) => {
          const rank = ordered.findIndex((item) => item.id === task.id);
          return rank >= 0 ? { ...task, top3Rank: rank + 1 } : task;
        }),
      };
    });
  };

  const deleteTask = (id: string) => {
    const task = data.tasks.find((item) => item.id === id);
    if (!task || !window.confirm(`“${task.title}”을 삭제할까요?`)) return;
    updateData((current) => ({
      ...current,
      tasks: normalizeTopRanks(
        current.tasks.filter((item) => item.id !== id),
      ),
      activeFocus:
        current.activeFocus?.taskId === id ? null : current.activeFocus,
    }));
    setNotice("할 일을 삭제했습니다.");
  };

  const startFocus = (task: DaymarkTask | null, minutes: number) => {
    if (data.activeFocus) {
      setNotice("진행 중인 집중 세션을 먼저 마쳐 주세요.");
      return;
    }
    const startedAt = new Date();
    const duration = Math.max(5, Math.min(120, minutes));
    updateData((current) => ({
      ...current,
      activeFocus: {
        taskId: task?.id ?? null,
        taskTitle: task?.title ?? "자유 집중",
        durationMinutes: duration,
        startedAt: startedAt.toISOString(),
        mode: "running",
        endAt: new Date(startedAt.getTime() + duration * 60_000).toISOString(),
        remainingSeconds: duration * 60,
      },
    }));
    setNowTick(Date.now());
    setNotice(`${duration}분 집중 세션을 시작했습니다.`);
  };

  const pauseFocus = () => {
    updateData((current) => {
      if (!current.activeFocus) return current;
      return {
        ...current,
        activeFocus: {
          ...current.activeFocus,
          mode: "paused",
          remainingSeconds: remainingForFocus(
            current.activeFocus,
            Date.now(),
          ),
          endAt: null,
        },
      };
    });
  };

  const resumeFocus = () => {
    updateData((current) => {
      if (!current.activeFocus) return current;
      return {
        ...current,
        activeFocus: {
          ...current.activeFocus,
          mode: "running",
          endAt: new Date(
            Date.now() + current.activeFocus.remainingSeconds * 1000,
          ).toISOString(),
        },
      };
    });
  };

  const cancelFocus = () => {
    if (!window.confirm("이 집중 세션을 기록 없이 취소할까요?")) return;
    updateData((current) => ({ ...current, activeFocus: null }));
    setNotice("집중 세션을 취소했습니다.");
  };

  const startFocusFromTask = (task: DaymarkTask) => {
    startFocus(task, data.preferences.defaultFocusMinutes);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imported = parseDaymarkData(await file.text());
      if (!window.confirm("현재 데이터를 백업 파일로 바꿀까요?")) return;
      setData(imported);
      setViewState(imported.preferences.lastView);
      settingsDialogRef.current?.close();
      setNotice("백업을 복원했습니다.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "백업을 복원하지 못했습니다.",
      );
    }
  };

  const loadDemo = () => {
    if (!window.confirm("현재 데이터를 데모 데이터로 바꿀까요?")) return;
    const demo = createDemoData();
    setData(demo);
    setViewState("today");
    settingsDialogRef.current?.close();
    setNotice("데모 데이터를 불러왔습니다.");
  };

  const resetData = () => {
    if (
      !window.confirm(
        "모든 할 일과 집중 기록을 지울까요? 먼저 JSON 백업을 권장합니다.",
      )
    ) {
      return;
    }
    const empty = createEmptyData();
    setData(empty);
    setViewState("today");
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(BACKUP_KEY);
    } catch {
      // State is still cleared for this session.
    }
    settingsDialogRef.current?.close();
    setNotice("빈 플래너로 초기화했습니다.");
  };

  const taskCardProps = {
    top3Count: topTasks.length,
    onComplete: completeTask,
    onMoveToday: moveToday,
    onRestore: restoreTask,
    onToggleTop: toggleTop,
    onReorderTop: reorderTop,
    onStartFocus: startFocusFromTask,
    onUpdate: updateTask,
    onDelete: deleteTask,
  };

  const renderToday = () => {
    if (data.tasks.length === 0) {
      return (
        <>
          <div className="page-heading">
            <div>
              <p className="eyebrow">{formatLongDate()}</p>
              <h1>오늘의 표시를 남겨요.</h1>
            </div>
          </div>
          <QuickCapture inputRef={captureRef} onCapture={captureTask} />
          <EmptyState
            title="아직 아무것도 없어요."
            body="떠오른 일을 수집하거나 데모 데이터를 불러와 Daymark의 흐름을 살펴보세요."
            actionLabel="데모 데이터 불러오기"
            onAction={loadDemo}
          />
        </>
      );
    }

    return (
      <>
        <div className="page-heading page-heading--today">
          <div>
            <p className="eyebrow">{formatLongDate()}</p>
            <h1>
              해야 할 것보다
              <br />
              <em>끝낼 것</em>을 봅니다.
            </h1>
          </div>
          <div className="today-score" aria-label="오늘 진행 상황">
            <span>오늘 완료</span>
            <strong>
              {
                completedTasks.filter(
                  (task) =>
                    task.completedAt &&
                    localDateKey(new Date(task.completedAt)) === today,
                ).length
              }
            </strong>
          </div>
        </div>
        <QuickCapture inputRef={captureRef} onCapture={captureTask} />

        <div className="today-layout">
          <div className="day-plan">
            <section className="plan-section" aria-labelledby="top-three-heading">
              <div className="section-heading">
                <div>
                  <span className="section-number">01</span>
                  <h2 id="top-three-heading">오늘의 핵심 3개</h2>
                </div>
                <p>{topTasks.length}/3 선택</p>
              </div>
              {topTasks.length ? (
                <div className="task-list task-list--top">
                  {topTasks.map((task, index) => (
                    <div className="numbered-task" key={task.id}>
                      <span className="numbered-task__index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <TaskCard task={task} {...taskCardProps} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  오늘 할 일에서 ‘핵심 지정’을 눌러 가장 중요한 일을 고르세요.
                </div>
              )}
            </section>

            <section className="plan-section" aria-labelledby="timeline-heading">
              <div className="section-heading">
                <div>
                  <span className="section-number">02</span>
                  <h2 id="timeline-heading">나머지 시간 블록</h2>
                </div>
                <p>시간은 세부 설정에서 지정</p>
              </div>
              {timelineTasks.length ? (
                <div className="task-list">
                  {timelineTasks.map((task) => (
                    <TaskCard key={task.id} task={task} {...taskCardProps} />
                  ))}
                </div>
              ) : (
                <div className="inline-empty">
                  여유가 있습니다. 수집함에서 오늘 할 일을 가져오세요.
                </div>
              )}
            </section>
          </div>

          <aside className="today-aside">
            <FocusDock
              activeFocus={data.activeFocus}
              tasks={todayTasks}
              nowTick={nowTick}
              defaultMinutes={data.preferences.defaultFocusMinutes}
              onStart={startFocus}
              onPause={pauseFocus}
              onResume={resumeFocus}
              onFinish={() => finishFocus(false)}
              onCancel={cancelFocus}
            />
            <section className="inbox-peek" aria-labelledby="inbox-peek-heading">
              <div className="section-heading section-heading--small">
                <h2 id="inbox-peek-heading">수집함</h2>
                <button type="button" onClick={() => setView("inbox")}>
                  모두 보기
                </button>
              </div>
              {inboxTasks.length ? (
                <ul>
                  {inboxTasks.slice(0, 4).map((task) => (
                    <li key={task.id}>
                      <button type="button" onClick={() => moveToday(task.id)}>
                        <span>{task.title}</span>
                        <span aria-hidden="true">→</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small-empty">수집함이 비었습니다.</p>
              )}
            </section>
          </aside>
        </div>
      </>
    );
  };

  const renderInbox = () => (
    <>
      <div className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">머릿속을 비우는 곳</p>
          <h1>수집함</h1>
        </div>
        <p className="heading-note">
          판단은 나중에. 지금은 적어 두기만 하세요.
        </p>
      </div>
      <QuickCapture inputRef={captureRef} onCapture={captureTask} />
      <section className="collection-section">
        <div className="section-heading">
          <div>
            <span className="section-number">IN</span>
            <h2>정리할 항목</h2>
          </div>
          <p>{inboxTasks.length}개 대기</p>
        </div>
        {inboxTasks.length ? (
          <div className="task-list">
            {inboxTasks.map((task) => (
              <TaskCard key={task.id} task={task} {...taskCardProps} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="수집함이 깨끗합니다."
            body="새로운 생각이 생기면 C 키를 눌러 어느 화면에서든 바로 적으세요."
          />
        )}
      </section>
    </>
  );

  const renderWeek = () => {
    const maxValue = Math.max(
      1,
      ...summary.days.map((day) =>
        Math.max(day.focusMinutes / 15, day.completed),
      ),
    );
    const recentRecords = [...data.focusRecords]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 5);
    return (
      <>
        <div className="page-heading page-heading--compact">
          <div>
            <p className="eyebrow">이번 주 리듬</p>
            <h1>속도보다 흔적.</h1>
          </div>
          <p className="heading-note">
            완료와 집중 기록만으로 흐름을 가볍게 돌아봅니다.
          </p>
        </div>
        <section className="summary-grid" aria-label="주간 핵심 지표">
          <article>
            <span>완료</span>
            <strong>{summary.completed}</strong>
            <small>이번 주 끝낸 일</small>
          </article>
          <article>
            <span>집중</span>
            <strong>{summary.focusMinutes}</strong>
            <small>기록된 분</small>
          </article>
          <article>
            <span>활동일</span>
            <strong>{summary.activeDays}</strong>
            <small>7일 중</small>
          </article>
          <article>
            <span>주요 태그</span>
            <strong className="summary-tag">
              {summary.topTag ? `#${summary.topTag}` : "—"}
            </strong>
            <small>가장 많이 끝낸 주제</small>
          </article>
        </section>

        <section className="week-chart" aria-labelledby="week-chart-heading">
          <div className="section-heading">
            <div>
              <span className="section-number">07</span>
              <h2 id="week-chart-heading">일주일의 밀도</h2>
            </div>
            <div className="chart-legend">
              <span><i className="legend-focus" /> 집중 15분</span>
              <span><i className="legend-done" /> 완료 1개</span>
            </div>
          </div>
          <div className="bar-chart">
            {summary.days.map((day) => (
              <div
                className={`bar-day${day.date === today ? " is-today" : ""}`}
                key={day.date}
              >
                <div
                  className="bars"
                  aria-label={`${formatShortDate(day.date)}: 완료 ${
                    day.completed
                  }개, 집중 ${day.focusMinutes}분`}
                >
                  <span
                    className="bar bar--focus"
                    style={{
                      height: `${Math.max(
                        4,
                        (day.focusMinutes / 15 / maxValue) * 100,
                      )}%`,
                    }}
                  />
                  <span
                    className="bar bar--done"
                    style={{
                      height: `${Math.max(
                        4,
                        (day.completed / maxValue) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <strong>{day.label}</strong>
                <small>{day.focusMinutes ? `${day.focusMinutes}m` : "—"}</small>
              </div>
            ))}
          </div>
        </section>

        <div className="week-details">
          <section aria-labelledby="completed-week-heading">
            <div className="section-heading section-heading--small">
              <h2 id="completed-week-heading">최근 완료</h2>
              <button type="button" onClick={() => setView("log")}>
                전체 기록
              </button>
            </div>
            {completedTasks.length ? (
              <ol className="activity-list">
                {completedTasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <span>{task.title}</span>
                    <time dateTime={task.completedAt ?? undefined}>
                      {task.completedAt
                        ? formatShortDate(localDateKey(new Date(task.completedAt)))
                        : "—"}
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="small-empty">이번 주 완료 기록이 없습니다.</p>
            )}
          </section>
          <section aria-labelledby="focus-week-heading">
            <div className="section-heading section-heading--small">
              <h2 id="focus-week-heading">집중 로그</h2>
            </div>
            {recentRecords.length ? (
              <ol className="activity-list">
                {recentRecords.map((record) => (
                  <li key={record.id}>
                    <span>{record.taskTitle}</span>
                    <time dateTime={record.startedAt}>
                      {formatClock(record.startedAt)} · {record.minutes}분
                    </time>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="small-empty">아직 집중 기록이 없습니다.</p>
            )}
          </section>
        </div>
      </>
    );
  };

  const renderLog = () => (
    <>
      <div className="page-heading page-heading--compact">
        <div>
          <p className="eyebrow">찾고, 돌아보고, 다시 쓰기</p>
          <h1>기록</h1>
        </div>
        <p className="heading-note">할 일의 제목, 메모, 태그를 모두 검색합니다.</p>
      </div>
      <section className="filter-panel" aria-label="기록 검색과 필터">
        <label className="search-field">
          <span className="sr-only">기록 검색</span>
          <span aria-hidden="true">/</span>
          <input
            ref={logSearchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="기록 검색"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")}>
              지우기
            </button>
          )}
        </label>
        <div className="filter-row">
          <label>
            상태
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "all" | TaskStatus)
              }
            >
              <option value="all">전체</option>
              <option value="inbox">수집함</option>
              <option value="today">오늘</option>
              <option value="done">완료</option>
            </select>
          </label>
          <label>
            태그
            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="">모든 태그</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          </label>
          <span>{filteredTasks.length}개 결과</span>
        </div>
      </section>
      <section className="collection-section">
        {filteredTasks.length ? (
          <div className="task-list">
            {filteredTasks.map((task) => (
              <TaskCard key={task.id} task={task} {...taskCardProps} />
            ))}
          </div>
        ) : (
          <EmptyState
            title="조건에 맞는 기록이 없습니다."
            body="검색어를 줄이거나 상태·태그 필터를 바꿔 보세요."
          />
        )}
      </section>
    </>
  );

  const viewContent = {
    today: renderToday,
    inbox: renderInbox,
    week: renderWeek,
    log: renderLog,
  }[view]();

  const handleSearchKey = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && query.trim()) {
      setView("log");
    }
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <header className="app-header">
        <button
          className="wordmark"
          type="button"
          onClick={() => setView("today")}
          aria-label="Daymark 오늘 화면"
        >
          <span className="wordmark-mark" aria-hidden="true">
            D
          </span>
          <span>Daymark</span>
        </button>
        <label className="header-search">
          <span aria-hidden="true">/</span>
          <span className="sr-only">전체 기록 검색</span>
          <input
            ref={headerSearchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (view !== "log") setView("log");
            }}
            onFocus={() => {
              if (view !== "log") setView("log");
            }}
            onKeyDown={handleSearchKey}
            placeholder="기록 검색"
          />
        </label>
        <div className="header-actions">
          <span className="local-badge" title="데이터는 이 기기에만 저장됩니다.">
            <i aria-hidden="true" />
            기기 저장
          </span>
          <button
            className="icon-button"
            type="button"
            onClick={() => shortcutsDialogRef.current?.showModal()}
            aria-label="키보드 단축키"
          >
            ?
          </button>
          <button
            className="settings-button"
            type="button"
            onClick={() => settingsDialogRef.current?.showModal()}
          >
            데이터
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="side-nav">
          <nav aria-label="주요 화면">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={view === item.id ? "is-active" : ""}
                onClick={() => setView(item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <span>{item.label}</span>
                <kbd>{item.shortcut}</kbd>
                {item.id === "inbox" && inboxTasks.length > 0 && (
                  <strong>{inboxTasks.length}</strong>
                )}
              </button>
            ))}
          </nav>
          <div className="side-note">
            <p>오늘의 문장</p>
            <blockquote>“계획은 시간을 채우는 일이 아니라, 주의를 지키는 일.”</blockquote>
          </div>
          <button
            className="shortcut-hint"
            type="button"
            onClick={() => shortcutsDialogRef.current?.showModal()}
          >
            <kbd>?</kbd>
            단축키 보기
          </button>
        </aside>

        <main id="main-content" className="main-content" tabIndex={-1}>
          {viewContent}
        </main>
      </div>

      <nav className="mobile-nav" aria-label="모바일 주요 화면">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "is-active" : ""}
            onClick={() => setView(item.id)}
            aria-current={view === item.id ? "page" : undefined}
          >
            <span aria-hidden="true">
              {item.id === "today"
                ? "○"
                : item.id === "inbox"
                  ? "+"
                  : item.id === "week"
                    ? "▥"
                    : "≡"}
            </span>
            {item.shortLabel}
          </button>
        ))}
      </nav>

      <div className="live-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className="toast">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")}>
              닫기
            </button>
          </div>
        )}
      </div>

      <dialog className="modal" ref={settingsDialogRef}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">내 데이터</p>
            <h2>백업과 복원</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => settingsDialogRef.current?.close()}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <p className="modal-intro">
          Daymark는 서버나 계정 없이 이 브라우저에만 저장됩니다. 기기를 바꾸기
          전에는 JSON 백업을 내려받으세요.
        </p>
        <div className="data-actions">
          <button type="button" onClick={() => downloadJson(data)}>
            <strong>JSON 백업 내려받기</strong>
            <span>{data.tasks.length}개 할 일 · {data.focusRecords.length}개 집중 기록</span>
          </button>
          <button type="button" onClick={() => importRef.current?.click()}>
            <strong>JSON 백업 복원</strong>
            <span>내보낸 Daymark 파일만 불러옵니다.</span>
          </button>
          <input
            ref={importRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={importBackup}
          />
        </div>
        <div className="modal-divider" />
        <div className="secondary-actions">
          <button type="button" onClick={loadDemo}>
            데모 데이터 불러오기
          </button>
          <button className="danger-button" type="button" onClick={resetData}>
            빈 플래너로 초기화
          </button>
        </div>
        <form method="dialog">
          <button className="primary-button primary-button--wide" type="submit">
            완료
          </button>
        </form>
      </dialog>

      <dialog className="modal modal--shortcuts" ref={shortcutsDialogRef}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">키보드</p>
            <h2>손을 떼지 않고</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => shortcutsDialogRef.current?.close()}
            aria-label="닫기"
          >
            ×
          </button>
        </div>
        <dl className="shortcut-list">
          <div><dt><kbd>C</kbd></dt><dd>빠른 수집으로 이동</dd></div>
          <div><dt><kbd>/</kbd></dt><dd>전체 기록 검색</dd></div>
          <div><dt><kbd>1–4</kbd></dt><dd>화면 전환</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>이 도움말 열기</dd></div>
          <div><dt><kbd>Esc</kbd></dt><dd>창 닫기</dd></div>
        </dl>
        <form method="dialog">
          <button className="primary-button primary-button--wide" type="submit">
            확인
          </button>
        </form>
      </dialog>
    </div>
  );
}

export default App;
