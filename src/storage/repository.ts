import type { DaymarkData } from "../types";

export interface DaymarkBackup {
  id: number;
  createdAt: string;
  label: string;
  data: DaymarkData;
}

export interface DaymarkRepository {
  readonly kind: "native-sqlite" | "browser-preview";
  load(): Promise<DaymarkData | null>;
  save(data: DaymarkData, expectedRevision: number | null): Promise<void>;
  createBackup(data: DaymarkData, label: string): Promise<void>;
  listBackups(): Promise<DaymarkBackup[]>;
}

export class RepositoryConflictError extends Error {
  constructor(message = "다른 창에서 데이터가 변경되었습니다.") {
    super(message);
    this.name = "RepositoryConflictError";
  }
}
