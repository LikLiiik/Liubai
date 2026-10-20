import type { Task } from './types.ts';
import { dateKey } from './utils.ts';

export function isQuick(task: Pick<Task, 'kind'>): boolean { return task.kind === 'quick'; }

// Point reminders use zero duration; ordinary tasks must still reserve time.
export function validTaskTiming(task: Task): boolean {
  if (isQuick(task)) return task.duration === 0 && typeof task.date === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(task.date) && dateKey(new Date(`${task.date}T12:00:00`)) === task.date && task.start !== null
    && Number.isInteger(task.start) && task.start >= 0 && task.start < 1440
    && !task.fixed && !task.important && task.deadline === null && !task.courseImport && !task.rescueInterruption;
  return (task.kind === undefined || task.kind === 'task')
    && Number.isFinite(task.duration) && task.duration > 0 && task.duration <= 720;
}
