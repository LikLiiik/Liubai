import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlan, freeMinutes, mergeIntervals, scheduleTask } from '../src/scheduler.ts';
import { nextDay } from '../src/utils.ts';
import type { RescueRequest, Settings, Task } from '../src/types.ts';

const today = '2026-10-19';
const settings: Settings = { dayStart: 540, dayEnd: 1080, buffer: 10 };
function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, notes: '', duration: 30, category: 'work', priority: 'normal', important: false,
    fixed: false, completed: false, date: today, start: 840, deadline: null, postponed: 0, ...overrides };
}
function request(overrides: Partial<RescueRequest> = {}): RescueRequest {
  return { reason: 'interruption', minutes: 30, mode: 'boundary', now: 840, date: today, ...overrides };
}
function noOverlaps(tasks: Task[]) {
  const scheduled = tasks.filter(t => t.date === today && t.start !== null).sort((a, b) => a.start! - b.start!);
  for (let i = 1; i < scheduled.length; i++) assert.ok(scheduled[i - 1].start! + scheduled[i - 1].duration <= scheduled[i].start!, `${scheduled[i - 1].id} overlaps ${scheduled[i].id}`);
}

test('temporary interruption moves flexible work around fixed meetings without mutating input', () => {
  const source = [task('write', { duration: 90, deadline: today }), task('meeting', { fixed: true, start: 960, duration: 30 }), task('email', { start: 1000 })];
  const original = structuredClone(source);
  const plan = createPlan(source, settings, request());
  assert.equal(plan.valid, true);
  assert.equal(plan.tasks.find(t => t.id === 'meeting')?.start, 960);
  assert.equal(plan.tasks.find(t => t.id === 'write')?.start, 870);
  noOverlaps(plan.tasks);
  assert.deepEqual(source, original);
});

test('boundary mode defers noncritical work and never extends work hours', () => {
  const plan = createPlan([task('work', { duration: 120 }), task('later', { duration: 90, priority: 'low' })], settings, request({ minutes: 60 }));
  assert.equal(plan.valid, true);
  assert.equal(plan.deferred, 1);
  assert.equal(plan.tasks.find(t => t.id === 'later')?.date, '2026-10-20');
  assert.equal(plan.tasks.find(t => t.id === 'later')?.start, null);
  assert.equal(plan.tasks.find(t => t.id === 'later')?.postponed, 1);
  assert.ok(plan.finish <= settings.dayEnd);
});

test('hard deadline that cannot fit blocks applying instead of silently postponing', () => {
  const plan = createPlan([task('due', { duration: 240, deadline: today })], settings, request({ minutes: 60 }));
  assert.equal(plan.valid, false);
  assert.equal(plan.tasks.find(t => t.id === 'due')?.date, today);
  assert.ok(plan.warnings.some(w => w.includes('今天到期')));
});

test('balanced mode allows a visible extension of at most sixty minutes', () => {
  const plan = createPlan([task('due', { duration: 210, deadline: today })], settings, request({ mode: 'balanced', minutes: 60 }));
  assert.equal(plan.valid, true);
  assert.equal(plan.extension, 30);
  assert.ok(plan.finish <= settings.dayEnd + 60);
  assert.ok(plan.warnings.some(w => w.includes('晚 30 分钟')));
});

test('fixed meeting collision blocks the plan', () => {
  const plan = createPlan([task('meeting', { fixed: true, start: 850 })], settings, request());
  assert.equal(plan.valid, false);
  assert.equal(plan.tasks.find(t => t.id === 'meeting')?.start, 850);
});

test('completed work is preserved and incomplete past work is never auto-completed', () => {
  const done = task('done', { start: 540, completed: true, completedAt: '2026-10-19T09:30:00' });
  const overdue = task('past', { start: 600 });
  const plan = createPlan([done, overdue], settings, request());
  assert.deepEqual(plan.tasks.find(t => t.id === 'done'), done);
  assert.equal(plan.tasks.find(t => t.id === 'past')?.completed, false);
  assert.ok(plan.tasks.find(t => t.id === 'past')!.start! >= 870);
});

test('focus mode protects the chosen important task when capacity is limited', () => {
  const plan = createPlan([task('routine', { duration: 120, start: 840 }), task('important', { duration: 120, start: 960, important: true })], settings, request({ mode: 'focus', minutes: 60 }));
  assert.equal(plan.tasks.find(t => t.id === 'important')?.date, today);
  assert.equal(plan.tasks.find(t => t.id === 'routine')?.date, nextDay(today));
});

test('low energy reserves half the available time and never shortens tasks', () => {
  const source = [task('a', { duration: 90 }), task('b', { duration: 90 })];
  const plan = createPlan(source, settings, request({ reason: 'lowEnergy', mode: 'balanced' }));
  assert.equal(plan.valid, true);
  assert.equal(plan.deferred, 1);
  assert.equal(plan.extension, 0);
  assert.equal(plan.tasks.find(t => t.id === 'a')?.duration, 90);
  assert.equal(plan.tasks.find(t => t.id === 'b')?.duration, 90);
});

