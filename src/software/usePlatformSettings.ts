import { useCallback, useEffect, useState } from "react";
import type { DaymarkPlatform } from "../platform/platform";
import type { PlatformCapabilities } from "../platform/platform";
import { errorMessage } from "./useDaymarkStore";

export function usePlatformSettings(
  platform: DaymarkPlatform,
  onQuickCapture: () => void,
  onError: (message: string) => void,
) {
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [capabilities, setCapabilities] =
    useState<PlatformCapabilities>({
      desktopWindowControls: false,
      launchAtLogin: false,
      globalShortcuts: false,
      updater: false,
    });

  useEffect(() => {
    let dispose: (() => void) | undefined;
    void platform
      .initialize(onQuickCapture)
      .then((nextDispose) => {
        dispose = nextDispose;
      })
      .catch((error) => onError(errorMessage(error)));
    void platform
      .getCapabilities()
      .then(async (nextCapabilities) => {
        setCapabilities(nextCapabilities);
        if (nextCapabilities.launchAtLogin) {
          setLaunchAtLogin(
            await platform.isLaunchAtLoginEnabled(),
          );
        }
      })
      .catch((error) => onError(errorMessage(error)));
    return () => dispose?.();
  }, [onError, onQuickCapture, platform]);

  const toggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    try {
      await platform.setAlwaysOnTop(next);
      setAlwaysOnTop(next);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [alwaysOnTop, onError, platform]);

  const toggleLaunchAtLogin = useCallback(async () => {
    const next = !launchAtLogin;
    try {
      await platform.setLaunchAtLogin(next);
      setLaunchAtLogin(next);
    } catch (error) {
      onError(errorMessage(error));
    }
  }, [launchAtLogin, onError, platform]);

  return {
    capabilities,
    alwaysOnTop,
    launchAtLogin,
    toggleAlwaysOnTop,
    toggleLaunchAtLogin,
  };
}
