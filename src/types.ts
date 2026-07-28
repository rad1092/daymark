export type ViewName = "today" | "inbox" | "week" | "log";
export type TaskStatus = "inbox" | "today" | "done";
export type FocusMode = "running" | "paused";

export interface DaymarkTask {
  id: string;
  title: string;
  notes: string;
  tags: string[];
  status: TaskStatus;
  createdAt: string;
  completedAt: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  durationMinutes: number;
  isTop3: boolean;
  top3Rank: number | null;
}

export interface FocusRecord {
  id: string;
  taskId: string | null;
  taskTitle: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

export interface ActiveFocus {
  taskId: string | null;
  taskTitle: string;
  durationMinutes: number;
  startedAt: string;
  mode: FocusMode;
  endAt: string | null;
  remainingSeconds: number;
}

export interface DaymarkPreferences {
  defaultFocusMinutes: number;
  lastView: ViewName;
  hasSeenWelcome: boolean;
}

export interface DaymarkData {
  schemaVersion: 1;
  tasks: DaymarkTask[];
  focusRecords: FocusRecord[];
  activeFocus: ActiveFocus | null;
  preferences: DaymarkPreferences;
  updatedAt: string;
}

export interface WeeklyDay {
  date: string;
  label: string;
  completed: number;
  focusMinutes: number;
}

export interface WeeklySummary {
  completed: number;
  focusMinutes: number;
  activeDays: number;
  completionRate: number;
  topTag: string | null;
  days: WeeklyDay[];
}
