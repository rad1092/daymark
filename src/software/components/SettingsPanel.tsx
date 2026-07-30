import { useRef } from "react";
import {
  adoptImportedData,
  localDateKey,
  parseBackupData,
} from "../../lib/daymark";
import type { DaymarkRuntime } from "../../runtime/createRuntime";
import type { DaymarkData } from "../../types";
import {
  errorMessage,
  type CommitData,
} from "../useDaymarkStore";

interface SettingsPanelProps {
  runtime: DaymarkRuntime;
  data: DaymarkData;
  launchAtLogin: boolean;
  launchAtLoginSupported: boolean;
  onToggleLaunchAtLogin: () => void;
  onNotice: (message: string) => void;
  commit: CommitData;
}

export function SettingsPanel({
  runtime,
  data,
  launchAtLogin,
  launchAtLoginSupported,
  onToggleLaunchAtLogin,
  onNotice,
  commit,
}: SettingsPanelProps) {
  const importRef = useRef<HTMLInputElement>(null);

  const importBackup = async (file: File) => {
    try {
      const imported = parseBackupData(file ? await file.text() : "").data;
      await runtime.repository.createBackup(data, "가져오기 전");
      await commit(
        (current) => adoptImportedData(current, imported),
        "백업을 가져왔습니다.",
      );
    } catch (error) {
      onNotice(errorMessage(error));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const createBackup = async () => {
    try {
      await runtime.repository.createBackup(
        data,
        `수동 백업 ${localDateKey()}`,
      );
      onNotice("로컬 백업을 만들었습니다.");
    } catch (error) {
      onNotice(errorMessage(error));
    }
  };

  return (
    <section className="software-settings" aria-label="설정">
      <div className="settings-row">
        <div>
          <strong>로그인할 때 실행</strong>
          <span>Daymark를 바로 불러올 수 있게 준비합니다.</span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={launchAtLogin}
          className={launchAtLogin ? "switch is-on" : "switch"}
          onClick={onToggleLaunchAtLogin}
          disabled={!launchAtLoginSupported}
        >
          <span />
        </button>
      </div>
      <div className="settings-actions">
        <button type="button" onClick={() => void createBackup()}>
          지금 백업
        </button>
        <button type="button" onClick={() => importRef.current?.click()}>
          JSON 가져오기
        </button>
        <input
          ref={importRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importBackup(file);
          }}
        />
      </div>
      <p className="storage-label">
        {runtime.repository.kind === "native-sqlite"
          ? "앱 전용 SQLite · 변경 전 자동 백업"
          : "미리보기 전용 브라우저 저장소"}
      </p>
    </section>
  );
}
