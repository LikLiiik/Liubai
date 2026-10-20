import type { Change, PlanMode, PlanResult, RescueRequest, Settings, Task } from './types.ts';
import { clock, nextDay, taskPosition } from './utils.ts';
import { deadlineLimit, inPlanningDay, LATEST_END, normalizePosition, occupiedDuration, relativeStart, validSettings } from './time.ts';
import { validDate } from './week.ts';
import { isQuick } from './quick.ts';

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
  const busy = mergeIntervals(tasks.filter(t => !isQuick(t) && t.fixed && relativeStart(t, date) !== null)
    .map(t => ({ start: Math.max(from, relativeStart(t, date)!), end: Math.min(to, relativeStart(t, date)! + occupiedDuration(t)) })));
  return Math.max(0, to - from - busy.reduce((sum, item) => sum + item.end - item.start, 0));
}

export function findSlot(duration: number, cursor: number, limit: number, busy: Interval[]): number | null {
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
  return (relativeStart(a, date) ?? 1440) - (relativeStart(b, date) ?? 1440);
}

export function activeInterruption(tasks: Task[], date: string, now: number): Task | undefined {
  return tasks.find(task => task.fixed && !task.completed && task.date && task.start !== null
    && (task.rescueInterruption === true || /^interruption-\d{4}-\d{2}-\d{2}-\d+$/.test(task.id)
      && task.title === '临时事项' && task.notes === '通过一键救场加入')
    && relativeStart(task, date)! <= now && relativeStart(task, date)! + task.duration > now);
}

