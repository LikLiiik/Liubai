import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../src/types.ts';
import { createEmpty } from '../src/seed.ts';
import { isQuick, validTaskTiming } from '../src/quick.ts';
import { saveTaskDraft, type TaskDraft } from '../src/taskDraft.ts';
import { createPlan, freeMinutes, scheduleTask } from '../src/scheduler.ts';
import { calendarSegments, inPlanningDay, overlaps } from '../src/time.ts';
import { freeWindows, localMoment } from '../src/inboxReminders.ts';
import { layoutDay, moveTaskTo } from '../src/week.ts';
import { createNotificationSync, type LocalNotification, type NotificationDriver } from '../src/notificationSync.ts';
import { applyPlanToData } from '../src/planApply.ts';

const day = '2026-10-21';
const settings = { dayStart: 540, dayEnd: 1080, buffer: 10, notificationsEnabled: true };
const context = { today: day, now: 600, calendarToday: day, calendarNow: 600 };
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, notes: '', category: 'life', priority: 'normal', important: false,
  fixed: false, completed: false, date: day, start: 660, duration: 30, deadline: null, postponed: 0, ...extra });
const quick = (id = 'quick', extra: Partial<Task> = {}): Task => task(id, { kind: 'quick', duration: 0, ...extra });
const draft = (extra: Partial<TaskDraft> = {}): TaskDraft => ({ id: 'quick', kind: 'quick', title: '给花浇水', notes: '', duration: '', category: 'life',
  priority: 'high', important: true, fixed: true, date: day, time: '1100', deadline: 'invalid', ...extra });

test('quick item saves a point reminder without duration, deadline or priority, alongside existing work', () => {
  const meeting = task('meeting', { fixed: true, start: 600, duration: 120 });
  const saved = saveTaskDraft([meeting], settings, draft(), context);
  assert.equal(saved.kind, 'saved');
  if (saved.kind !== 'saved') throw new Error();
  const point = saved.tasks[1];
  assert.equal(isQuick(point), true);
  assert.equal(validTaskTiming(point), true);
  assert.equal(point.duration, 0);
  assert.equal(point.start, 660);
  assert.equal(point.fixed, false);
  assert.equal(point.important, false);
  assert.equal(point.deadline, null);
  assert.strictEqual(saved.tasks[0], meeting);
  assert.equal(overlaps(point, meeting), false);
  assert.equal(saveTaskDraft([point], settings, draft({ id: 'another' }), context).kind, 'saved', 'multiple reminders may share a point');
});

test('quick creation validates the full date and future time, including midnight, without relaxing ordinary duration limits', () => {
  for (const extra of [{ date: null }, { date: '2026-02-30' }, { date: '2026-10-20' }, { time: '1000' }, { time: '0960' }, { time: '2400' }]) {
    assert.equal(saveTaskDraft([], settings, draft(extra), context).kind, 'error');
  }
  const saved = saveTaskDraft([], settings, draft({ date: '2026-10-22', time: '0000' }), { ...context, calendarNow: 1439 });
  assert.equal(saved.kind, 'saved');
  assert.equal(saveTaskDraft([], settings, draft({ kind: 'task', duration: '0', deadline: '' }), context).kind, 'error');
});

test('editing an elapsed quick item keeps completion and metadata but rescheduling must use a future point', () => {
  const original = quick('quick', { start: 540, completed: true, completedAt: day + 'T09:01:00' });
  const result = saveTaskDraft([original], settings, draft({ time: '0900', notes: '已浇水' }), context, original);
  assert.equal(result.kind, 'saved');
  if (result.kind === 'saved') {
    assert.equal(result.tasks[0].completedAt, original.completedAt);
    assert.equal(result.tasks[0].completed, true);
    assert.equal(result.tasks[0].notes, '已浇水');
  }
  assert.equal(saveTaskDraft([original], settings, draft({ time: '0930' }), context, original).kind, 'error');
  assert.equal(saveTaskDraft([original], settings, draft({ kind: 'task' }), context, original).kind, 'error');
});

test('stored point reminders and zero-duration calendar segments survive serialization with no midnight continuation', () => {
  const point = JSON.parse(JSON.stringify(quick('midnight', { start: 1439 })));
  assert.equal(validTaskTiming(point), true);
  assert.deepEqual(calendarSegments(point).map(segment => [segment.date, segment.start, segment.duration]), [[day, 1439, 0]]);
  assert.equal(inPlanningDay(quick('early', { date: '2026-10-22', start: 30 }), day, { ...settings, dayEnd: 1560 }), true);
  for (const extra of [{ duration: 5 }, { date: null }, { date: '2026-02-30' }, { start: null }, { start: 1440 }, { fixed: true }, { deadline: day }, { kind: 'unknown' }]) {
    assert.equal(validTaskTiming({ ...point, ...extra }), false);
  }
  assert.equal(validTaskTiming(task('normal')), true);
  assert.equal(validTaskTiming(task('invalid', { duration: 0 })), false);
});

