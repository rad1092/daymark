import {
  getTask,
  startPlan,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkData,
  PlanItem,
} from "../../../types";
import {
  EmptySlot,
  SectionHeader,
} from "../../components/TaskComponents";
import { CommitmentCard } from "./CommitmentCard";
import type { TodayViewActions } from "./types";

export interface CommitmentPlanViewModel {
  data: DaymarkData;
  today: string;
  plan: DailyPlan | undefined;
  committedItems: PlanItem[];
  pendingItems: PlanItem[];
}

interface CommitmentPlanProps {
  viewModel: CommitmentPlanViewModel;
  actions: Pick<
    TodayViewActions,
    | "captureRef"
    | "commit"
    | "updateTaskDetails"
    | "handlePlannedAction"
    | "openDecision"
  >;
}

export function CommitmentPlan({
  viewModel,
  actions,
}: CommitmentPlanProps) {
  const { data, today, plan, committedItems, pendingItems } = viewModel;
  return (
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
                actions.commit(
                  (current) => startPlan(current, today),
                  "오늘 계획을 시작했습니다.",
                  "오늘 시작 전",
                )
              }
            >
              이 순서로 시작
            </button>
          ) : null
        }
      />
      <div className="promise-list">
        {plan?.status === "draft" &&
          committedItems.map((item, index) => {
            const task = getTask(data, item.taskId);
            if (!task) return null;
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
        {Array.from({
          length: Math.max(0, 3 - committedItems.length),
        }).map((_, index) => (
          <EmptySlot
            key={index}
            index={committedItems.length + index + 1}
            onAdd={() => actions.captureRef.current?.focus()}
          />
        ))}
      </div>
    </section>
  );
}
