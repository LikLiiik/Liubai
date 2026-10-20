import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task } from '../src/types.ts';
import { createAdvancePlan, setTaskCompletion } from '../src/completion.ts';
import { calendarSegments, occupiedDuration, overlaps, relativeStart } from '../src/time.ts';
import { createEmpty } from '../src/seed.ts';
import { applyPlanToData } from '../src/planApply.ts';
import { freeMinutes, scheduleTask } from '../src/scheduler.ts';
import { freeWindows, localMoment } from '../src/inboxReminders.ts';
import { createNotificationSync, type LocalNotification } from '../src/notificationSync.ts';

const day = '2026-10-21';
const settings = { dayStart: 540, dayEnd: 1080, buffer: 10 };
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, notes: '', duration: 30, category: 'work', priority: 'normal',
  important: false, fixed: false, completed: false, date: day, start: 600, deadline: null, postponed: 0, ...extra });
const finished = (extra: Partial<Task> = {}) => task('current', { duration: 60, completed: true, completedAt: localMoment(day, 620).toISOString(), ...extra });

test('completion records once without moving anything and repeating the same action is a no-op', () => {
  const source = [task('current', { duration: 60 }), task('next', { start: 700 })];
  const before = JSON.stringify(source);
  const completed = setTaskCompletion(source, 'current', true, localMoment(day, 620).toISOString()).tasks;
  assert.equal(completed[0].completed, true);
  assert.equal(completed[0].duration, 60);
  assert.equal(completed[1].start, 700);
  assert.strictEqual(completed[1], source[1]);
  assert.equal(JSON.stringify(source), before);
  assert.strictEqual(setTaskCompletion(completed, 'current', true, localMoment(day, 625).toISOString()).tasks, completed);
  assert.strictEqual(setTaskCompletion(completed, 'missing', true, 'invalid').tasks, completed);
});

test('preview advances only later flexible events in original order, respecting meetings and buffer', () => {
  const source = [finished(), task('next', { start: 700 }), task('later', { start: 750 }), task('meeting', { fixed: true, start: 680 }),
    task('quick', { kind: 'quick', duration: 0, start: 640 }), task('inbox', { date: null, start: null }),
    task('tomorrow', { date: '2026-10-22', start: 540 })];
  const before = JSON.stringify(source);
  const plan = createAdvancePlan(source, settings, 'current', day, 620);
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.changes.map(change => change.taskId), ['next', 'later']);
  assert.equal(plan.tasks.find(item => item.id === 'next')!.start, 630);
  assert.equal(plan.tasks.find(item => item.id === 'later')!.start, 710);
  for (const id of ['meeting', 'quick', 'inbox', 'tomorrow']) assert.deepEqual(plan.tasks.find(item => item.id === id), source.find(item => item.id === id));
  assert.deepEqual({ ...plan.tasks[0], completionAdvance: undefined }, { ...source[0], completionAdvance: undefined });
  assert.equal(plan.tasks[0].completionAdvance!.completedAt, source[0].completedAt);
  assert.equal(JSON.stringify(source), before, 'preview/decline cannot change the actual schedule');
  assert.equal(plan.deferred, 0);
  assert.equal(plan.extension, 0);
});

test('active parallel work, fixed events, deadlines and small gaps cannot cause a later event to be postponed', () => {
  const source = [finished(), task('active', { start: 610, duration: 70 }), task('fixed', { fixed: true, start: 690, duration: 60 }),
    task('later', { start: 760, duration: 30 }), task('overdue', { start: 810, deadline: '2026-10-20' })];
  const plan = createAdvancePlan(source, settings, 'current', day, 620);
  assert.equal(plan.tasks.find(item => item.id === 'active')!.start, 610);
  assert.equal(plan.tasks.find(item => item.id === 'later')!.start, 750);
  assert.equal(plan.tasks.find(item => item.id === 'overdue')!.start, 810);
  for (const change of plan.changes) {
    const moved = plan.tasks.find(item => item.id === change.taskId)!;
    assert.ok(moved.start! < source.find(item => item.id === moved.id)!.start!);
    assert.equal(plan.tasks.some(other => other.id !== moved.id && overlaps(moved, other)), false);
  }
});

