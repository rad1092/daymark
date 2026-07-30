import type {
  BlockedDetails,
  DaymarkData,
  DaymarkTask,
  DeferredDetails,
  ReviewItem,
  TaskAction,
} from "../types";
import type { FormEvent } from "react";

export type DecisionTarget =
  | { kind: "planned"; taskId: string; planDate: string }
  | { kind: "loose"; taskId: string }
  | { kind: "review"; item: ReviewItem };

export type DecisionMode = "tomorrow" | "schedule" | "blocked";

export type PersistenceState =
  | "checking"
  | "persistent"
  | "best-effort"
  | "unsupported";

export type DemoCommit = (
  operation: (current: DaymarkData) => DaymarkData,
  success?: string,
  undoLabel?: string,
) => void;

export type TaskDetailsPatch = Pick<
  Partial<DaymarkTask>,
  "title" | "notes" | "nextStep" | "estimateMinutes"
>;

export interface TaskActionHandlers {
  updateTaskDetails: (taskId: string, patch: TaskDetailsPatch) => void;
  handlePlannedAction: (
    planDate: string,
    task: DaymarkTask,
    action: TaskAction,
    details?: BlockedDetails | DeferredDetails,
  ) => void;
  handleLooseAction: (
    task: DaymarkTask,
    action: Exclude<TaskAction, "done">,
    details?: BlockedDetails | DeferredDetails,
  ) => void;
  handleReviewAction: (
    item: ReviewItem,
    task: DaymarkTask,
    action: TaskAction | "today",
    details?: BlockedDetails | DeferredDetails,
  ) => void;
}

export interface DecisionDialogViewModel {
  mode: DecisionMode;
  today: string;
  reason: string;
  nextStep: string;
  reviewOn: string;
}

export interface DecisionDialogActions {
  setReason: (reason: string) => void;
  setNextStep: (nextStep: string) => void;
  setReviewOn: (reviewOn: string) => void;
  submit: (event: FormEvent) => void;
  close: () => void;
}
