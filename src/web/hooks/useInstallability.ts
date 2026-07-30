import { useEffect, useState } from "react";
import type { PersistenceState } from "../types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallabilityController {
  isStandalone: boolean;
  installAvailable: boolean;
  persistenceState: PersistenceState;
  requestPersistentStorage: () => Promise<void>;
  install: () => Promise<void>;
}

function getStorageManager(): Partial<StorageManager> | undefined {
  return (
    navigator as Navigator & {
      storage?: Partial<StorageManager>;
    }
  ).storage;
}

export function useInstallability(
  notify: (message: string) => void,
): InstallabilityController {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [persistenceState, setPersistenceState] =
    useState<PersistenceState>(() =>
      typeof navigator !== "undefined" &&
      typeof getStorageManager()?.persisted === "function"
        ? "checking"
        : "unsupported",
    );

  useEffect(() => {
    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    const syncStandalone = () =>
      setIsStandalone(
        Boolean(displayMode?.matches) ||
          Boolean(
            (window.navigator as Navigator & { standalone?: boolean })
              .standalone,
          ),
      );
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    syncStandalone();
    displayMode?.addEventListener?.("change", syncStandalone);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => {
      displayMode?.removeEventListener?.("change", syncStandalone);
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallPrompt,
      );
    };
  }, []);

  useEffect(() => {
    const storage = getStorageManager();
    if (!storage?.persisted) return;
    storage
      .persisted()
      .then((persisted) =>
        setPersistenceState(persisted ? "persistent" : "best-effort"),
      )
      .catch(() => setPersistenceState("unsupported"));
  }, []);

  const requestPersistentStorage = async () => {
    const storage = getStorageManager();
    if (!storage?.persist) {
      setPersistenceState("unsupported");
      return;
    }
    try {
      const granted = await storage.persist();
      setPersistenceState(granted ? "persistent" : "best-effort");
      notify(
        granted
          ? "이 기기에서 Daymark 저장 공간을 유지합니다."
          : "브라우저가 일반 저장 모드를 유지했습니다. 백업 파일을 받아 두세요.",
      );
    } catch {
      setPersistenceState("unsupported");
      notify("저장 공간 유지 요청을 사용할 수 없습니다.");
    }
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      notify("Daymark를 설치했습니다.");
    }
    setInstallPrompt(null);
  };

  return {
    isStandalone,
    installAvailable: Boolean(installPrompt),
    persistenceState,
    requestPersistentStorage,
    install,
  };
}
