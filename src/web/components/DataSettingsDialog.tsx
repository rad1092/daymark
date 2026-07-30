import type { ChangeEvent, RefObject } from "react";
import type {
  DaymarkData,
  DaymarkSnapshot,
} from "../../types";
import type { PersistenceState } from "../types";

export interface DataSettingsViewModel {
  data: DaymarkData;
  snapshots: DaymarkSnapshot[];
  storageLocked: boolean;
  recoveryNeeded: boolean;
  savedAt: string;
  persistenceState: PersistenceState;
  isStandalone: boolean;
  installAvailable: boolean;
}

export interface DataSettingsActions {
  onClose: () => void;
  onConfirmRecovery: () => void;
  onDownloadRecovery: () => void;
  onDownloadBackup: () => void;
  onImportBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  onRequestPersistentStorage: () => void;
  onRestoreSnapshot: (snapshot: DaymarkSnapshot) => void;
  onInstall: () => void;
  onReset: () => void;
}

interface DataSettingsDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>;
  importRef: RefObject<HTMLInputElement | null>;
  viewModel: DataSettingsViewModel;
  actions: DataSettingsActions;
}

function formatSavedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "저장됨";
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatSnapshotTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function DataSettingsDialog({
  dialogRef,
  importRef,
  viewModel,
  actions,
}: DataSettingsDialogProps) {
  const {
    data,
    snapshots,
    storageLocked,
    recoveryNeeded,
    savedAt,
    persistenceState,
    isStandalone,
    installAvailable,
  } = viewModel;
  return (
    <dialog className="dialog" ref={dialogRef}>
      <header>
        <div>
          <p>데이터</p>
          <h2>백업과 복원</h2>
        </div>
        <button
          className="dialog-close"
          type="button"
          aria-label="닫기"
          onClick={actions.onClose}
        >
          ×
        </button>
      </header>
      <p className="dialog-intro">
        할 일과 하루 기록은 이 브라우저에 저장됩니다. 기기를 바꾸기 전에
        백업 파일을 받아 두세요.
      </p>
      {storageLocked && (
        <div className="storage-warning">
          <strong>
            {recoveryNeeded
              ? "마지막 정상 백업을 열었습니다."
              : "자동 저장이 멈춰 있습니다."}
          </strong>
          <p>
            {recoveryNeeded
              ? "내용을 확인한 뒤 이 백업을 저장 데이터로 확정해 주세요. 손상된 원본은 별도로 보관합니다."
              : "읽을 수 없는 원본을 보관하고 자동 저장을 중지했습니다."}
          </p>
          {recoveryNeeded && (
            <button type="button" onClick={actions.onConfirmRecovery}>
              이 백업으로 복구
            </button>
          )}
          <button type="button" onClick={actions.onDownloadRecovery}>
            원본 복구 파일 내려받기
          </button>
        </div>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={actions.onDownloadBackup}>
          <strong>백업 파일 받기</strong>
          <span>
            {data.tasks.filter((task) => task.status !== "deleted").length}개 할
            일 · {data.plans.length}일 기록
          </span>
        </button>
        <button
          type="button"
          onClick={() => importRef.current?.click()}
          disabled={recoveryNeeded}
        >
          <strong>백업 파일 가져오기</strong>
          <span>이전 버전의 백업도 열 수 있습니다.</span>
        </button>
        <input
          ref={importRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={actions.onImportBackup}
        />
      </div>
      <section className="data-status">
        <div>
          <strong>저장 상태</strong>
          <span>
            {storageLocked
              ? recoveryNeeded
                ? "백업 확인 필요"
                : "저장 멈춤"
              : `마지막 저장 ${formatSavedTime(savedAt)}`}
          </span>
        </div>
        {persistenceState !== "persistent" &&
          persistenceState !== "unsupported" && (
            <button
              type="button"
              onClick={actions.onRequestPersistentStorage}
            >
              이 기기에서 유지
            </button>
          )}
        {persistenceState === "persistent" && <span>지속 저장 사용 중</span>}
      </section>
      <section className="snapshot-list">
        <header>
          <strong>복구 지점</strong>
          <span>{snapshots.length}개</span>
        </header>
        {snapshots.length ? (
          <ol>
            {snapshots.slice(0, 5).map((snapshot) => (
              <li key={snapshot.id}>
                <div>
                  <strong>{snapshot.label}</strong>
                  <time dateTime={snapshot.createdAt}>
                    {formatSnapshotTime(snapshot.createdAt)}
                  </time>
                </div>
                <button
                  type="button"
                  disabled={recoveryNeeded}
                  onClick={() => actions.onRestoreSnapshot(snapshot)}
                >
                  복원
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p>상태를 바꾸면 복구 지점이 생깁니다.</p>
        )}
      </section>
      <section className="install-panel">
        <header>
          <strong>웹 데모를 홈 화면에 추가</strong>
          <span>{isStandalone ? "추가됨" : "브라우저에서 사용 중"}</span>
        </header>
        {installAvailable && !isStandalone && (
          <button type="button" onClick={actions.onInstall}>
            홈 화면에 추가
          </button>
        )}
        <p>
          iPhone·iPad는 Safari의 공유 메뉴에서 홈 화면에 추가합니다. 설치 앱은
          Safari와 저장 공간이 다릅니다. 이 홈 화면 버전은 웹 데모이며,
          데스크톱용 Daymark 소프트웨어와도 저장 공간을 공유하지 않습니다.
        </p>
      </section>
      <button
        className="reset-button"
        type="button"
        onClick={actions.onReset}
        disabled={recoveryNeeded}
      >
        빈 상태로 시작
      </button>
    </dialog>
  );
}
