export type TaskStatus =
  | "inbox"
  | "planned"
  | "later"
  | "blocked"
  | "done"
  | "deleted";

export type PlanStatus = "draft" | "active" | "closing" | "closed";

export type PlanOutcome =
  | "pending"
  | "done"
  | "later"
  | "tomorrow"
  | "blocked"
  | "deleted"
  | "carried";

export type TaskAction =
  | "done"
  | "later"
  | "tomorrow"
  | "blocked"
  | "deleted";

export interface DaymarkTask {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  estimateMinutes: number | null;
  createdAt: string;
  completedAt: string | null;
  blockedReason: string | null;
  reviewOn: string | null;
  legacy: {
    tags: string[];
    scheduledTime: string | null;
  } | null;
}

export interface PlanItem {
  taskId: string;
  addedAt: string;
  outcome: PlanOutcome;
  resolvedAt: string | null;
}

export interface DailyPlan {
  date: string;
  status: PlanStatus;
  items: PlanItem[];
  currentTaskId: string | null;
  startedAt: string | null;
  closedAt: string | null;
}

export interface LegacyFocusRecord {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

export interface DaymarkData {
  schemaVersion: 2;
  tasks: DaymarkTask[];
  plans: DailyPlan[];
  archive: {
    legacyFocusRecords: LegacyFocusRecord[];
  };
  updatedAt: string;
}

export interface ReviewItem {
  taskId: string;
  source: "stale-plan" | "scheduled";
  planDate: string | null;
}

export interface BlockedDetails {
  reason: string;
  reviewOn: string;
}

export interface StorageLoadResult {
  data: DaymarkData | null;
  recovered: boolean;
  migrated: boolean;
  issue: string | null;
}
