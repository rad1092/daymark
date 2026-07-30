import { isTauri } from "@tauri-apps/api/core";
import { BrowserPreviewPlatform } from "../platform/browserPreviewPlatform";
import { NativeDaymarkPlatform } from "../platform/nativePlatform";
import type { DaymarkPlatform } from "../platform/platform";
import { BrowserPreviewRepository } from "../storage/browserPreviewRepository";
import { NativeDaymarkRepository } from "../storage/nativeRepository";
import type { DaymarkRepository } from "../storage/repository";

export interface DaymarkRuntime {
  repository: DaymarkRepository;
  platform: DaymarkPlatform;
}

export function createRuntime(): DaymarkRuntime {
  if (isTauri()) {
    return {
      repository: new NativeDaymarkRepository(),
      platform: new NativeDaymarkPlatform(),
    };
  }
  return {
    repository: new BrowserPreviewRepository(),
    platform: new BrowserPreviewPlatform(),
  };
}