test('quick points, unfinished or future source events, missing IDs and no useful changes produce no offer', () => {
  const next = task('next', { start: 700 });
  for (const source of [task('current'), finished({ kind: 'quick', duration: 0 }), finished({ start: 650 }), finished({ date: '2026-10-20' })]) {
    assert.equal(createAdvancePlan([source, next], settings, 'current', day, 620).changes.length, 0);
  }
  assert.equal(createAdvancePlan([finished()], settings, 'current', day, 620).changes.length, 0);
  assert.equal(createAdvancePlan([finished(), next], settings, 'missing', day, 620).changes.length, 0);
  assert.equal(createAdvancePlan([finished(), next], { ...settings, dayStart: 660, dayEnd: 680 }, 'current', day, 620).changes.length, 0);
  assert.equal(createAdvancePlan([finished(), next], settings, 'current', day, NaN).valid, false);
});

test('applying and undoing the advance preserves the completion snapshot; stale or duplicate plans cannot overwrite later edits', () => {
  const data = { ...createEmpty(settings), tasks: [finished(), task('next', { start: 700 })] };
  const plan = createAdvancePlan(data.tasks, data.settings, 'current', day, 620);
  const entry = { id: 'advance', date: day, title: '完成后提前安排', createdAt: '' };
  const applied = applyPlanToData(data, plan, entry);
  assert.equal(applied.data.tasks[0].completed, true);
  assert.equal(applied.data.tasks[1].start, 630);
  assert.deepEqual(applied.data.history[0].snapshot, data.tasks);
  assert.equal(applied.data.history[0].snapshot[0].completed, true, 'undo restores times without undoing completion');
  assert.ok(applyPlanToData(applied.data, plan, entry).error);
  assert.ok(applyPlanToData({ ...data, tasks: data.tasks.map(item => ({ ...item, notes: 'changed' })) }, plan, entry).error);
});

test('an overlapping restoration requires consent for the exact restored interval and current conflicting events', () => {
  const source = [finished(), task('advanced', { start: 630 })];
  const denied = setTaskCompletion(source, 'current', false, localMoment(day, 625).toISOString());
  assert.strictEqual(denied.tasks, source);
  assert.deepEqual(denied.confirmation!.conflicts.map(item => item.id), ['advanced']);
  const allowed = setTaskCompletion(source, 'current', false, localMoment(day, 625).toISOString(), denied.confirmation!.key);
  assert.equal(allowed.tasks[0].completed, false);
  assert.equal(allowed.tasks[0].completedAt, undefined);
  const changed = [source[0], { ...source[1], start: 640 }];
  assert.ok(setTaskCompletion(changed, 'current', false, localMoment(day, 625).toISOString(), denied.confirmation!.key).confirmation);
  const completedConflict = [source[0], { ...source[1], completed: true, completedAt: localMoment(day, 640).toISOString() }];
  assert.ok(setTaskCompletion(completedConflict, 'current', false, localMoment(day, 625).toISOString(), denied.confirmation!.key).confirmation);
});

test('occupied intervals shrink after completion without losing the original planned duration, including midnight and invalid legacy times', () => {
  const source = finished({ fixed: true });
  assert.equal(occupiedDuration(source), 20);
  assert.equal(source.duration, 60);
  assert.equal(calendarSegments(source)[0].duration, 20);
  assert.equal(freeMinutes([source], day, 600, 700), 80);
  assert.deepEqual(freeWindows([source], { ...settings, dayStart: 600, dayEnd: 700 }, day), [{ start: 620, end: 700 }]);
  const scheduled = scheduleTask([source, task('new', { date: null, start: null })], 'new', settings, day, 620)!;
  assert.equal(scheduled[1].start, 620);
  assert.equal(occupiedDuration(finished({ completedAt: 'invalid' })), 60);
  assert.equal(occupiedDuration(finished({ completedAt: localMoment(day, 590).toISOString() })), 0);
  assert.equal(occupiedDuration(finished({ completedAt: localMoment(day, 700).toISOString() })), 60);
  const night = task('night', { start: 1410, duration: 120, completed: true, completedAt: localMoment('2026-10-22', 15).toISOString() });
  assert.deepEqual(calendarSegments(night).map(segment => segment.duration), [30, 15]);
});

