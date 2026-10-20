import type { AppData, PlanResult, Settings, Task } from './types.ts';
import { mergeIntervals } from './scheduler.ts';
import { daysBetween, finishesByDeadline, normalizePosition, planningContext, relativeStart, shiftDate, validSettings } from './time.ts';
import { clock, dateKey, durationText } from './utils.ts';
import { isQuick } from './quick.ts';

export const INBOX_REMINDER_PREFIX = 'liubai-inbox-';
export const DEFAULT_FREE_MINUTES = 60;
export type ReminderReservation = { at: number; taskId: string; planningDate: string };
export type ReminderLedger = Record<string, ReminderReservation>;
export type InboxSuggestion = ReminderReservation & { day: string; end: number; freeMinutes: number; task: Task };
export type ReminderResponse = { id: string; taskId: string; day: string };

export function localMoment(date: string, minute: number): Date {
  const result = new Date(`${date}T00:00:00`);
  result.setMinutes(minute);
  return result;
}

function minuteOn(date: string, moment: Date): number {
  return daysBetween(dateKey(moment), date) * 1440 + moment.getHours() * 60 + moment.getMinutes() + moment.getSeconds() / 60;
}

export function freeWindows(tasks: Task[], settings: Settings, date: string): { start: number; end: number }[] {
  const busy = mergeIntervals(tasks.filter(task => !isQuick(task) && task.date && task.start !== null)
    .map(task => ({ start: Math.max(settings.dayStart, relativeStart(task, date)! - (task.fixed ? 0 : settings.buffer)),
      end: Math.min(settings.dayEnd, relativeStart(task, date)! + task.duration + (task.fixed ? 0 : settings.buffer)) })));
  const gaps: { start: number; end: number }[] = [];
  let cursor = settings.dayStart;
  for (const block of busy) { if (block.start > cursor) gaps.push({ start: cursor, end: block.start }); cursor = Math.max(cursor, block.end); }
  if (cursor < settings.dayEnd) gaps.push({ start: cursor, end: settings.dayEnd });
  return gaps;
}

function eligible(task: Task, day: string): boolean {
  return !isQuick(task) && !task.completed && !task.fixed && !task.courseImport && task.date === null && task.start === null
    && (!task.deadline || task.deadline >= day) && (!task.inboxReminderAfter || task.inboxReminderAfter <= day);
}

function suggestionAt(task: Task, anchor: string, start: number, end: number, minimum: number, buffer: number): InboxSuggestion | null {
  const position = normalizePosition(anchor, start);
  if (!eligible(task, position.date) || end - start < Math.max(minimum, task.duration + buffer)
    || !finishesByDeadline(position.date, position.start, task.duration, task.deadline)) return null;
  const at = localMoment(anchor, start).getTime();
  return { at, end: localMoment(anchor, end).getTime(), freeMinutes: Math.floor(end - start),
    taskId: task.id, task, planningDate: anchor, day: dateKey(new Date(at)) };
}

function candidates(tasks: Task[], history: ReminderLedger, day: string): Task[] {
  const lastSuggested = (id: string) => Math.max(0, ...Object.values(history).filter(entry => entry.taskId === id).map(entry => entry.at));
  const ranks = { high: 3, normal: 2, low: 1 };
  return tasks.filter(task => eligible(task, day)).sort((a, b) => lastSuggested(a.id) - lastSuggested(b.id)
    || Number(b.important) - Number(a.important) || ranks[b.priority] - ranks[a.priority] || b.postponed - a.postponed || a.id.localeCompare(b.id));
}

export function findInboxSuggestion(data: AppData, moment: Date, taskId?: string, leadMinutes = 0): InboxSuggestion | null {
  if (!validSettings(data.settings)) return null;
  const calendarDay = dateKey(moment), minute = moment.getHours() * 60 + moment.getMinutes();
  const first = planningContext(calendarDay, minute, data.settings).date;
  const minimum = data.settings.inboxReminderMinMinutes ?? DEFAULT_FREE_MINUTES;
  const tasks = taskId ? data.tasks.filter(task => task.id === taskId) : candidates(data.tasks, {}, calendarDay);
  for (const anchor of first === calendarDay ? [first] : [first, calendarDay]) {
    for (const gap of freeWindows(data.tasks, data.settings, anchor)) {
      const start = Math.ceil(Math.max(gap.start, minuteOn(anchor, moment) + leadMinutes));
      for (const task of tasks) {
        const suggestion = suggestionAt(task, anchor, start, gap.end, minimum, data.settings.buffer);
        if (suggestion) return suggestion;
      }
    }
  }
  return null;
}