test('remaining time is explicitly set by user and never inferred from the clock', () => {
  const plan = createPlan([task('working', { duration: 90 }), task('other', { start: 960 })], settings, request({ reason: 'overrun', taskId: 'working', minutes: 45 }));
  assert.equal(plan.valid, true);
  assert.equal(plan.tasks.find(t => t.id === 'working')?.duration, 45);
  assert.equal(plan.tasks.find(t => t.id === 'working')?.start, 840);
  assert.equal(plan.tasks.find(t => t.id === 'working')?.completed, false);
});

test('overrun requires an unfinished flexible task', () => {
  for (const candidate of [task('fixed', { fixed: true }), task('done', { completed: true })]) {
    assert.equal(createPlan([candidate], settings, request({ reason: 'overrun', taskId: candidate.id })).valid, false);
  }
});

test('available capacity counts overlapping fixed blocks once and clips to work hours', () => {
  assert.equal(freeMinutes([task('a', { fixed: true, start: 800, duration: 100 }), task('b', { fixed: true, start: 880, duration: 50 }), task('late', { fixed: true, start: 1070 })], today, 840, 1080), 140);
  assert.deepEqual(mergeIntervals([{ start: 1, end: 5 }, { start: 4, end: 8 }, { start: 8, end: 9 }]), [{ start: 1, end: 9 }]);
});

test('scheduling from inbox uses first available slot and preserves other tasks', () => {
  const fixed = task('fixed', { fixed: true, duration: 60 });
  const inbox = task('inbox', { date: null, start: null, duration: 45 });
  const result = scheduleTask([fixed, inbox], 'inbox', settings, today, 840)!;
  assert.equal(result.find(t => t.id === 'inbox')?.start, 900);
  assert.deepEqual(result[0], fixed);
  assert.equal(inbox.date, null);
});

test('full day returns no slot instead of placing a task outside boundaries', () => {
  assert.equal(scheduleTask([task('long', { duration: 300, date: null, start: null })], 'long', settings, today, 840), null);
});

test('invalid inputs and cross-midnight interruption cannot be applied', () => {
  assert.equal(createPlan([], settings, request({ minutes: -1 })).valid, false);
  assert.equal(createPlan([], settings, request({ now: 1400, minutes: 90 })).valid, false);
  assert.equal(createPlan([], settings, request({ now: NaN })).valid, false);
});

test('deferring across month/year uses local calendar dates', () => {
  assert.equal(nextDay('2026-12-31'), '2027-01-01');
  assert.equal(nextDay('2028-02-28'), '2028-02-29');
});

test('plain rebalancing never inserts a fictitious interruption', () => {
  const plan = createPlan([task('a', { start: 600 })], settings, request({ reason: 'rebalance' }));
  assert.equal(plan.tasks.length, 1);
  assert.equal(plan.tasks[0].start, 840);
  assert.equal(plan.valid, true);
});

test('a lower priority task inserted before a reserved task leaves the configured gap', () => {
  const plan = createPlan([task('due', { duration: 90, deadline: today }), task('small', { duration: 30, priority: 'low' }), task('meeting', { start: 900, duration: 30, fixed: true })], settings, request({ reason: 'rebalance' }));
  const due = plan.tasks.find(t => t.id === 'due')!;
  const small = plan.tasks.find(t => t.id === 'small')!;
  assert.equal(due.start, 930);
  assert.equal(small.start, 840);
  const add = scheduleTask([task('reserved', { start: 900 }), task('new', { duration: 60, start: null, date: null })], 'new', settings, today, 840)!;
  assert.equal(add.find(t => t.id === 'new')?.start, 940);
});

test('many mixed days preserve deadlines, fixed blocks, buffers and unique task ownership', () => {
  for (let run = 0; run < 80; run++) {
    const source = Array.from({ length: 8 }, (_, i) => task(`task-${i}`, { duration: 15 + ((run * 7 + i * 13) % 8) * 15, start: 840 + i * 20,
      important: i % 3 === 0, priority: i % 2 ? 'low' : 'high' }));
    source.push(task('meeting', { fixed: true, start: 960, duration: 30 }));
    const plan = createPlan(source, settings, request({ minutes: 15 + run % 4 * 15 }));
    assert.equal(plan.valid, true);
    noOverlaps(plan.tasks);
    assert.equal(plan.tasks.filter(t => t.id === 'meeting')[0].start, 960);
    assert.equal(new Set(plan.tasks.map(t => t.id)).size, source.length + 1);
    assert.ok(plan.tasks.every(t => t.completed === false));
    assert.ok(plan.tasks.filter(t => t.date === today && !t.fixed).every(t => t.start! + t.duration <= settings.dayEnd));
  }
});
