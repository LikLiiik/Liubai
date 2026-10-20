import type { AppData, Change, CompletionAdvance, CompletionMove, Task } from './types.ts';
import { isQuick } from './quick.ts';
import { overlaps } from './time.ts';
import { overlapConsentKey, validDate } from './week.ts';
import { taskPosition } from './utils.ts';

export type CompletionUndoChoice = 'keep' | 'cancel-advance';
type Source = Pick<AppData, 'tasks' | 'history'>;
export type CompletionUndoPreview = { tasks: Task[]; key: string; conflicts: Task[]; consentKey: string; changes: Change[];
  skipped: { taskId: string; title: string; reason: string }[]; valid: boolean };

export function validCompletionAdvance(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const record = value as CompletionAdvance;
  const position = (value: CompletionMove['from']) => !!value && typeof value.date === 'string' && validDate(value.date)
    && Number.isInteger(value.start) && value.start >= 0 && value.start < 1440;
  return typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt)) && Array.isArray(record.moves)
    && record.moves.length > 0 && new Set(record.moves.map(move => move?.taskId)).size === record.moves.length
    && record.moves.every(move => !!move && typeof move.taskId === 'string' && !!move.taskId && position(move.from) && position(move.to)
      && Number.isInteger(move.duration) && move.duration > 0 && move.duration <= 720
      && (move.deadline === null || typeof move.deadline === 'string' && validDate(move.deadline)));
}

export function completionAdvanceFor(data: Source, taskId: string): CompletionAdvance | null {
  const source = data.tasks.find(task => task.id === taskId);
  if (!source?.completed || !source.completedAt) return null;
  if (source.completionAdvance && validCompletionAdvance(source.completionAdvance)
    && source.completionAdvance.completedAt === source.completedAt) return source.completionAdvance;
  // Older versions kept the relationship only in adjustment snapshots.
  const entry = data.history.find(entry => {
    if (typeof entry.title !== 'string' || !Array.isArray(entry.snapshot) || !Array.isArray(entry.appliedTasks) || !Array.isArray(entry.changes)) return false;
    const latest = Math.max(...entry.snapshot.filter(task => task.completed && task.completedAt).map(task => Date.parse(task.completedAt!)).filter(Number.isFinite));
    const matches = entry.snapshot.filter(task => task.completed && task.completedAt && Date.parse(task.completedAt) === latest
      && entry.title === `完成后提前安排：${task.title}`);
    return matches.length === 1 && matches[0].id === taskId && matches[0].completedAt === source.completedAt;
  });
  if (!entry) return null;
  const moves: CompletionMove[] = [];
  for (const change of entry.changes) {
    const before = entry.snapshot.find(task => task.id === change.taskId);
    const after = entry.appliedTasks.find(task => task.id === change.taskId);
    if (change.taskId !== taskId && before?.date && before.start !== null && after?.date && after.start !== null && !after.fixed && !isQuick(after)) {
      moves.push({ taskId: after.id, from: { date: before.date, start: before.start }, to: { date: after.date, start: after.start }, duration: after.duration, deadline: after.deadline });
    }
  }
  const record = { completedAt: source.completedAt, moves };
  return validCompletionAdvance(record) ? record : null;
}

export function previewCompletionUndo(data: Source, taskId: string, choice: CompletionUndoChoice): CompletionUndoPreview {
  const source = data.tasks.find(task => task.id === taskId);
  const advance = completionAdvanceFor(data, taskId);
  const key = JSON.stringify([taskId, choice, data.tasks, advance]);
  const result: CompletionUndoPreview = { tasks: data.tasks, key, changes: [], skipped: [], conflicts: [], consentKey: '', valid: !!source?.completed };
  if (!source?.completed) return result;
  const restored = { ...source, completed: false, completedAt: undefined, completionAdvance: undefined };
  const moves = new Map<string, CompletionMove>();
  if (choice === 'cancel-advance') for (const move of advance?.moves ?? []) {
    const task = data.tasks.find(task => task.id === move.taskId);
    const reason = !task ? '事项已删除' : task.completed ? '事项已完成' : task.fixed || isQuick(task) ? '事项类型已变更'
      : task.date !== move.to.date || task.start !== move.to.start || task.duration !== move.duration || task.deadline !== move.deadline ? '安排已修改' : '';
    if (reason) result.skipped.push({ taskId: move.taskId, title: task?.title ?? '已删除事项', reason });
    else moves.set(move.taskId, move);
  }
  const build = () => data.tasks.map(task => task.id === taskId ? restored : moves.has(task.id) ? { ...task, ...moves.get(task.id)!.from } : task);
  let next = build();
  // Removing an unsafe restoration can expose another collision, so check until stable.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id] of [...moves]) {
      const task = next.find(task => task.id === id)!;
      if (next.some(other => other.id !== id && overlaps(task, other))) {
        moves.delete(id); result.skipped.push({ taskId: id, title: task.title, reason: '原时段已有冲突' }); changed = true;
      }
    }
    if (changed) next = build();
  }
  result.tasks = next;
  for (const [id] of moves) {
    const before = data.tasks.find(task => task.id === id)!;
    const after = next.find(task => task.id === id)!;
    result.changes.push({ taskId: id, title: before.title, from: taskPosition(before, source.date ?? ''), to: taskPosition(after, source.date ?? ''), reason: '撤销完成时取消该次提前' });
  }
  result.conflicts = next.filter(other => other.id !== taskId && overlaps(restored, other));
  result.consentKey = overlapConsentKey(restored, result.conflicts);
  return result;
}
