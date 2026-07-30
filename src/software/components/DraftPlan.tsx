import {
  removeTaskFromToday,
  startPlan,
} from "../../lib/daymark";
import type { DaymarkTask } from "../../types";
import type { CommitData } from "../useDaymarkStore";

interface DraftPlanProps {
  tasks: DaymarkTask[];
  today: string;
  busy: boolean;
  commit: CommitData;
}

export function DraftPlan({
  tasks,
  today,
  busy,
  commit,
}: DraftPlanProps) {
  return (
    <section className="plan-card" aria-labelledby="plan-title">
      <div className="plan-heading">
        <div>
          <p className="section-kicker">시작 전</p>
          <h1 id="plan-title">오늘 끝낼 약속</h1>
        </div>
        <span>{tasks.length} / 3</span>
      </div>
      {tasks.length === 0 ? (
        <p className="plan-empty">
          수집함에서 오늘 끝낼 일을 최대 세 개 고르세요.
        </p>
      ) : (
        <ol className="commitment-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              <button
                type="button"
                onClick={() =>
                  void commit((current) =>
                    removeTaskFromToday(current, task.id, today),
                  )
                }
                aria-label={`${task.title} 오늘 약속에서 빼기`}
                disabled={busy}
              >
                빼기
              </button>
            </li>
          ))}
        </ol>
      )}
      <button
        className="button-primary button-wide"
        type="button"
        onClick={() =>
          void commit(
            (current) => startPlan(current, today),
            "오늘의 순서를 고정했습니다.",
          )
        }
        disabled={tasks.length === 0 || busy}
      >
        이 순서로 시작
      </button>
    </section>
  );
}