test('quick points create no busy intervals, buffer, or capacity usage and never receive automatic slots', () => {
  const points = [quick('a', { start: 660 }), quick('b', { start: 665 }), quick('done', { start: 670, completed: true })];
  assert.equal(freeMinutes(points, day, 600, 1080), 480);
  assert.deepEqual(freeWindows(points, settings, day), [{ start: 540, end: 1080 }]);
  const waiting = task('work', { date: null, start: null, duration: 120 });
  assert.equal(scheduleTask([...points, waiting], waiting.id, settings, day, 600)!.at(-1)!.start, 600);
  assert.equal(scheduleTask(points, 'a', settings, day, 600), null);
});

test('every rescue mode leaves future and completed quick points untouched and does not push the estimated finish', () => {
  const points = [quick('late', { start: 1430 }), quick('inside', { start: 610 }), quick('done', { start: 620, completed: true })];
  for (const reason of ['interruption', 'rebalance', 'lowEnergy', 'overrun'] as const) {
    const source = [...points, task('work', { start: 600, duration: 30 })];
    const plan = createPlan(source, settings, { reason, date: day, now: 600, minutes: 30, mode: 'boundary', taskId: 'work' });
    assert.equal(plan.valid, true, reason);
    for (const point of points) assert.deepEqual(plan.tasks.find(item => item.id === point.id), point);
    assert.ok(plan.finish < 1080, 'an evening point is not counted as overtime work');
    assert.equal(plan.changes.some(change => points.some(point => point.id === change.taskId)), false);
  }
  assert.equal(createPlan(points, settings, { reason: 'overrun', date: day, now: 600, minutes: 30, mode: 'boundary', taskId: 'inside' }).valid, false);
});

test('week points can move across occupied and non-preferred times, preserve kind and support undo without losing duration rules', () => {
  const point = quick();
  const data = { ...createEmpty(settings), tasks: [point, task('meeting', { fixed: true, start: 1320, duration: 90 })] };
  const moved = moveTaskTo(data.tasks, point.id, { date: day, start: 1350 }, settings, day, false, false, false, 600);
  assert.equal(moved.ok, true);
  if (!moved.ok) throw new Error();
  assert.equal(moved.conflicts.length, 0);
  assert.equal(moved.tasks[0].duration, 0);
  assert.equal(moved.tasks[0].kind, 'quick');
  const applied = applyPlanToData(data, { sourceTasks: data.tasks, tasks: moved.tasks, changes: [moved.change!], valid: true, deferred: 0, finish: 1350, extension: 0, warnings: [] },
    { id: 'move', title: '调整提醒', date: day, createdAt: '' });
  assert.deepEqual(applied.data.history[0].snapshot, data.tasks);
  for (const position of [{ date: day, start: 600 }, { date: '2026-10-20', start: 1300 }]) {
    assert.equal(moveTaskTo(data.tasks, point.id, position, settings, day, false, false, false, 600).ok, false);
  }
  assert.equal(moveTaskTo([quick('done', { completed: true })], 'done', { date: day, start: 700 }, settings, day).ok, false);
});

test('visual layout gives simultaneous point cards separate lanes without changing their scheduling duration', () => {
  const source = [quick('a'), quick('b'), task('meeting', { fixed: true, duration: 60 })];
  const before = JSON.stringify(source);
  const placed = layoutDay(source, 36);
  assert.equal(new Set(placed.map(item => item.lane)).size, 3);
  assert.ok(placed.every(item => item.lanes === 3));
  assert.equal(JSON.stringify(source), before);
});

test('quick notifications use the exact point; edits replace old requests, completion/delete cancel and permission remains required', async () => {
  const scheduled = new Map<string, { notification: LocalNotification; signature: string }>();
  const cancelled: string[] = [];
  let granted = true;
  const driver: NotificationDriver = {
    now: () => localMoment(day, 600), permission: async () => granted, readLedger: async () => '{}', writeLedger: async () => {},
    pending: async () => [...scheduled].map(([id, item]) => ({ id, signature: item.signature })),
    cancel: async id => { cancelled.push(id); scheduled.delete(id); },
    schedule: async (notification, signature) => { scheduled.set(notification.id, { notification, signature }); },
  };
  const sync = createNotificationSync(driver);
  const data = { ...createEmpty(settings), tasks: [quick('a'), quick('b')] };
  await sync(data);
  assert.equal(scheduled.size, 2);
  assert.equal(scheduled.get('liubai-a')!.notification.at, localMoment(day, 660).getTime());
  assert.equal(scheduled.get('liubai-a')!.notification.data.kind, 'quick');
  assert.equal(scheduled.get('liubai-a')!.notification.title, '留白 · 顺手做件小事');
  data.tasks[0] = { ...data.tasks[0], start: 720 };
  await sync(data);
  assert.ok(cancelled.includes('liubai-a'));
  assert.equal(scheduled.get('liubai-a')!.notification.at, localMoment(day, 720).getTime());
  data.tasks[0] = { ...data.tasks[0], completed: true };
  data.tasks.splice(1, 1);
  await sync(data);
  assert.equal(scheduled.size, 0);
  data.tasks = [quick('future'), quick('past', { start: 540 })];
  granted = false;
  await sync(data);
  assert.equal(scheduled.size, 0);
  granted = true;
  await sync(data);
  assert.deepEqual([...scheduled.keys()], ['liubai-future']);
  await sync({ ...data, demo: true });
  assert.equal(scheduled.size, 0);
  await sync({ ...data, settings: { ...settings, notificationsEnabled: false } });
  assert.equal(scheduled.size, 0);
});
