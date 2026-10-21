import type { Settings, Task } from './types.ts';
import { mergeIntervals } from './scheduler.ts';
import { inPlanningDay, occupiedDuration, relativeStart } from './time.ts';
import { isQuick } from './quick.ts';

// Availability is the complement of the union of occupied intervals. Parallel
// events reserve the same minute once, even when one is fixed and one flexible.
export function dayBudget(tasks: Task[], settings: Settings, date: string, now: number) {
  const from = Math.min(settings.dayEnd, Math.max(now, settings.dayStart));
  const capacity = Math.max(0, settings.dayEnd - from);
  const scheduled = tasks.filter(task => !isQuick(task) && task.date && task.start !== null && occupiedDuration(task) > 0);
  const intervals = (buffer: boolean) => mergeIntervals(scheduled.map(task => {
    const start = relativeStart(task, date)!;
    const padding = buffer && !task.fixed ? settings.buffer : 0;
    return { start: Math.max(from, start - padding), end: Math.min(settings.dayEnd, start + occupiedDuration(task) + padding) };
  }));
  const total = (items: { start: number; end: number }[]) => items.reduce((sum, item) => sum + item.end - item.start, 0);
  const occupied = total(intervals(false));
  const buffered = total(intervals(true));
  const pending = tasks.filter(task => !isQuick(task) && !task.completed && task.start === null && inPlanningDay(task, date, settings));
  const pendingMinutes = pending.reduce((sum, task) => sum + task.duration, 0);
  const pendingBuffer = Math.max(0, pending.length - (buffered ? 0 : 1)) * settings.buffer;
  const switching = buffered - occupied + pendingBuffer;
  return { capacity, occupied, pendingMinutes, switching, space: capacity - occupied - pendingMinutes - switching };
}

export function timelineGaps(tasks: Task[], date: string): Map<string, number> {
  const ordered = tasks.filter(task => !isQuick(task) && task.start !== null)
    .map(task => ({ task, start: relativeStart(task, date)! })).sort((a, b) => a.start - b.start);
  const result = new Map<string, number>();
  let occupiedEnd = -Infinity;
  ordered.forEach(({ task, start }, index) => {
    occupiedEnd = Math.max(occupiedEnd, start + occupiedDuration(task));
    const next = ordered[index + 1];
    if (next && next.start > occupiedEnd) result.set(task.id, next.start - occupiedEnd);
  });
  return result;
}