export function planInboxReminders(data: AppData, moment: Date, ledger: ReminderLedger): InboxSuggestion[] {
  if (data.demo || !data.settings.inboxRemindersEnabled || !validSettings(data.settings)) return [];
  const today = dateKey(moment), now = moment.getTime();
  const active = planningContext(today, moment.getHours() * 60 + moment.getMinutes(), data.settings).date;
  const result: InboxSuggestion[] = [], usedDays = new Set(Object.entries(ledger).filter(([, entry]) => entry.at <= now).map(([day]) => day));
  const exposure: ReminderLedger = { ...ledger };
  const minimum = data.settings.inboxReminderMinMinutes ?? DEFAULT_FREE_MINUTES;
  // Include an overnight cycle already in progress, then refresh a rolling seven-day horizon.
  const anchors = Array.from({ length: active === today ? 7 : 8 }, (_, index) => shiftDate(active, index));
  for (const anchor of anchors) {
    let chosen: InboxSuggestion | null = null;
    const gaps = freeWindows(data.tasks, data.settings, anchor);
    const reserved = Object.entries(ledger).filter(([day, entry]) => !usedDays.has(day) && entry.planningDate === anchor && entry.at > now);
    for (const [, entry] of reserved) {
      const task = data.tasks.find(task => task.id === entry.taskId);
      const minute = minuteOn(anchor, new Date(entry.at));
      const gap = gaps.find(gap => minute >= gap.start && minute < gap.end);
      if (task && gap) chosen = suggestionAt(task, anchor, minute, gap.end, minimum, data.settings.buffer);
      if (chosen) break;
    }
    if (!chosen) for (const gap of gaps) {
      const start = Math.ceil(Math.max(gap.start, minuteOn(anchor, moment) + 5));
      const day = normalizePosition(anchor, start).date;
      if (usedDays.has(day)) continue;
      for (const task of candidates(data.tasks, exposure, day)) {
        chosen = suggestionAt(task, anchor, start, gap.end, minimum, data.settings.buffer);
        if (chosen) break;
      }
      if (chosen) break;
    }
    if (!chosen || usedDays.has(chosen.day) || chosen.day < today || chosen.day >= shiftDate(today, 7)) continue;
    result.push(chosen); usedDays.add(chosen.day);
    exposure[chosen.day] = { at: chosen.at, taskId: chosen.taskId, planningDate: chosen.planningDate };
  }
  return result;
}

export function retainReminderLedger(ledger: ReminderLedger, suggestions: InboxSuggestion[], moment: Date): ReminderLedger {
  const cutoff = shiftDate(dateKey(moment), -35);
  const next = Object.fromEntries(Object.entries(ledger).filter(([day, entry]) => day >= cutoff && entry.at <= moment.getTime()));
  for (const suggestion of suggestions) next[suggestion.day] = { at: suggestion.at, taskId: suggestion.taskId, planningDate: suggestion.planningDate };
  return next;
}

export function parseReminderLedger(raw: string | null, moment: Date): ReminderLedger {
  if (raw === null) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 60) throw new Error();
    if (!Object.entries(value).every(([day, record]) => {
      const entry = record as ReminderReservation;
      return /^\d{4}-\d{2}-\d{2}$/.test(day) && entry && Number.isFinite(entry.at)
        && Number.isFinite(new Date(entry.at).getTime()) && dateKey(new Date(entry.at)) === day
        && typeof entry.taskId === 'string' && entry.taskId.length <= 200
        && typeof entry.planningDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.planningDate);
    })) throw new Error();
    return value;
  } catch {
    // A damaged frequency ledger must not produce a second notification today.
    const day = dateKey(moment);
    return { [day]: { at: moment.getTime(), taskId: '', planningDate: day } };
  }
}

export function decodeReminderResponse(id: string, payload: unknown): ReminderResponse | null {
  if (!id.startsWith(INBOX_REMINDER_PREFIX) || !payload || typeof payload !== 'object') return null;
  const value = payload as Record<string, unknown>;
  if (value.kind !== 'inbox-suggestion' || typeof value.taskId !== 'string' || !value.taskId || value.taskId.length > 200
    || typeof value.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.day) || id !== INBOX_REMINDER_PREFIX + value.day) return null;
  return { id, taskId: value.taskId, day: value.day };
}

export function suggestionMessage(suggestion: InboxSuggestion): string {
  return `接下来有 ${durationText(suggestion.freeMinutes)}空闲，要不要做「${suggestion.task.title}」？预计 ${durationText(suggestion.task.duration)}。`;
}

export function acceptInboxSuggestion(data: AppData, taskId: string, moment: Date): PlanResult | null {
  const suggestion = findInboxSuggestion(data, moment, taskId);
  if (!suggestion) return null;
  const task = suggestion.task;
  const position = normalizePosition(suggestion.planningDate, Math.ceil(minuteOn(suggestion.planningDate, new Date(suggestion.at))));
  return { sourceTasks: data.tasks, sourceSettings: data.settings, tasks: data.tasks.map(item => item.id === task.id ? { ...item, ...position, inboxReminderAfter: undefined } : item),
    changes: [{ taskId, title: task.title, from: '收集箱', to: `${position.date} ${clock(position.start)}`, reason: '用户确认空闲时段待办提醒' }],
    warnings: [], deferred: 0, finish: position.start + task.duration, extension: 0, valid: true };
}
