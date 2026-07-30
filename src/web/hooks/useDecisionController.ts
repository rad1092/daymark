import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getTask,
  localDateKey,
  shiftDate,
} from "../../lib/daymark";
import type {
  BlockedDetails,
  DaymarkData,
  DaymarkTask,
  DeferredDetails,
} from "../../types";
import type {
  DecisionDialogActions,
  DecisionDialogViewModel,
  DecisionMode,
  DecisionTarget,
  TaskActionHandlers,
} from "../types";

interface UseDecisionControllerOptions {
  data: DaymarkData;
  today: string;
  taskActions: TaskActionHandlers;
}

export interface DecisionController {
  dialogRef: RefObject<HTMLDialogElement | null>;
  viewModel: DecisionDialogViewModel;
  dialogActions: DecisionDialogActions;
  open: (
    target: DecisionTarget,
    mode: DecisionMode,
    task: DaymarkTask,
  ) => void;
}

export function useDecisionController({
  data,
  today,
  taskActions,
}: UseDecisionControllerOptions): DecisionController {
  const [target, setTarget] = useState<DecisionTarget | null>(null);
  const [mode, setMode] = useState<DecisionMode>("tomorrow");
  const [reason, setReason] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [reviewOn, setReviewOn] = useState(() =>
    shiftDate(localDateKey(), 1),
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (target && !dialogRef.current?.open) {
      dialogRef.current?.showModal();
    }
  }, [target]);

  const open = (
    nextTarget: DecisionTarget,
    nextMode: DecisionMode,
    task: DaymarkTask,
  ) => {
    setTarget(nextTarget);
    setMode(nextMode);
    setReason(task.blockedReason ?? "");
    setNextStep(task.nextStep);
    setReviewOn(shiftDate(today, 1));
  };

  const close = () => {
    dialogRef.current?.close();
    setTarget(null);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    const action: "tomorrow" | "later" | "blocked" =
      mode === "schedule" ? "later" : mode;
    const details: DeferredDetails | BlockedDetails =
      action === "blocked"
        ? { reason, reviewOn, nextStep }
        : {
            reviewOn: action === "tomorrow" ? shiftDate(today, 1) : reviewOn,
            nextStep,
          };
    const task = getTask(
      data,
      target.kind === "review" ? target.item.taskId : target.taskId,
    );
    if (!task) return;
    if (target.kind === "planned") {
      taskActions.handlePlannedAction(
        target.planDate,
        task,
        action,
        details,
      );
    } else if (target.kind === "loose") {
      taskActions.handleLooseAction(task, action, details);
    } else {
      taskActions.handleReviewAction(target.item, task, action, details);
    }
    close();
  };

  return {
    dialogRef,
    viewModel: { mode, today, reason, nextStep, reviewOn },
    dialogActions: {
      setReason,
      setNextStep,
      setReviewOn,
      submit,
      close: () => setTarget(null),
    },
    open,
  };
}
