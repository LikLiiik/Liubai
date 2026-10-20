export type Category = 'work' | 'life' | 'health';
export type Priority = 'high' | 'normal' | 'low';
export type NotificationAccess = { status: 'granted' | 'denied' | 'undetermined' | 'unsupported'; canAskAgain: boolean };
export type ScreenName = 'today' | 'week' | 'explore' | 'inbox' | 'review' | 'me';

export interface Task {
  id: string;
  title: string;
  notes: string;
  duration: number;
  category: Category;
  priority: Priority;
  important: boolean;
  fixed: boolean;
  completed: boolean;
  completedAt?: string;
  date: string | null;
  start: number | null;
  deadline: string | null;
  postponed: number;
  courseImport?: { school: 'hitsz'; semester: string; key: string; fingerprint: string; sample?: boolean };
  inboxReminderAfter?: string;
}

export interface Settings {
  dayStart: number;
  dayEnd: number;
  buffer: number;
  notificationsEnabled?: boolean;
  inboxRemindersEnabled?: boolean;
  inboxReminderMinMinutes?: number;
}

export interface Change {
  taskId: string;
  title: string;
  from: string;
  to: string;
  reason: string;
}

export interface PlanHistory {
  id: string;
  date: string;
  createdAt: string;
  title: string;
  changes: Change[];
  snapshot: Task[];
  appliedTasks: Task[];
  snapshotDemo?: boolean;
}

export interface AppData {
  version: 1;
  tasks: Task[];
  settings: Settings;
  history: PlanHistory[];
  demo: boolean;
}

export type RescueReason = 'interruption' | 'overrun' | 'lowEnergy' | 'rebalance';
export type PlanMode = 'balanced' | 'boundary' | 'focus';

export interface RescueRequest {
  reason: RescueReason;
  minutes: number;
  taskId?: string;
  mode: PlanMode;
  now: number;
  date: string;
}

export interface PlanResult {
  tasks: Task[];
  changes: Change[];
  warnings: string[];
  deferred: number;
  finish: number;
  extension: number;
  valid: boolean;
}
