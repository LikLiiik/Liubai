import type { PlanResult, Settings, Task } from './types.ts';
import { deadlineLimit, inPlanningDay, LATEST_END, normalizePosition, occupiedDuration, overlaps, relativeStart, validSettings } from './time.ts';
import { isQuick } from './quick.ts';
import { findSlot } from './scheduler.ts';
import { taskPosition } from './utils.ts';
import { overlapConsentKey, validDate } from './week.ts';

export function setTaskCompletion(tasks: Task[], id: string, completed: boolean, at: string, consentKey?: string): { tasks: Task[]; confirmation?: { key: string; conflicts: Task[] } } {
  const task = tasks.find(item => item.id === id);
  if (!task || task.completed === completed || !Number.isFinite(Date.parse(at))) return { tasks };
  const updated = { ...task, completed, completedAt: completed ? at : undefined };
  const conflicts = completed ? [] : tasks.filter(item => item.id !== id && overlaps(updated, item));
  const key = overlapConsentKey(updated, conflicts);
  if (conflicts.length && consentKey !== key) return { tasks, confirmation: { key, conflicts } };
  return { tasks: tasks.map(item => item.id === id ? updated : item) };
}

export function createAdvancePlan(tasks: Task[], settings: Settings, sourceId: string, date: string, now: number): PlanResult {
  const result: PlanResult = { sourceTasks: tasks, sourceSettings: settings, tasks, changes: [], warnings: [], deferred: 0, finish: now, extension: 0, valid: true };
  if (!validSettings(settings) || !validDate(date) || !Number.isInteger(now) || now < 0 || now >= LATEST_END) return { ...result, valid: false };
  const source = tasks.find(task => task.id === sourceId);
  const sourceStart = source ? relativeStart(source, date) : null;
  if (!source?.completed || !source.completedAt || isQuick(source) || sourceStart === null || sourceStart > now
    || !inPlanningDay(source, date, settings)) return result;
  const candidates = tasks.filter(task => !task.completed && !task.fixed && !isQuick(task) && inPlanningDay(task, date, settings)
    && task.start !== null && relativeStart(task, date)! > now && relativeStart(task, date)! > sourceStart)
    .slice().sort((a, b) => relativeStart(a, date)! - relativeStart(b, date)!);
  let next = tasks;
  let cursor = Math.max(settings.dayStart, now + settings.buffer);
  for (const task of candidates) {
    const originalStart = relativeStart(task, date)!;
    const busy = next.filter(other => other.id !== task.id && !isQuick(other) && other.date && other.start !== null && occupiedDuration(other) > 0)
      .map(other => ({ start: relativeStart(other, date)! - (other.fixed ? 0 : settings.buffer),
        end: relativeStart(other, date)! + occupiedDuration(other) + (other.fixed ? 0 : settings.buffer) }));
    const slot = findSlot(task.duration, cursor, Math.min(originalStart + task.duration, settings.dayEnd, deadlineLimit(task, date)), busy);
    if (slot !== null && slot < originalStart) {
      const updated = { ...task, ...normalizePosition(date, slot) };
      next = next.map(item => item.id === task.id ? updated : item);
      result.changes.push({ taskId: task.id, title: task.title, from: taskPosition(task, date), to: taskPosition(updated, date), reason: '完成前一事项后，按原顺序提前到空闲时段' });
      cursor = slot + task.duration + settings.buffer;
    } else cursor = Math.max(cursor, originalStart + task.duration + settings.buffer);
  }
  return { ...result, tasks: next, finish: Math.max(now, ...next.filter(task => !task.completed && !isQuick(task)
    && inPlanningDay(task, date, settings) && task.start !== null).map(task => relativeStart(task, date)! + task.duration)) };
}
