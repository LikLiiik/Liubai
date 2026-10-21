export type Category = 'work' | 'life' | 'health' | `custom-${string}`;
export type CategoryDefinition = { id: Category; name: string };
export type Priority = 'high' | 'normal' | 'low';
export type NotificationAccess = { status: 'granted' | 'denied' | 'undetermined' | 'unsupported'; canAskAgain: boolean };
export type ScreenName = 'today' | 'week' | 'explore' | 'inbox' | 'review' | 'me';
export type CompletionMove = { taskId: string; from: { date: string; start: number }; to: { date: string; start: number }; duration: number; deadline: string | null };
export type CompletionAdvance = { completedAt: string; moves: CompletionMove[] };

export interface Task {
  kind?: 'task' | 'quick';
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
  completionAdvance?: CompletionAdvance;
  date: string | null;
  start: number | null;
  deadline: string | null;
  postponed: number;
  courseImport?: { school: 'hitsz'; semester: string; key: string; fingerprint: string; sample?: boolean };
  inboxReminderAfter?: string;
  rescueInterruption?: boolean;
}

export interface Settings {
  nickname?: string;
  categories?: CategoryDefinition[];
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
  notificationReceipts?: string[];
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
  sourceTasks?: Task[];
  sourceSettings?: Settings;
  tasks: Task[];
  changes: Change[];
  warnings: string[];
  deferred: number;
  finish: number;
  extension: number;
  valid: boolean;
}
