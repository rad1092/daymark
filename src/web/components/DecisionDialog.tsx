import type { RefObject } from "react";
import { formatPlanDate, shiftDate } from "../../lib/daymark";
import type {
  DecisionDialogActions,
  DecisionDialogViewModel,
} from "../types";

interface DecisionDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  viewModel: DecisionDialogViewModel;
  actions: DecisionDialogActions;
}

export function DecisionDialog({
  dialogRef,
  viewModel,
  actions,
}: DecisionDialogProps) {
  const { mode, today, reason, nextStep, reviewOn } = viewModel;
  return (
    <dialog
      className="dialog dialog--blocked"
      ref={dialogRef}
      onClose={actions.close}
    >
      <header>
        <div>
          <p>
            {mode === "blocked"
              ? "막힘"
              : mode === "tomorrow"
                ? "내일"
                : "날짜 지정"}
          </p>
          <h2>다음 시작점을 남기세요.</h2>
        </div>
        <button
          className="dialog-close"
          type="button"
          aria-label="닫기"
          onClick={() => dialogRef.current?.close()}
        >
          ×
        </button>
      </header>
      <form onSubmit={actions.submit}>
        {mode === "blocked" && (
          <label>
            막힌 이유
            <textarea
              value={reason}
              onChange={(event) => actions.setReason(event.target.value)}
              placeholder="예: 견적 회신 대기"
              rows={2}
              required
            />
          </label>
        )}
        <label>
          다음 행동
          <input
            value={nextStep}
            onChange={(event) => actions.setNextStep(event.target.value)}
            placeholder="예: 회신에서 금액 확인"
            required
            autoFocus
          />
        </label>
        {mode === "tomorrow" ? (
          <p className="decision-date">
            {formatPlanDate(shiftDate(today, 1))}에 다시 표시
          </p>
        ) : (
          <label>
            다시 볼 날짜
            <input
              type="date"
              value={reviewOn}
              min={shiftDate(today, 1)}
              onChange={(event) => actions.setReviewOn(event.target.value)}
              required
            />
          </label>
        )}
        <button
          className="primary-button"
          type="submit"
          disabled={
            !nextStep.trim() ||
            (mode === "blocked" && !reason.trim()) ||
            (mode !== "tomorrow" && reviewOn <= today)
          }
        >
          {mode === "blocked"
            ? "막힘으로 저장"
            : mode === "tomorrow"
              ? "내일 보기"
              : "날짜 저장"}
        </button>
      </form>
    </dialog>
  );
}
