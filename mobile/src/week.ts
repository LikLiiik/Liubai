import type { Change, Settings, Task } from './types.ts';
import { clock, dateKey, taskPosition } from './utils.ts';

export type TaskPosition = { date: string; start: number };
export type MoveResult =
  | { ok: false; error: string; confirmation?: 'outside-preferences' }
  | { ok: true; tasks: Task[]; change: Change | null; warnings: string[] };

export function addDays(key: string, amount: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

export function weekDates(key: string): string[] {
  const date = new Date(`${key}T12:00:00`);
  const monday = addDays(key, -((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function validDate(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === key;
}

export function positionFromPoint(input: {
  x: number; y: number; dayWidth: number; startMinute: number;
  pixelsPerMinute: number; dates: string[]; grabOffset: number; endMinute: number;
}): TaskPosition | null {
  const { x, y, dayWidth, startMinute, pixelsPerMinute, dates, grabOffset, endMinute } = input;
  if (!Number.isFinite(x) || !Number.isFinite(y) || dayWidth <= 0 || pixelsPerMinute <= 0) return null;
  const column = Math.floor(x / dayWidth);
  if (column < 0 || column >= dates.length || y < 0 || y >= (endMinute - startMinute) * pixelsPerMinute) return null;
  const rawMinute = startMinute + (y - grabOffset) / pixelsPerMinute;
  const start = Math.round(rawMinute / 15) * 15;
  if (start < startMinute || start >= endMinute || start < 0 || start >= 1440) return null;
  return { date: dates[column], start };
}

export function outsidePreferredHours(start: number, duration: number, settings: Settings): boolean {
  return start < settings.dayStart || start + duration > settings.dayEnd;
}

export function moveTaskTo(tasks: Task[], taskId: string, position: TaskPosition,
  settings: Settings, today: string, allowFixed = false, allowOutsidePreferences = false): MoveResult {
  const task = tasks.find(item => item.id === taskId);
  if (!task) return { ok: false, error: '这项任务已不存在，请重新选择。' };
  if (task.completed) return { ok: false, error: '已完成的任务不参与拖动，请先在今天或收集箱恢复为未完成。' };
  if (task.fixed && !allowFixed) return { ok: false, error: '固定事项默认锁定，需要先确认本次移动。' };
  if (!validDate(position.date) || !Number.isInteger(position.start) || position.start < 0
    || position.start + task.duration > 1440) {
    return { ok: false, error: '这个位置无法容纳整项任务，请选择当天范围内的有效时间。' };
  }
  if (task.date === position.date && task.start === position.start) {
    return { ok: true, tasks, change: null, warnings: [] };
  }
  if (task.deadline && position.date > task.deadline) {
    return { ok: false, error: `「${task.title}」最晚 ${task.deadline} 到期，不能移到截止日期之后。` };
  }
  const conflict = tasks.find(item => item.id !== taskId && item.date === position.date && item.start !== null
    && item.start < position.start + task.duration && item.start + item.duration > position.start);
  if (conflict) {
    return { ok: false, error: `与「${conflict.title}」${clock(conflict.start!)}–${clock(conflict.start! + conflict.duration)} 重叠，已保留原位置。` };
  }
  const outside = outsidePreferredHours(position.start, task.duration, settings);
  if (outside && !allowOutsidePreferences) {
    return { ok: false, confirmation: 'outside-preferences', error: `超出偏好时段 ${clock(settings.dayStart)}–${clock(settings.dayEnd)}，需要确认本次安排。` };
  }
  const updated = { ...task, date: position.date, start: position.start };
  const warnings: string[] = [];
  if (outside) {
    warnings.push('经确认安排在偏好时段之外');
  }
  if (position.date < today) warnings.push('安排在过去的日期，仍保留未完成状态');
  return { ok: true, tasks: tasks.map(item => item.id === taskId ? updated : item), warnings,
    change: { taskId, title: task.title, from: taskPosition(task, today), to: taskPosition(updated, today),
      reason: task.fixed ? '经确认移动固定事项，移动后保持固定' : '在周览中手动调整时间' } };
}

export type PlacedTask = { task: Task; lane: number; lanes: number };

// Existing overlapping items are displayed side by side instead of covering one another.
export function layoutDay(tasks: Task[]): PlacedTask[] {
  const sorted = tasks.filter(task => task.start !== null).slice().sort((a, b) => a.start! - b.start! || b.duration - a.duration);
  const result: PlacedTask[] = [];
  let cluster: Task[] = [];
  let end = -1;
  function flush() {
    const laneEnds: number[] = [];
    const placed = cluster.map(task => {
      let lane = laneEnds.findIndex(value => value <= task.start!);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = task.start! + task.duration;
      return { task, lane };
    });
    result.push(...placed.map(item => ({ ...item, lanes: laneEnds.length })));
    cluster = [];
  }
  for (const task of sorted) {
    if (cluster.length && task.start! >= end) flush();
    if (!cluster.length) end = task.start! + task.duration;
    else end = Math.max(end, task.start! + task.duration);
    cluster.push(task);
  }
  flush();
  return result;
}