test('overnight advance uses actual calendar positions, respects the next-day meeting and preserves midnight deadlines', () => {
  const nightSettings = { ...settings, dayStart: 1200, dayEnd: 1800 };
  const source = [finished({ start: 1320, duration: 240, completedAt: localMoment('2026-10-22', 30).toISOString() }),
    task('next', { date: '2026-10-22', start: 120 }), task('meeting', { date: '2026-10-22', start: 60, duration: 30, fixed: true })];
  const plan = createAdvancePlan(source, nightSettings, 'current', day, 1470);
  assert.equal(plan.tasks[1].date, '2026-10-22');
  assert.equal(plan.tasks[1].start, 90);
  const overdue = source.map(item => item.id === 'next' ? { ...item, deadline: day } : item);
  assert.equal(createAdvancePlan(overdue, nightSettings, 'current', day, 1470).changes.length, 0);
});

test('notification resync replaces advanced times and undo restores the old reminder while completion remains recorded', async () => {
  const pending = new Map<string, { notification: LocalNotification; signature: string }>();
  const cancelled: string[] = [];
  const sync = createNotificationSync({ now: () => localMoment(day, 620), permission: async () => true,
    readLedger: async () => '{}', writeLedger: async () => {}, pending: async () => [...pending].map(([id, item]) => ({ id, signature: item.signature })),
    cancel: async id => { cancelled.push(id); pending.delete(id); }, schedule: async (notification, signature) => { pending.set(notification.id, { notification, signature }); } });
  const data = { ...createEmpty({ ...settings, notificationsEnabled: true }), tasks: [finished(), task('next', { start: 700 })] };
  await sync(data);
  const plan = createAdvancePlan(data.tasks, data.settings, 'current', day, 620);
  await sync({ ...data, tasks: plan.tasks });
  assert.equal(pending.get('liubai-next')!.notification.at, localMoment(day, 630).getTime());
  assert.ok(cancelled.includes('liubai-next'));
  await sync(data);
  assert.equal(pending.get('liubai-next')!.notification.at, localMoment(day, 700).getTime());
  assert.equal(pending.has('liubai-current'), false);
});

test('80 compacting scenarios only move future flexible tasks earlier and never introduce occupied-time overlaps', () => {
  for (let sample = 0; sample < 80; sample++) {
    const config = { ...settings, buffer: sample % 16 };
    const source = [finished(), ...Array.from({ length: 5 }, (_, index) => task(`work-${index}`, { start: 700 + index * 65, duration: 15 + sample % 25 })),
      task('meeting', { fixed: true, start: 660 + sample % 30, duration: 25 }), task('quick', { kind: 'quick', duration: 0, start: 750 })];
    const plan = createAdvancePlan(source, config, 'current', day, 620);
    let previousStart = 0;
    for (const item of plan.tasks.filter(item => item.id.startsWith('work-'))) {
      assert.ok(item.start! >= previousStart);
      assert.ok(item.start! <= source.find(original => original.id === item.id)!.start!);
      previousStart = item.start!;
      if (plan.changes.some(change => change.taskId === item.id)) assert.equal(plan.tasks.some(other => other.id !== item.id && overlaps(item, other)), false);
    }
    assert.deepEqual({ ...plan.tasks[0], completionAdvance: undefined }, { ...source[0], completionAdvance: undefined });
    assert.equal(plan.tasks.filter(item => item.id.startsWith('work-')).every(item => relativeStart(item, day)! >= 620), true);
  }
});
