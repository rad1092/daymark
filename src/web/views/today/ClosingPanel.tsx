import {
  closeDay,
  getTask,
  resumeDay,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkData,
  PlanItem,
} from "../../../types";
import {
  ActionRow,
  SectionHeader,
  TaskMeta,
} from "../../components/TaskComponents";
import type { TodayViewActions } from "./types";

interface ClosingPanelViewModel {
  data: DaymarkData;
  today: string;
  plan: DailyPlan;
  pendingItems: PlanItem[];
}

interface ClosingPanelProps {
  viewModel: ClosingPanelViewModel;
  actions: Pick<
    TodayViewActions,
    "commit" | "handlePlannedAction" | "openDecision"
  >;
}

export function ClosingPanel({
  viewModel,
  actions,
}: ClosingPanelProps) {
  const { data, today, plan, pendingItems } = viewModel;
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
              actions.commit((current) => resumeDay(current, today))
            }
          >
            계속 일하기
          </button>
        }
      />
      {pendingItems.length ? (
        <div className="closing-list">
          <p>끝내지 못한 일에는 다시 볼 날짜와 다음 행동을 남기세요.</p>
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
                    actions.handlePlannedAction(
                      plan.date,
                      task,
                      "deleted",
                    )
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
              actions.commit(
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
}
