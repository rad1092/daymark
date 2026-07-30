import {
  addTaskToToday,
  getCommittedCount,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkTask,
} from "../../../types";
import {
  ActionRow,
  SectionHeader,
  TaskDetails,
  TaskMeta,
} from "../../components/TaskComponents";
import type { TodayViewActions } from "./types";

interface LooseTaskListProps {
  tasks: DaymarkTask[];
  today: string;
  plan: DailyPlan | undefined;
  actions: Pick<
    TodayViewActions,
    | "commit"
    | "updateTaskDetails"
    | "handleLooseAction"
    | "openDecision"
  >;
}

function LooseTaskList({
  tasks,
  today,
  plan,
  actions,
}: LooseTaskListProps) {
  return (
    <div className="loose-list">
      {tasks.map((task) => (
        <article className="loose-card" key={task.id}>
          <div className="loose-copy">
            <h3>{task.title}</h3>
            <TaskMeta task={task} />
            <TaskDetails
              task={task}
              onUpdate={(patch) =>
                actions.updateTaskDetails(task.id, patch)
              }
            />
          </div>
          <ActionRow
            compact
            onToday={() =>
              actions.commit(
                (current) => addTaskToToday(current, task.id, today),
                "오늘 할 일에 넣었습니다. 아래에서 순서를 확인하고 시작하세요.",
              )
            }
            todayDisabled={
              getCommittedCount(plan) >= 3 ||
              plan?.status === "active" ||
              plan?.status === "closing" ||
              plan?.status === "closed"
            }
            onTomorrow={() =>
              actions.openDecision(
                { kind: "loose", taskId: task.id },
                "tomorrow",
                task,
              )
            }
            onSchedule={() =>
              actions.openDecision(
                { kind: "loose", taskId: task.id },
                "schedule",
                task,
              )
            }
            onBlocked={() =>
              actions.openDecision(
                { kind: "loose", taskId: task.id },
                "blocked",
                task,
              )
            }
            onDelete={() => actions.handleLooseAction(task, "deleted")}
          />
        </article>
      ))}
    </div>
  );
}

interface TaskCollectionViewModel {
  tasks: DaymarkTask[];
  today: string;
  plan: DailyPlan | undefined;
}

interface TaskCollectionProps {
  viewModel: TaskCollectionViewModel;
  actions: LooseTaskListProps["actions"];
}

export function InboxSection({
  viewModel,
  actions,
}: TaskCollectionProps) {
  const { tasks, today, plan } = viewModel;
  return (
    <section className="inbox" aria-labelledby="inbox-title">
      <SectionHeader
        eyebrow="수집함"
        title="분류를 기다리는 일"
        titleId="inbox-title"
        aside={<span className="count-badge">{tasks.length}</span>}
      />
      {tasks.length ? (
        <LooseTaskList
          tasks={tasks}
          today={today}
          plan={plan}
          actions={actions}
        />
      ) : (
        <p className="empty-copy">수집함이 비었습니다.</p>
      )}
    </section>
  );
}

export function ParkedSection({
  viewModel,
  actions,
}: TaskCollectionProps) {
  const { tasks, today, plan } = viewModel;
  return (
    <details className="parked">
      <summary>
        <span>예정 및 막힘</span>
        <strong>{tasks.length}</strong>
      </summary>
      <div className="parked-body">
        {tasks.length ? (
          <LooseTaskList
            tasks={tasks}
            today={today}
            plan={plan}
            actions={actions}
          />
        ) : (
          <p className="empty-copy">기다리는 일이 없습니다.</p>
        )}
      </div>
    </details>
  );
}
