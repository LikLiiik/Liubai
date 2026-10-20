import type { Category, Priority, Settings, Task } from './types.ts';
import { finishesByDeadline, overlaps, parseTime } from './time.ts';
import { parseDuration } from './timePicker.ts';
import { scheduleTask } from './scheduler.ts';
import { overlapConsentKey, validDate } from './week.ts';

export type TaskDraft = {
  id: string; title: string; notes: string; duration: string; category: Category; priority: Priority;
  important: boolean; fixed: boolean; date: string | null; time: string; deadline: string;
};
export type TaskSaveContext = { today: string; now: number; calendarToday: string; calendarNow: number };
export type TaskSaveResult = { kind: 'error'; error: string }
  | { kind: 'overlap'; key: string; task: Task; conflicts: Task[] }
  | { kind: 'saved'; tasks: Task[]; noSlot: boolean };

export function saveTaskDraft(tasks: Task[], settings: Settings, draft: TaskDraft, context: TaskSaveContext,
  original?: Task | null, consentKey?: string): TaskSaveResult {
  const { id, title, notes, date, deadline, fixed } = draft;
  const current = tasks.find(task => task.id === id);
  if (original ? !current || JSON.stringify(current) !== JSON.stringify(original) : !!current) {
    return { kind: 'error', error: '这项任务已变更，请关闭后重新打开。' };
  }
  if (!title.trim() || title.trim().length > 100) return { kind: 'error', error: '请填写 1–100 字的任务名称。' };
  const minutes = parseDuration(draft.duration);
  if (minutes === null || !Number.isInteger(minutes) || minutes < 5 || minutes > 720) return { kind: 'error', error: '预计时长应在 5 分钟至 12 小时之间。' };
  if (date !== null && !validDate(date)) return { kind: 'error', error: '请选择有效的任务日期。' };
  if (deadline && !validDate(deadline)) return { kind: 'error', error: '截止日期请使用有效的 YYYY-MM-DD 格式。' };
  const start = fixed && date ? parseTime(draft.time) : date && original?.date === date ? original.start : null;
  if (fixed && date && start === null) return { kind: 'error', error: '请输入有效的开始时间。' };
  const timingChanged = !original || original.date !== date || original.start !== start || original.duration !== minutes;
  if ((timingChanged || original?.deadline !== (deadline || null)) && date && deadline
    && (date > deadline || start !== null && !finishesByDeadline(date, start, minutes, deadline))) {
    return { kind: 'error', error: '任务时间超过截止日期，请调整日期、时间或截止日期。' };
  }
  const updated: Task = { ...original, id, title: title.trim(), notes: notes.trim(), duration: minutes,
    category: draft.category, priority: draft.priority, important: draft.important, fixed: !!date && fixed,
    completed: original?.completed ?? false, date, start, deadline: deadline || null, postponed: original?.postponed ?? 0 };
  const conflicts = timingChanged ? tasks.filter(item => item.id !== id && overlaps(updated, item)) : [];
  const key = overlapConsentKey(updated, conflicts);
  if (conflicts.length && consentKey !== key) return { kind: 'overlap', key, task: updated, conflicts };
  let next = original ? tasks.map(task => task.id === id ? updated : task) : [...tasks, updated];
  let noSlot = false;
  if (date && !fixed && start === null && !updated.completed) {
    const now = date === context.today ? context.now : date === context.calendarToday ? context.calendarNow
      : date < context.calendarToday ? 1440 : settings.dayStart;
    const scheduled = scheduleTask(next, id, settings, date, now);
    if (scheduled) next = scheduled;
    else noSlot = true;
  }
  return { kind: 'saved', tasks: next, noSlot };
}
