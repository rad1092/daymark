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
  nextStep: string;
  status: TaskStatus;
  estimateMinutes: number | null;
  createdAt: string;
  completedAt: string | null;
  settledAt: string | null;
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
  initialCommitmentIds: string[];
  currentTaskId: string | null;
  startedAt: string | null;
  closedAt: string | null;
  receipt: DayReceipt | null;
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
  schemaVersion: 3;
  revision: number;
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

export type DaySummaryOutcome =
  | "done"
  | "tomorrow"
  | "later"
  | "blocked"
  | "deleted";

export interface DaySummary {
  date: string;
  counts: Record<DaySummaryOutcome, number>;
}

export interface TaskHistoryEntry {
  task: DaymarkTask;
  date: string;
  outcome: PlanOutcome | TaskStatus;
}

export interface BlockedDetails {
  reason: string;
  reviewOn: string;
  nextStep: string;
}

export interface DeferredDetails {
  reviewOn: string;
  nextStep: string;
}

export interface DayReceiptItem {
  taskId: string;
  title: string;
  outcome: Exclude<PlanOutcome, "pending">;
  nextStep: string;
  reviewOn: string | null;
}

export interface DayReceipt {
  date: string;
  closedAt: string;
  items: DayReceiptItem[];
}

export interface DaymarkSnapshot {
  id: string;
  createdAt: string;
  label: string;
  data: DaymarkData;
}

export interface StorageLoadResult {
  data: DaymarkData | null;
  recovered: boolean;
  needsRecovery: boolean;
  migrated: boolean;
  issue: string | null;
}
