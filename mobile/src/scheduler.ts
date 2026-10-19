import type { Change, PlanMode, PlanResult, RescueRequest, Settings, Task } from './types.ts';
import { clock, nextDay, taskPosition } from './utils.ts';

type Interval = { start: number; end: number };

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(item => item.end > item.start).map(item => ({ ...item })).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else merged.push(item);
  }
  return merged;
}

export function freeMinutes(tasks: Task[], date: string, from: number, to: number): number {
  const busy = mergeIntervals(tasks.filter(t => t.date === date && t.fixed && t.start !== null)
    .map(t => ({ start: Math.max(from, t.start!), end: Math.min(to, t.start! + t.duration) })));
  return Math.max(0, to - from - busy.reduce((sum, item) => sum + item.end - item.start, 0));
}

function findSlot(duration: number, cursor: number, limit: number, busy: Interval[]): number | null {
  let start = cursor;
  for (const block of mergeIntervals(busy)) {
    if (block.end <= start) continue;
    if (start + duration <= block.start) break;
    start = block.end;
  }
  return start + duration <= limit ? start : null;
}

function compareTasks(a: Task, b: Task, mode: PlanMode, date: string): number {
  const due = (task: Task) => task.deadline !== null && task.deadline <= date ? 1 : 0;
  if (due(a) !== due(b)) return due(b) - due(a);
  if (mode === 'focus' && a.important !== b.important) return Number(b.important) - Number(a.important);
  const ranks = { high: 3, normal: 2, low: 1 };
  if (ranks[a.priority] !== ranks[b.priority]) return ranks[b.priority] - ranks[a.priority];
  if (a.important !== b.important) return Number(b.important) - Number(a.important);
  return (a.start ?? 1440) - (b.start ?? 1440);
}