export function createPlan(original: Task[], settings: Settings, request: RescueRequest): PlanResult {
  const tasks = original.map(task => ({ ...task }));
  if (!Number.isInteger(request.now) || request.now < 0 || request.now >= LATEST_END
    || !Number.isInteger(request.minutes) || request.minutes < 5 || request.minutes > 720
    || !validSettings(settings) || !validDate(request.date)
    || !['interruption', 'overrun', 'lowEnergy', 'rebalance'].includes(request.reason)
    || !['balanced', 'boundary', 'focus'].includes(request.mode)) {
    return { sourceTasks: original, sourceSettings: settings, tasks, changes: [], warnings: ['时间参数无效，请检查时长和一天的边界。'], deferred: 0, finish: 0, extension: 0, valid: false };
  }
  const warnings: string[] = [];
  const changes: Change[] = [];
  const { date, mode } = request;
  const now = Math.max(settings.dayStart, request.now);
  let valid = true;
  let deferred = 0;
  const extensionLimit = mode === 'balanced' && request.reason !== 'lowEnergy' ? 60 : 0;
  const limit = Math.min(settings.dayEnd > 1440 ? LATEST_END : 1440, settings.dayEnd + extensionLimit);

  if (request.reason === 'interruption') {
    const active = activeInterruption(tasks, date, request.now);
    const start = active ? relativeStart(active, date)! + active.duration : request.now;
    const end = start + request.minutes;
    const collisions = tasks.filter(t => !isQuick(t) && occupiedDuration(t) > 0 && t.id !== active?.id && (t.fixed || t.completed) && relativeStart(t, date) !== null && relativeStart(t, date)! < end && relativeStart(t, date)! + occupiedDuration(t) > start);
    if (end > (settings.dayEnd > 1440 ? LATEST_END : 1440)) { warnings.push('临时事项超出当前一天的范围，请调整时长。'); valid = false; }
    if (active && active.duration + request.minutes > 720) { warnings.push('单项临时事项累计不能超过 12 小时，请先结束当前事项。'); valid = false; }
    if (collisions.length) {
      warnings.push(`临时事项与已保留事项「${collisions.map(t => t.title).join('、')}」冲突，请先处理固定或已完成事项。`);
      valid = false;
    }
    if (active) {
      active.duration += request.minutes;
      active.rescueInterruption = true;
      const previous = original.find(task => task.id === active.id)!;
      changes.push({ taskId: active.id, title: active.title, from: `${clock(relativeStart(previous, date)!)}–${clock(start)}`,
        to: `${clock(relativeStart(active, date)!)}–${clock(end)}`, reason: `继续预留 ${request.minutes} 分钟` });
    } else {
      const baseId = `interruption-${date}-${request.now}`;
      let id = baseId, suffix = 1;
      while (tasks.some(task => task.id === id)) id = `${baseId}-${suffix++}`;
      tasks.push({ id, title: '临时事项', notes: '通过一键救场加入', duration: request.minutes, rescueInterruption: true,
      category: 'work', priority: 'high', important: false, fixed: true, completed: false,
      ...normalizePosition(date, request.now), deadline: null, postponed: 0 });
      changes.push({ taskId: id, title: '临时事项', from: '新增', to: `今天 ${clock(request.now)}–${clock(end)}`, reason: '先为临时事项预留时间' });
    }
  }

  if (request.reason === 'overrun') {
    const task = tasks.find(t => !isQuick(t) && t.id === request.taskId && inPlanningDay(t, date, settings) && !t.fixed && !t.completed);
    if (!task) { warnings.push('请选择一项尚未完成的灵活任务。'); valid = false; }
    else task.duration = request.minutes;
  }

  const fixed = tasks.filter(t => !isQuick(t) && occupiedDuration(t) > 0 && t.fixed && relativeStart(t, date) !== null && relativeStart(t, date)! < limit && relativeStart(t, date)! + occupiedDuration(t) > 0);
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      if (relativeStart(fixed[i], date)! < relativeStart(fixed[j], date)! + occupiedDuration(fixed[j]) && relativeStart(fixed[j], date)! < relativeStart(fixed[i], date)! + occupiedDuration(fixed[i])) {
        const message = `保留已有固定事项「${fixed[i].title}」与「${fixed[j].title}」的重叠安排，其他任务避开这段时间。`;
        if (!warnings.includes(message)) warnings.push(message);
      }
    }
  }
  const candidates = tasks.filter(t => !isQuick(t) && inPlanningDay(t, date, settings) && !t.fixed && !t.completed).sort((a, b) => {
    if (request.reason === 'overrun') {
      if (a.id === request.taskId) return -1;
      if (b.id === request.taskId) return 1;
    }
    return compareTasks(a, b, mode, date);
  });
  const candidateIds = new Set(candidates.map(task => task.id));
  const occupied = tasks.filter(t => !isQuick(t) && occupiedDuration(t) > 0 && t.start !== null && !candidateIds.has(t.id) && t.date)
    .map(t => ({ start: relativeStart(t, date)! - (t.fixed ? 0 : settings.buffer), end: relativeStart(t, date)! + occupiedDuration(t) + (t.fixed ? 0 : settings.buffer) }));
  // Low-energy mode reserves half of the remaining free time for recovery.
  let effortBudget = request.reason === 'lowEnergy' ? Math.floor(freeMinutes(tasks, date, now, settings.dayEnd) / 2) : Infinity;
  for (const task of candidates) {
    const previous = original.find(item => item.id === task.id)!;
    const slot = task.duration <= effortBudget ? findSlot(task.duration, now, Math.min(limit, deadlineLimit(task, date)), occupied) : null;
    if (slot === null) {
      if (task.deadline && task.deadline <= date) {
        warnings.push(task.deadline < date ? `「${task.title}」已超过截止日期 ${task.deadline}，请先调整截止日期。`
          : `「${task.title}」今天到期，但剩余时间无法容纳；需要减少其他任务或调整截止时间。`);
        valid = false;
        task.date = date;
        task.start = null;
      } else {
        task.date = nextDay(date);
        task.start = null;
        task.postponed += 1;
        deferred += 1;
      }
    } else {
      Object.assign(task, normalizePosition(date, slot));
      effortBudget -= task.duration;
      occupied.push({ start: slot - settings.buffer, end: slot + task.duration + settings.buffer });
    }
    if (previous.start !== task.start || previous.date !== task.date || previous.duration !== task.duration) {
      changes.push({ taskId: task.id, title: task.title, from: taskPosition(previous, date),
          to: taskPosition(task, date), reason: slot === null && task.start === null && !(task.deadline && task.deadline <= date) ? '今天容量不足，移到明天待安排'
          : task.start === null ? '截止时间存在风险，需要你决定'
          : request.reason === 'overrun' && task.id === request.taskId ? `按你确认的剩余 ${request.minutes} 分钟继续安排`
          : task.deadline && task.deadline <= date ? '优先保护今天到期的任务'
          : mode === 'focus' && task.important ? '优先保住今日重点' : '避开固定事项，并留出切换时间' });
    }
  }
  const scheduled = tasks.filter(t => !isQuick(t) && inPlanningDay(t, date, settings) && t.start !== null && !t.completed);
  const finish = Math.max(request.now, ...scheduled.map(t => relativeStart(t, date)! + t.duration));
  const extension = Math.max(0, finish - settings.dayEnd);
  if (extension) warnings.push(`该方案预计比结束时间晚 ${extension} 分钟。`);
  return { sourceTasks: original, sourceSettings: settings, tasks, changes, warnings, deferred, finish, extension, valid };
}

export function scheduleTask(tasks: Task[], taskId: string, settings: Settings, date: string, now: number): Task[] | null {
  const task = tasks.find(item => item.id === taskId);
  if (!task || isQuick(task) || task.fixed || task.completed || !validSettings(settings) || !Number.isInteger(now) || now < 0 || now >= LATEST_END
    || !validDate(date) || !Number.isInteger(task.duration) || task.duration < 5 || task.duration > 720
    || tasks.filter(item => item.id === taskId).length !== 1) return null;
  const occupied = tasks.filter(t => !isQuick(t) && occupiedDuration(t) > 0 && t.id !== taskId && t.date && t.start !== null)
    .map(t => ({ start: relativeStart(t, date)! - (t.fixed ? 0 : settings.buffer), end: relativeStart(t, date)! + occupiedDuration(t) + (t.fixed ? 0 : settings.buffer) }));
  const slot = findSlot(task.duration, Math.max(now, settings.dayStart), Math.min(settings.dayEnd, deadlineLimit(task, date)), occupied);
  if (slot === null) return null;
  return tasks.map(item => item.id === taskId ? { ...item, ...normalizePosition(date, slot) } : item);
}
