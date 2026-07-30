import type {
  DaymarkPlatform,
  PlatformCapabilities,
  UpdateResult,
} from "./platform";

export class BrowserPreviewPlatform implements DaymarkPlatform {
  readonly kind = "browser-preview" as const;

  async getCapabilities(): Promise<PlatformCapabilities> {
    return {
      desktopWindowControls: false,
      launchAtLogin: false,
      globalShortcuts: false,
      updater: false,
    };
  }

  async initialize(): Promise<() => void> {
    return () => undefined;
  }

  async hideWindow(): Promise<void> {
    // The preview deliberately cannot imitate an operating-system window.
  }

  async setAlwaysOnTop(): Promise<void> {
    // Unsupported in a browser preview.
  }

  async isLaunchAtLoginEnabled(): Promise<boolean> {
    return false;
  }

  async setLaunchAtLogin(): Promise<void> {
    // Unsupported in a browser preview.
  }

  async checkForUpdates(): Promise<UpdateResult> {
    return { status: "disabled" };
  }
}
