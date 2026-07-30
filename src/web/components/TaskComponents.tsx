import { type FormEvent, type ReactNode, useState } from "react";
import { formatMinutes, formatPlanDate } from "../../lib/daymark";
import type { DaymarkTask } from "../../types";

export function CaptureForm({
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
export function EstimateSelect({
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

export function TaskDetails({
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

export function ActionRow({
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

export function TaskMeta({ task }: { task: DaymarkTask }) {
  return (
    <div className="task-meta">
      <span>{formatMinutes(task.estimateMinutes)}</span>
      {task.reviewOn && <span>{formatPlanDate(task.reviewOn)} 다시 보기</span>}
      {task.blockedReason && <span>막힘: {task.blockedReason}</span>}
      {task.nextStep && <span>다음: {task.nextStep}</span>}
    </div>
  );
}

export function EmptySlot({
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

export function SectionHeader({
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
