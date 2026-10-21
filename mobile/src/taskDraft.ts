import type { Category, Priority, Settings, Task } from './types.ts';
import { finishesByDeadline, overlaps, parseTime } from './time.ts';
import { parseDuration } from './timePicker.ts';
import { scheduleTask } from './scheduler.ts';
import { overlapConsentKey, validDate } from './week.ts';
import { knownCategory } from './categories.ts';
import { isQuick } from './quick.ts';

export type TaskDraft = {
  kind?: Task['kind'];
  timeMode?: 'auto' | 'manual';
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
  if (!knownCategory(draft.category, settings)) return { kind: 'error', error: '请选择已有分类，或先添加分类。' };
  const quick = draft.kind === 'quick';
  if (original && isQuick(original) !== quick) return { kind: 'error', error: '已有事项不能切换类型，请新建事项。' };
  if (quick) {
    const start = parseTime(draft.time);
    if (!date || !validDate(date) || start === null) return { kind: 'error', error: '请选择有效的提醒日期、小时和分钟。' };
    const changed = !original || original.date !== date || original.start !== start;
    if (changed && (date < context.calendarToday || date === context.calendarToday && start <= context.calendarNow)) {
      return { kind: 'error', error: '提醒时间应晚于当前时间。' };
    }
    const updated: Task = { ...original, id, kind: 'quick', title: title.trim(), notes: notes.trim(), duration: 0,
      category: draft.category, priority: 'normal', important: false, fixed: false, completed: original?.completed ?? false,
      date, start, deadline: null, postponed: 0 };
    return { kind: 'saved', tasks: original ? tasks.map(task => task.id === id ? updated : task) : [...tasks, updated], noSlot: false };
  }
  const minutes = parseDuration(draft.duration);
  if (minutes === null || !Number.isInteger(minutes) || minutes < 5 || minutes > 720) return { kind: 'error', error: '预计时长应在 5 分钟至 12 小时之间。' };
  if (date !== null && !validDate(date)) return { kind: 'error', error: '请选择有效的任务日期。' };
  if (deadline && !validDate(deadline)) return { kind: 'error', error: '截止日期请使用有效的 YYYY-MM-DD 格式。' };
  const manual = fixed || draft.timeMode === 'manual';
  const start = manual && date ? parseTime(draft.time) : draft.timeMode === 'auto' ? null : date && original?.date === date ? original.start : null;
  if (manual && date && start === null) return { kind: 'error', error: '请输入有效的开始时间。' };
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
