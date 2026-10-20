import type { Settings, Task } from './types.ts';
import { clock, dateKey } from './utils.ts';

export const LATEST_END = 1800;

export function shiftDate(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function daysBetween(date: string, reference: string): number {
  return (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${reference}T00:00:00Z`)) / 86400000;
}

function readTime(value: string): { minutes: number; nextDay: boolean } | null {
  let text = value.trim().toLowerCase().replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 65296))
    .replace(/[：﹕]/g, ':').replace(/\s+/g, '');
  if (!text) return null;
  const nextDay = /次日|明天|翌日|第二天/.test(text);
  text = text.replace(/次日|明天|翌日|第二天/g, '');
  const period = /凌晨|午夜|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里|am|pm/.exec(text)?.[0];
  text = text.replace(/凌晨|午夜|早上|早晨|清晨|上午|中午|下午|傍晚|晚上|夜里|am|pm/g, '');
  const chinese = (part: string) => {
    const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (part === '十') return '10';
    if (part.includes('十')) { const [tens, ones] = part.split('十'); return String((tens ? digits[tens] : 1) * 10 + (ones ? digits[ones] : 0)); }
    return String(digits[part] ?? NaN);
  };
  text = text.replace(/[零〇一二两三四五六七八九十]+/g, chinese)
    .replace(/[点时]半$/, ':30').replace(/[点时]1刻$/, ':15').replace(/[点时]3刻$/, ':45')
    .replace(/[点时]/g, ':').replace(/分$/, '').replace(/整$/, '').replace(/\.$/, ':').replace('.', ':');
  let hours: number, minutes: number;
  const separated = /^(\d{1,2}):(\d{0,2})$/.exec(text);
  if (separated) { hours = Number(separated[1]); minutes = Number(separated[2] || 0); }
  else if (/^\d{1,2}$/.test(text)) { hours = Number(text); minutes = 0; }
  else if (/^\d{3,4}$/.test(text)) { hours = Number(text.slice(0, -2)); minutes = Number(text.slice(-2)); }
  else return null;
  if (minutes >= 60 || hours > 30 || (period && hours > 24)) return null;
  if (period === 'am' || period === '凌晨' || period === '午夜' || period === '上午') { if (hours === 12) hours = 0; }
  if (period === 'pm' || period === '下午' || period === '傍晚' || period === '晚上' || period === '夜里') {
    if (hours < 12) hours += 12;
    else if (hours === 12 && (period === '晚上' || period === '夜里')) hours = 24;
  }
  if (period === '中午' && hours < 11) hours += 12;
  return { minutes: hours * 60 + minutes, nextDay };
}

export function parseTime(value: string): number | null {
  const result = readTime(value);
  return result && !result.nextDay && result.minutes < 1440 ? result.minutes : null;
}

export function parsePreferenceEnd(value: string, start: number): number | null {
  const result = readTime(value);
  if (!result) return null;
  let end = result.minutes;
  if (end < 1440 && (result.nextDay || end <= start)) end += 1440;
  return end > start && end <= LATEST_END ? end : null;
}

export function preferenceTime(minutes: number): string {
  return minutes >= 1440 ? `次日 ${clock(minutes - 1440)}` : clock(minutes);
}

export function validSettings(settings: Settings): boolean {
  return Number.isInteger(settings.dayStart) && settings.dayStart >= 0 && settings.dayStart < 1440
    && Number.isInteger(settings.dayEnd) && settings.dayEnd > settings.dayStart && settings.dayEnd <= LATEST_END
    && Number.isInteger(settings.buffer) && settings.buffer >= 0 && settings.buffer <= 60
    && (settings.inboxRemindersEnabled === undefined || typeof settings.inboxRemindersEnabled === 'boolean')
    && (settings.inboxReminderMinMinutes === undefined || [30, 60, 90, 120].includes(settings.inboxReminderMinMinutes));
}

export function normalizePosition(date: string, start: number): { date: string; start: number } {
  const days = Math.floor(start / 1440);
  return { date: shiftDate(date, days), start: start - days * 1440 };
}

export function relativeStart(task: Pick<Task, 'date' | 'start'>, date: string): number | null {
  return task.date && task.start !== null ? daysBetween(task.date, date) * 1440 + task.start : null;
}

export function inPlanningDay(task: Task, date: string, settings: Settings): boolean {
  return task.date === date || settings.dayEnd > 1440 && task.date === shiftDate(date, 1)
    && task.start !== null && task.start < settings.dayEnd - 1440;
}

export function planningContext(date: string, now: number, settings: Settings): { date: string; now: number } {
  return settings.dayEnd > 1440 && now < settings.dayEnd - 1440 && now < settings.dayStart
    ? { date: shiftDate(date, -1), now: now + 1440 } : { date, now };
}

export function deadlineLimit(task: Task, date: string): number {
  return task.deadline ? Math.max(1, daysBetween(task.deadline, date) + 1) * 1440 : Infinity;
}

export function overlaps(a: Task, b: Task): boolean {
  if (!a.date || a.start === null || !b.date || b.start === null) return false;
  const start = relativeStart(b, a.date)!;
  return a.start < start + b.duration && start < a.start + a.duration;
}

export function finishesByDeadline(date: string, start: number, duration: number, deadline: string | null): boolean {
  return !deadline || start + duration <= (daysBetween(deadline, date) + 1) * 1440;
}

export function nonPreferredRanges(settings: Settings): { start: number; end: number }[] {
  if (settings.dayEnd - settings.dayStart >= 1440) return [];
  if (settings.dayEnd > 1440) return [{ start: settings.dayEnd - 1440, end: settings.dayStart }];
  return [{ start: 0, end: settings.dayStart }, { start: settings.dayEnd, end: 1440 }].filter(range => range.end > range.start);
}

export type CalendarSegment = { task: Task; date: string; start: number; duration: number; offset: number };
export function calendarSegments(task: Task): CalendarSegment[] {
  if (!task.date || task.start === null) return [];
  const first = Math.min(task.duration, 1440 - task.start);
  const result = [{ task, date: task.date, start: task.start, duration: first, offset: 0 }];
  if (first < task.duration) result.push({ task, date: shiftDate(task.date, 1), start: 0, duration: task.duration - first, offset: first });
  return result;
}
