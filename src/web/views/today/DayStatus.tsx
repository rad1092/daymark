import {
  formatLongDate,
  formatMinutes,
  reopenDay,
} from "../../../lib/daymark";
import type {
  DailyPlan,
  DaymarkTask,
} from "../../../types";
import { OUTCOME_LABELS } from "../../constants";
import type { TodayViewActions } from "./types";

interface DayHeadingProps {
  plan: DailyPlan | undefined;
  commitmentTasks: DaymarkTask[];
  estimatedTasks: DaymarkTask[];
  estimatedMinutes: number;
}

export function DayHeading({
  plan,
  commitmentTasks,
  estimatedTasks,
  estimatedMinutes,
}: DayHeadingProps) {
  const headline =
    plan?.status === "closed"
      ? "오늘 정리 완료"
      : plan?.status === "closing"
        ? "오늘 정리"
        : "오늘 할 일";
  const planState =
    plan?.status === "active"
      ? "진행 중"
      : plan?.status === "closing"
        ? "정리 중"
        : plan?.status === "closed"
          ? "정리 완료"
          : plan
            ? "시작 전"
            : "계획 전";
  return (
    <section className="day-heading">
      <div>
        <p>{formatLongDate()}</p>
        <h1>{headline}</h1>
      </div>
      <div className="day-facts">
        <p>
          상태 <strong>{planState}</strong>
        </p>
        <p>
          {commitmentTasks.length === 0
            ? "오늘 0/3 선택"
            : estimatedTasks.length === 0
              ? `${commitmentTasks.length}개 · 시간 미정`
              : `${commitmentTasks.length}개 중 ${estimatedTasks.length}개 입력 · ${formatMinutes(
                  estimatedMinutes,
                )}`}
        </p>
      </div>
    </section>
  );
}

interface ClosedDayReceiptProps {
  plan: DailyPlan;
  today: string;
  actions: Pick<TodayViewActions, "commit">;
}

export function ClosedDayReceipt({
  plan,
  today,
  actions,
}: ClosedDayReceiptProps) {
  const doneCount = plan.items.filter(
    (item) => item.outcome === "done",
  ).length;
  return (
    <section className="closed-day closed-receipt">
      <header>
        <div>
          <span>정리 완료</span>
          <strong>{doneCount}개 완료</strong>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={() =>
            actions.commit(
              (current) => reopenDay(current, today),
              "오늘 계획을 다시 열었습니다.",
              "오늘 다시 열기 전",
            )
          }
        >
          오늘 다시 열기
        </button>
      </header>
      {plan.receipt && (
        <ol>
          {plan.receipt.items.map((item) => (
            <li key={item.taskId}>
              <div>
                <strong>{item.title}</strong>
                {item.nextStep && <p>{item.nextStep}</p>}
              </div>
              <span>{OUTCOME_LABELS[item.outcome] ?? item.outcome}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
