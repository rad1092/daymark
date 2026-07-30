import { type FormEvent, useState } from "react";
import {
  actOnPlannedTask,
  shiftDate,
  updateTask,
} from "../../lib/daymark";
import type { DaymarkTask } from "../../types";
import type { CommitData } from "../useDaymarkStore";

interface CurrentCommitmentProps {
  task: DaymarkTask;
  planDate: string;
  today: string;
  busy: boolean;
  commit: CommitData;
}

export function CurrentCommitment({
  task,
  planDate,
  today,
  busy,
  commit,
}: CurrentCommitmentProps) {
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseNextStep, setPauseNextStep] = useState("");

  const complete = () => {
    setPauseOpen(false);
    void commit(
      (current) =>
        actOnPlannedTask(current, planDate, task.id, "done", today),
      "완료했습니다.",
    );
  };

  const pause = (event: FormEvent) => {
    event.preventDefault();
    const nextStep = pauseNextStep.trim();
    void commit(
      (current) =>
        actOnPlannedTask(
          current,
          planDate,
          task.id,
          "tomorrow",
          today,
          new Date(),
          { reviewOn: shiftDate(today, 1), nextStep },
        ),
      "내일 다시 볼 수 있게 시작점을 남겼습니다.",
    ).then((saved) => {
      if (saved) {
        setPauseOpen(false);
        setPauseNextStep("");
      }
    });
  };

  return (
    <section className="current-card" aria-labelledby="current-title">
      <p className="section-kicker">지금 할 일</p>
      <h1 id="current-title">{task.title}</h1>
      <label className="next-step-field">
        <span>다시 시작할 지점</span>
        <textarea
          key={`${task.id}:${task.nextStep}`}
          defaultValue={task.nextStep}
          placeholder="중단돼도 바로 이어갈 수 있게 한 줄로 적기"
          rows={2}
          onBlur={(event) => {
            const nextStep = event.target.value.trim();
            if (nextStep === task.nextStep) return;
            void commit((current) =>
              updateTask(current, task.id, { nextStep }),
            );
          }}
        />
      </label>
      <div className="current-actions">
        <button
          type="button"
          className="button-primary"
          onClick={complete}
          disabled={busy}
        >
          완료
        </button>
        <button
          type="button"
          onClick={() => {
            setPauseNextStep(task.nextStep);
            setPauseOpen((open) => !open);
          }}
          disabled={busy}
        >
          여기서 멈춤
        </button>
      </div>
      {pauseOpen && (
        <form className="pause-form" onSubmit={pause}>
          <label htmlFor="pause-next-step">내일 어디서 시작할까요?</label>
          <input
            id="pause-next-step"
            value={pauseNextStep}
            onChange={(event) => setPauseNextStep(event.target.value)}
            autoFocus
            placeholder="예: 검토 의견 3번부터 반영"
          />
          <div>
            <button type="button" onClick={() => setPauseOpen(false)}>
              취소
            </button>
            <button
              type="submit"
              className="button-primary"
              disabled={!pauseNextStep.trim() || busy}
            >
              시작점 남기기
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
