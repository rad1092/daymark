import { formatLongDate } from "../../lib/daymark";
import type { DaymarkPlatform } from "../../platform/platform";

interface SoftwareHeaderProps {
  platform: DaymarkPlatform;
  desktopWindowControls: boolean;
  alwaysOnTop: boolean;
  settingsOpen: boolean;
  onToggleAlwaysOnTop: () => void;
  onToggleSettings: () => void;
}

export function SoftwareHeader({
  platform,
  desktopWindowControls,
  alwaysOnTop,
  settingsOpen,
  onToggleAlwaysOnTop,
  onToggleSettings,
}: SoftwareHeaderProps) {
  return (
    <header className="software-titlebar">
      <div>
        <div className="software-wordmark">
          <span className="software-mark" aria-hidden="true" />
          <strong>Daymark</strong>
        </div>
        <p>{formatLongDate()}</p>
      </div>
      <div className="titlebar-actions">
        {desktopWindowControls && (
          <button
            className={alwaysOnTop ? "icon-button is-active" : "icon-button"}
            type="button"
            onClick={onToggleAlwaysOnTop}
            aria-label={alwaysOnTop ? "항상 위 해제" : "항상 위에 두기"}
            title={alwaysOnTop ? "항상 위 해제" : "항상 위에 두기"}
          >
            ⌖
          </button>
        )}
        <button
          className="icon-button"
          type="button"
          onClick={onToggleSettings}
          aria-expanded={settingsOpen}
          aria-label="설정"
        >
          •••
        </button>
        {desktopWindowControls && (
          <button
            className="icon-button"
            type="button"
            onClick={() => void platform.hideWindow()}
            aria-label="창 숨기기"
          >
            —
          </button>
        )}
      </div>
    </header>
  );
}