export function createPlan(original: Task[], settings: Settings, request: RescueRequest): PlanResult {
  const tasks = original.map(task => ({ ...task }));
  if (!Number.isInteger(request.now) || request.now < 0 || request.now >= 1440
    || !Number.isInteger(request.minutes) || request.minutes < 5 || request.minutes > 720
    || settings.dayStart < 0 || settings.dayEnd >= 1440 || settings.dayStart >= settings.dayEnd
    || !Number.isFinite(settings.buffer) || settings.buffer < 0) {
    return { tasks, changes: [], warnings: ['时间参数无效，请检查时长和一天的边界。'], deferred: 0, finish: 0, extension: 0, valid: false };
  }
  const warnings: string[] = [];
  const changes: Change[] = [];
  const { date, mode } = request;
  const now = Math.max(settings.dayStart, Math.min(1439, request.now));
  let valid = true;
  let deferred = 0;
  const extensionLimit = mode === 'balanced' && request.reason !== 'lowEnergy' ? 60 : 0;
  const limit = Math.min(1439, settings.dayEnd + extensionLimit);

  if (request.reason === 'interruption') {
    const end = now + request.minutes;
    const collisions = tasks.filter(t => t.date === date && t.fixed && t.start !== null && t.start < end && t.start + t.duration > now);
    if (end > 1440) { warnings.push('临时事项跨越午夜，请缩短时长或单独添加跨日事项。'); valid = false; }
    if (collisions.length) {
      warnings.push(`临时事项与固定事项「${collisions.map(t => t.title).join('、')}」冲突，请先处理固定时间。`);
      valid = false;
    }
    tasks.push({ id: `interruption-${date}-${now}`, title: '临时事项', notes: '通过一键救场加入', duration: request.minutes,
      category: 'work', priority: 'high', important: false, fixed: true, completed: false,
      date, start: now, deadline: null, postponed: 0 });
    changes.push({ taskId: `interruption-${date}-${now}`, title: '临时事项', from: '新增', to: `今天 ${clock(now)}–${clock(end)}`, reason: '先为临时事项预留时间' });
  }

  if (request.reason === 'overrun') {
    const task = tasks.find(t => t.id === request.taskId && t.date === date && !t.fixed && !t.completed);
    if (!task) { warnings.push('请选择一项尚未完成的灵活任务。'); valid = false; }
    else task.duration = request.minutes;
  }

  const fixed = tasks.filter(t => t.date === date && t.fixed && t.start !== null);
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      if (fixed[i].start! < fixed[j].start! + fixed[j].duration && fixed[j].start! < fixed[i].start! + fixed[i].duration) {
        valid = false;
        const message = `固定事项「${fixed[i].title}」与「${fixed[j].title}」时间重叠。`;
        if (!warnings.includes(message)) warnings.push(message);
      }
    }
  }
  const occupied = tasks.filter(t => t.date === date && t.start !== null && (t.fixed || t.completed))
    .map(t => ({ start: t.start! - (t.fixed ? 0 : settings.buffer), end: t.start! + t.duration + (t.fixed ? 0 : settings.buffer) }));
  const candidates = tasks.filter(t => t.date === date && !t.fixed && !t.completed).sort((a, b) => {
    if (request.reason === 'overrun') {
      if (a.id === request.taskId) return -1;
      if (b.id === request.taskId) return 1;
    }
    return compareTasks(a, b, mode, date);
  });
  // Low-energy mode reserves half of the remaining free time for recovery.
  let effortBudget = request.reason === 'lowEnergy' ? Math.floor(freeMinutes(tasks, date, now, settings.dayEnd) / 2) : Infinity;
  for (const task of candidates) {
    const previous = original.find(item => item.id === task.id)!;
    const slot = task.duration <= effortBudget ? findSlot(task.duration, now, limit, occupied) : null;
    if (slot === null) {
      if (task.deadline && task.deadline <= date) {
        warnings.push(`「${task.title}」今天到期，但剩余时间无法容纳；需要减少其他任务或调整截止时间。`);
        valid = false;
        task.start = null;
      } else {
        task.date = nextDay(date);
        task.start = null;
        task.postponed += 1;
        deferred += 1;
      }
    } else {
      task.start = slot;
      effortBudget -= task.duration;
      occupied.push({ start: slot - settings.buffer, end: slot + task.duration + settings.buffer });
    }
    if (previous.start !== task.start || previous.date !== task.date || previous.duration !== task.duration) {
      changes.push({ taskId: task.id, title: task.title, from: taskPosition(previous, date),
        to: taskPosition(task, date), reason: task.date !== date ? '今天容量不足，移到明天待安排'
          : task.start === null ? '截止时间存在风险，需要你决定'
          : request.reason === 'overrun' && task.id === request.taskId ? `按你确认的剩余 ${request.minutes} 分钟继续安排`
          : task.deadline && task.deadline <= date ? '优先保护今天到期的任务'
          : mode === 'focus' && task.important ? '优先保住今日重点' : '避开固定事项，并留出切换时间' });
    }
  }
  const scheduled = tasks.filter(t => t.date === date && t.start !== null && !t.completed);
  const finish = Math.max(now, ...scheduled.map(t => t.start! + t.duration));
  const extension = Math.max(0, finish - settings.dayEnd);
  if (extension) warnings.push(`该方案预计比结束时间晚 ${extension} 分钟。`);
  return { tasks, changes, warnings, deferred, finish, extension, valid };
}

export function scheduleTask(tasks: Task[], taskId: string, settings: Settings, date: string, now: number): Task[] | null {
  const task = tasks.find(item => item.id === taskId);
  if (!task || task.fixed) return null;
  const occupied = tasks.filter(t => t.id !== taskId && t.date === date && t.start !== null)
    .map(t => ({ start: t.start! - (t.fixed ? 0 : settings.buffer), end: t.start! + t.duration + (t.fixed ? 0 : settings.buffer) }));
  const slot = findSlot(task.duration, Math.max(now, settings.dayStart), settings.dayEnd, occupied);
  if (slot === null) return null;
  return tasks.map(item => item.id === taskId ? { ...item, date, start: slot } : item);
}
