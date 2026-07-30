import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  DaymarkPlatform,
  PlatformCapabilities,
  UpdateResult,
} from "./platform";

export class NativeDaymarkPlatform implements DaymarkPlatform {
  readonly kind = "native" as const;

  async getCapabilities(): Promise<PlatformCapabilities> {
    return invoke<PlatformCapabilities>("get_runtime_capabilities");
  }

  async initialize(onQuickCapture: () => void): Promise<() => void> {
    const unlisten = await listen("daymark://quick-capture", () => {
      onQuickCapture();
    });
    await invoke("show_main_window");
    return unlisten;
  }

  async hideWindow(): Promise<void> {
    await invoke("hide_main_window");
  }

  async setAlwaysOnTop(enabled: boolean): Promise<void> {
    await invoke("set_main_window_always_on_top", { enabled });
  }

  async isLaunchAtLoginEnabled(): Promise<boolean> {
    return invoke<boolean>("is_launch_at_login_enabled");
  }

  async setLaunchAtLogin(enabled: boolean): Promise<void> {
    await invoke("set_launch_at_login", { enabled });
  }

  async checkForUpdates(): Promise<UpdateResult> {
    return invoke<UpdateResult>("check_for_updates");
  }
}
