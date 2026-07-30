import {
  formatPlanDate,
  getCommittedCount,
  getTask,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkData,
  ReviewItem,
} from "../../../types";
import {
  ActionRow,
  SectionHeader,
  TaskMeta,
} from "../../components/TaskComponents";
import type { TodayViewActions } from "./types";

export interface ReviewPanelViewModel {
  data: DaymarkData;
  today: string;
  plan: DailyPlan | undefined;
  items: ReviewItem[];
}

interface ReviewPanelProps {
  viewModel: ReviewPanelViewModel;
  actions: Pick<
    TodayViewActions,
    "handleReviewAction" | "openDecision"
  >;
}

export function ReviewPanel({
  viewModel,
  actions,
}: ReviewPanelProps) {
  const { data, today, plan, items } = viewModel;
  const slotsLeft = Math.max(0, 3 - getCommittedCount(plan));
  return (
    <section className="review-panel" aria-labelledby="review-title">
      <SectionHeader
        eyebrow="검토"
        title={`처리할 일 ${items.length}개`}
        titleId="review-title"
        aside={
          <span className="review-capacity">
            {plan?.status === "draft" || !plan
              ? `오늘 ${slotsLeft}자리 남음`
              : "오늘 계획 확정"}
          </span>
        }
      />
      <div className="review-list" aria-label="다시 결정할 일">
        {items.map((item) => {
          const task = getTask(data, item.taskId);
          if (!task) return null;
          return (
            <article
              className="review-card"
              key={`${item.source}-${item.taskId}`}
            >
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
                onDone={() =>
                  actions.handleReviewAction(item, task, "done")
                }
                onToday={() =>
                  actions.handleReviewAction(item, task, "today")
                }
                todayDisabled={
                  slotsLeft === 0 ||
                  plan?.status === "active" ||
                  plan?.status === "closing" ||
                  plan?.status === "closed"
                }
                onTomorrow={() =>
                  actions.openDecision(
                    { kind: "review", item },
                    "tomorrow",
                    task,
                  )
                }
                onSchedule={() =>
                  actions.openDecision(
                    { kind: "review", item },
                    "schedule",
                    task,
                  )
                }
                onBlocked={() =>
                  actions.openDecision(
                    { kind: "review", item },
                    "blocked",
                    task,
                  )
                }
                onDelete={() =>
                  actions.handleReviewAction(item, task, "deleted")
                }
              />
            </article>
          );
        })}
      </div>
    </section>
  );
}
