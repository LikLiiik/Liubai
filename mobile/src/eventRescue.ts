import type { PlanResult, RescueRequest, Settings, Task } from './types.ts';
import { createPlan } from './scheduler.ts';
import { isQuick } from './quick.ts';
import { taskPosition } from './utils.ts';

export function createEventRescuePlan(tasks: Task[], settings: Settings, request: RescueRequest, eventId: string, continuationId: string): PlanResult {
  const event = tasks.find(task => task.id === eventId);
  if (!event || event.completed || isQuick(event)) return { sourceTasks: tasks, sourceSettings: settings, tasks,
    changes: [], warnings: ['此事件已完成或已移除。'], deferred: 0, finish: request.now, extension: 0, valid: false };
  // Keep the original fixed event intact; explicitly schedule only its unfinished part.
  const targetId = event.fixed ? continuationId : event.id;
  const remaining: Task = { ...event, id: targetId, title: event.fixed ? `${event.title} · 继续` : event.title,
    fixed: false, date: request.date, start: null, duration: request.minutes,
    courseImport: event.fixed ? undefined : event.courseImport, rescueInterruption: undefined, completedAt: undefined, completionAdvance: undefined };
  const input = event.fixed ? [...tasks, remaining] : tasks.map(task => task.id === event.id ? remaining : task);
  const plan = createPlan(input, settings, { ...request, reason: 'overrun', taskId: targetId });
  plan.sourceTasks = tasks;
  plan.sourceSettings = settings;
  plan.changes = plan.changes.map(change => change.taskId === targetId ? { ...change,
    from: event.fixed ? '未完成部分' : taskPosition(event, request.date) } : change);
  const target = plan.tasks.find(task => task.id === targetId)!;
  if (!plan.changes.some(change => change.taskId === targetId) && (event.fixed || JSON.stringify(event) !== JSON.stringify(target))) {
    plan.changes.unshift({ taskId: targetId, title: target.title, from: event.fixed ? '未完成部分' : taskPosition(event, request.date),
      to: taskPosition(target, request.date), reason: `安排剩余 ${request.minutes} 分钟` });
  }
  return plan;
}
