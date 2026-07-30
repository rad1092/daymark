import {
  addTaskToToday,
  chooseCurrentTask,
} from "../../lib/daymark";
import type { DailyPlan, DaymarkTask } from "../../types";
import type { CommitData } from "../useDaymarkStore";

interface UpNextProps {
  plan: DailyPlan;
  currentTaskId: string | null;
  tasks: DaymarkTask[];
  today: string;
  busy: boolean;
  commit: CommitData;
}

export function UpNext({
  plan,
  currentTaskId,
  tasks,
  today,
  busy,
  commit,
}: UpNextProps) {
  const remaining = tasks.filter((task) => task.id !== currentTaskId);
  if (plan.status !== "active" || remaining.length === 0) return null;
  return (
    <section className="up-next" aria-labelledby="next-heading">
      <h2 id="next-heading">다음 약속</h2>
      <ol>
        {remaining.map((task) => (
          <li key={task.id}>
            <span>{task.title}</span>
            <button
              type="button"
              onClick={() =>
                void commit((current) =>
                  chooseCurrentTask(current, task.id, today),
                )
              }
              disabled={busy}
            >
              지금 하기
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

interface InboxPanelProps {
  plan: DailyPlan | undefined;
  tasks: DaymarkTask[];
  commitmentCount: number;
  today: string;
  busy: boolean;
  commit: CommitData;
}

export function InboxPanel({
  plan,
  tasks,
  commitmentCount,
  today,
  busy,
  commit,
}: InboxPanelProps) {
  return (
    <section className="software-inbox" aria-labelledby="inbox-heading">
      <div className="inbox-heading">
        <h2 id="inbox-heading">수집함</h2>
        <span>{tasks.length}</span>
      </div>
      {tasks.length === 0 ? (
        <p>비어 있습니다.</p>
      ) : (
        <ul>
          {tasks.slice(0, 8).map((task) => (
            <li key={task.id}>
              <span>{task.title}</span>
              {(!plan || plan.status === "draft") &&
                commitmentCount < 3 && (
                  <button
                    type="button"
                    onClick={() =>
                      void commit((current) =>
                        addTaskToToday(current, task.id, today),
                      )
                    }
                    disabled={busy}
                  >
                    오늘
                  </button>
                )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
