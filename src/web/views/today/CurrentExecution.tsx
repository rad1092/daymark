import {
  beginDayClose,
  getTask,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkData,
  PlanItem,
} from "../../../types";
import { SectionHeader } from "../../components/TaskComponents";
import { OUTCOME_LABELS } from "../../constants";
import { CommitmentCard } from "./CommitmentCard";
import type { TodayViewActions } from "./types";

export interface CurrentExecutionViewModel {
  data: DaymarkData;
  today: string;
  plan: DailyPlan;
  committedItems: PlanItem[];
  executionItems: PlanItem[];
  pendingItems: PlanItem[];
}

interface CurrentExecutionProps {
  viewModel: CurrentExecutionViewModel;
  actions: Pick<
    TodayViewActions,
    | "commit"
    | "updateTaskDetails"
    | "handlePlannedAction"
    | "openDecision"
  >;
}

export function CurrentExecution({
  viewModel,
  actions,
}: CurrentExecutionProps) {
  const {
    data,
    today,
    plan,
    committedItems,
    executionItems,
    pendingItems,
  } = viewModel;
  return (
    <section className="promises" aria-labelledby="promises-title">
      <SectionHeader
        eyebrow="실행"
        title={`현재 작업과 다음 ${Math.max(0, executionItems.length - 1)}개`}
        titleId="promises-title"
        aside={
          <button
            className="secondary-button"
            type="button"
            onClick={() =>
              actions.commit((current) => beginDayClose(current, today))
            }
          >
            하루 정리
          </button>
        }
      />
      <div className="promise-list">
        {executionItems.map((item) => {
          const task = getTask(data, item.taskId);
          if (!task) return null;
          const index = committedItems.findIndex(
            (candidate) => candidate.taskId === item.taskId,
          );
          return (
            <CommitmentCard
              key={task.id}
              viewModel={{
                task,
                index,
                today,
                plan,
                pendingItems,
              }}
              actions={actions}
            />
          );
        })}
      </div>
      {committedItems.some((item) => item.outcome !== "pending") && (
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
}
