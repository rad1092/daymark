export interface UpdateResult {
  status: "disabled" | "current" | "available";
  version?: string;
}

export interface PlatformCapabilities {
  desktopWindowControls: boolean;
  launchAtLogin: boolean;
  globalShortcuts: boolean;
  updater: boolean;
}

export interface DaymarkPlatform {
  readonly kind: "native" | "browser-preview";
  getCapabilities(): Promise<PlatformCapabilities>;
  initialize(onQuickCapture: () => void): Promise<() => void>;
  hideWindow(): Promise<void>;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  isLaunchAtLoginEnabled(): Promise<boolean>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  checkForUpdates(): Promise<UpdateResult>;
}
