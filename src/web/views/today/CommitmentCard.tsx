import {
  chooseCurrentTask,
  removeTaskFromToday,
  reorderPendingTask,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkTask,
  PlanItem,
} from "../../../types";
import {
  ActionRow,
  TaskDetails,
  TaskMeta,
} from "../../components/TaskComponents";
import type { TodayViewActions } from "./types";

interface CommitmentCardViewModel {
  task: DaymarkTask;
  index: number;
  today: string;
  plan: DailyPlan;
  pendingItems: PlanItem[];
}

interface CommitmentCardProps {
  viewModel: CommitmentCardViewModel;
  actions: Pick<
    TodayViewActions,
    | "commit"
    | "updateTaskDetails"
    | "handlePlannedAction"
    | "openDecision"
  >;
}

export function CommitmentCard({
  viewModel,
  actions,
}: CommitmentCardProps) {
  const { task, index, today, plan, pendingItems } = viewModel;
  const isCurrent = plan.currentTaskId === task.id;
  const pendingIndex = pendingItems.findIndex(
    (item) => item.taskId === task.id,
  );
  return (
    <article
      className={`promise-slot${isCurrent ? " is-current" : ""}`}
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
                actions.updateTaskDetails(task.id, {
                  nextStep: event.target.value,
                })
              }
              placeholder="끝내려면 지금 무엇을 해야 하나요?"
            />
          </label>
        )}
        <TaskDetails
          task={task}
          onUpdate={(patch) => actions.updateTaskDetails(task.id, patch)}
        />
      </div>
      {plan.status !== "closing" && (
        <div className="promise-controls">
          {plan.status === "active" && !isCurrent && (
            <button
              className="small-primary"
              type="button"
              onClick={() =>
                actions.commit((current) =>
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
                  actions.commit((current) =>
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
                  actions.commit((current) =>
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
                actions.commit(
                  (current) =>
                    removeTaskFromToday(current, task.id, today),
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
                actions.handlePlannedAction(plan.date, task, "done")
              }
              onTomorrow={() =>
                actions.openDecision(
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
                actions.openDecision(
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
                actions.openDecision(
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
                actions.handlePlannedAction(plan.date, task, "deleted")
              }
            />
          )}
        </div>
      )}
    </article>
  );
}
