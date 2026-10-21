import type { AppData, Task } from './types.ts';
import { previewCompletionUndo, type CompletionUndoChoice, type CompletionUndoPreview } from './completionUndo.ts';
import { finishesByDeadline, normalizePosition, planningContext, shiftDate, validSettings } from './time.ts';
import { outsidePreferredHours, validDate, type TaskPosition } from './week.ts';
import { dateKey, taskPosition } from './utils.ts';
import { scheduleTask } from './scheduler.ts';
import { isQuick } from './quick.ts';
import { localMoment } from './inboxReminders.ts';
import { applyPlanToData } from './planApply.ts';

export type CompletionRescheduleRequest = { taskId: string; choice: CompletionUndoChoice; deadline: string | null;
  placement: { mode: 'auto' } | { mode: 'manual'; date: string; start: number } };
export type CompletionReschedulePreview = CompletionUndoPreview & { position: TaskPosition | null; error?: string; outside: boolean; needsConsent: boolean };

// Use the original planned end, not the shortened occupancy of an early completion.
export function completionTimePassed(task: Task | undefined, moment: Date): boolean {
  if (!task?.completed || !task.date || task.start === null || !validDate(task.date)) return false;
  return localMoment(task.date, task.start + (isQuick(task) ? 0 : task.duration)).getTime() <= moment.getTime();
}

export function previewCompletionReschedule(data: Pick<AppData, 'tasks' | 'history' | 'settings'>,
  request: CompletionRescheduleRequest, moment: Date): CompletionReschedulePreview {
  const initial = previewCompletionUndo(data, request.taskId, request.choice);
  const result: CompletionReschedulePreview = { ...initial, valid: false, position: null, outside: false, needsConsent: false,
    key: JSON.stringify([initial.key, data.settings, request]) };
  const fail = (error: string) => ({ ...result, error });
  const source = data.tasks.find(task => task.id === request.taskId);
  if (!source?.completed) return fail('此事件的完成状态已变更，请重新查看日程。');
  if (!Number.isFinite(moment.getTime()) || !validSettings(data.settings) || !['keep', 'cancel-advance'].includes(request.choice)) return fail('安排参数无效，请重新选择。');
  if (!completionTimePassed(source, moment)) return fail('原时段尚未结束，请重新选择撤销完成。');
  if (request.deadline !== null && !validDate(request.deadline)) return fail('截止日期无效，请重新选择。');
  let position: TaskPosition | null = null;
  if (request.placement.mode === 'manual') {
    const { date, start } = request.placement;
    if (!validDate(date) || !Number.isInteger(start) || start < 0 || start >= 1440) return fail('请选择有效的日期、小时和分钟。');
    if (localMoment(date, start).getTime() <= moment.getTime()) return fail('重新安排的时间应晚于当前时间。');
    if (!finishesByDeadline(date, start, source.duration, request.deadline)) return fail('安排超过截止日期，请调整开始时间或截止日期。');
    position = { date, start };
  } else if (request.placement.mode === 'auto') {
    // Restore eligible followers first, with the source temporarily unassigned.
    // The selected gap must fit that final arrangement, not an obsolete snapshot.
    const undo = previewCompletionUndo(data, source.id, request.choice, { date: null, start: null, deadline: request.deadline });
    const context = planningContext(dateKey(moment), moment.getHours() * 60 + moment.getMinutes() + 1, data.settings);
    const freeSource = undo.tasks.map(task => task.id === source.id ? { ...task, fixed: false } : task);
    for (let offset = 0; offset < 30 && !position; offset++) {
      const day = shiftDate(context.date, offset);
      const now = offset ? data.settings.dayStart : context.now;
      if (request.deadline && day > request.deadline) break;
      if (isQuick(source)) {
        const start = Math.max(now, data.settings.dayStart);
        if (start < data.settings.dayEnd) position = normalizePosition(day, start);
      } else {
        const scheduled = scheduleTask(freeSource, source.id, data.settings, day, now)?.find(task => task.id === source.id);
        if (scheduled?.date && scheduled.start !== null) position = { date: scheduled.date, start: scheduled.start };
      }
    }
    if (!position) return fail('未来 30 天内或截止日期前没有足够空档，可手动选择时间或调整截止日期。');
  } else return fail('请选择安排方式。');
  if (!finishesByDeadline(position.date, position.start, source.duration, request.deadline)) return fail('安排超过截止日期，请调整开始时间或截止日期。');
  const undo = previewCompletionUndo(data, source.id, request.choice, { ...position, deadline: request.deadline });
  if (request.placement.mode === 'auto' && undo.conflicts.length) return fail('可用时段已变化，请重新查找空闲时间。');
  const outside = !isQuick(source) && outsidePreferredHours(position.start, source.duration, data.settings);
  const key = JSON.stringify([undo.key, data.settings, request, position]);
  const updated = undo.tasks.find(task => task.id === source.id)!;
  return { ...undo, key, valid: true, position, outside, needsConsent: undo.conflicts.length > 0 || outside,
    consentKey: JSON.stringify([key, undo.consentKey, outside]),
    changes: [{ taskId: source.id, title: source.title, from: `${taskPosition(source, dateKey(moment))} · 已完成`,
      to: taskPosition(updated, dateKey(moment)), reason: '撤销完成后重新安排' }, ...undo.changes] };
}

export function applyCompletionReschedule(data: AppData, request: CompletionRescheduleRequest, previewKey: string,
  moment: Date, entryId: string, consentKey?: string): { data: AppData; error?: string } {
  const preview = previewCompletionReschedule(data, request, moment);
  if (!preview.valid) return { data, error: preview.error };
  if (preview.key !== previewKey) return { data, error: '日程或当前时间已变化，请重新核对安排预览。' };
  if (preview.needsConsent && preview.consentKey !== consentKey) return { data, error: '本次安排存在重叠或超出偏好时段，请先确认。' };
  return applyPlanToData(data, { ...preview, sourceTasks: data.tasks, sourceSettings: data.settings,
    warnings: [], finish: 0, extension: 0, deferred: 0 }, { id: entryId, date: dateKey(moment), createdAt: moment.toISOString(),
    title: `撤销完成并重新安排：${data.tasks.find(task => task.id === request.taskId)!.title}` });
}
