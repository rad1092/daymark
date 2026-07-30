import type { RefObject } from "react";
import type {
  DailyPlan,
  DaymarkData,
  DaymarkTask,
  PlanItem,
  ReviewItem,
} from "../../../types";
import type {
  DecisionMode,
  DecisionTarget,
  DemoCommit,
  TaskActionHandlers,
} from "../../types";

export interface TodayViewModel {
  data: DaymarkData;
  today: string;
  plan: DailyPlan | undefined;
  reviewItems: ReviewItem[];
  pendingItems: PlanItem[];
  committedItems: PlanItem[];
  executionItems: PlanItem[];
  inboxTasks: DaymarkTask[];
  parkedTasks: DaymarkTask[];
  commitmentTasks: DaymarkTask[];
  estimatedTasks: DaymarkTask[];
  estimatedMinutes: number;
  hasStorageConflict: boolean;
}

export interface TodayViewActions extends TaskActionHandlers {
  captureRef: RefObject<HTMLInputElement | null>;
  commit: DemoCommit;
  reloadExternalData: () => void;
  openDecision: (
    target: DecisionTarget,
    mode: DecisionMode,
    task: DaymarkTask,
  ) => void;
}

export interface TodayViewProps {
  viewModel: TodayViewModel;
  actions: TodayViewActions;
}
