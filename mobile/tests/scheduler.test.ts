import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlan, freeMinutes, mergeIntervals, scheduleTask } from '../src/scheduler.ts';
import { nextDay } from '../src/utils.ts';
import { overlaps } from '../src/time.ts';
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

test('all automatic modes preserve existing overlapping fixed choices and place other work outside their union', () => {
  const source = [task('fixed-a', { fixed: true, duration: 90 }), task('fixed-b', { fixed: true, start: 870, duration: 90 }),
    task('auto-a', { duration: 30 }), task('auto-b', { duration: 30 })];
  const before = structuredClone(source);
  for (const mode of ['balanced', 'boundary', 'focus'] as const) {
    const plan = createPlan(source, settings, request({ reason: 'rebalance', mode }));
    assert.equal(plan.valid, true);
    assert.deepEqual(plan.tasks.slice(0, 2), source.slice(0, 2));
    assert.equal(overlaps(plan.tasks[0], plan.tasks[1]), true);
    for (const automatic of plan.tasks.filter(item => !item.fixed && item.start !== null)) {
      assert.ok(automatic.start! >= 960);
      assert.equal(plan.tasks.some(other => other.id !== automatic.id && overlaps(automatic, other)), false);
    }
    assert.ok(plan.warnings.some(message => message.includes('保留已有固定事项')));
  }
  assert.deepEqual(source, before);
});

test('automatically scheduling a new inbox item avoids manually overlapping fixed, flexible and completed events', () => {
  const source = [task('fixed', { fixed: true, duration: 60 }), task('flexible', { start: 870, duration: 90 }),
    task('done', { completed: true, start: 930, duration: 60 }), task('inbox', { date: null, start: null })];
  const result = scheduleTask(source, 'inbox', settings, today, 840)!;
  const scheduled = result.find(item => item.id === 'inbox')!;
  assert.equal(scheduled.start, 1000);
  assert.equal(result.some(other => other.id !== scheduled.id && overlaps(scheduled, other)), false);
  assert.deepEqual(result.slice(0, 3), source.slice(0, 3));
});

test('automatic rescue separates manually overlapping flexible items instead of carrying their overlap into a new plan', () => {
  const source = [task('a', { duration: 45 }), task('b', { duration: 45 }), task('fixed', { fixed: true, start: 960 })];
  const plan = createPlan(source, settings, request({ reason: 'rebalance' }));
  assert.equal(plan.valid, true);
  noOverlaps(plan.tasks);
  assert.equal(plan.tasks[2].start, 960);
});

test('automatic interruption insertion cannot create an overlap with completed time blocks', () => {
  const completed = task('done', { completed: true, start: 840, duration: 60 });
  const plan = createPlan([completed], settings, request());
  assert.equal(plan.valid, false);
  assert.deepEqual(plan.tasks.find(item => item.id === completed.id), completed);
  assert.ok(plan.warnings.some(message => message.includes('已完成事项')));
});

test('another interruption extends the active rescue block without duplicate IDs or overlapping tasks', () => {
  const first = createPlan([task('work', { duration: 60 })], settings, request());
  const second = createPlan(first.tasks, settings, request({ minutes: 15, now: 845 }));
  assert.equal(second.valid, true);
  const block = second.tasks.find(item => item.id.startsWith('interruption-'))!;
  assert.equal(block.start, 840);
  assert.equal(block.duration, 45);
  assert.equal(second.tasks.length, first.tasks.length);
  noOverlaps(second.tasks);
  const third = createPlan(second.tasks, settings, request({ minutes: 15, now: 845 }));
  assert.equal(third.valid, true);
  assert.equal(third.tasks.find(item => item.id === block.id)!.duration, 60);
  assert.equal(new Set(third.tasks.map(item => item.id)).size, third.tasks.length);
  noOverlaps(third.tasks);
});

test('extending an active interruption still protects meetings and completed blocks', () => {
  const first = createPlan([], settings, request());
  const meeting = task('meeting', { fixed: true, start: 880 });
  const result = createPlan([...first.tasks, meeting], settings, request({ minutes: 30, now: 845 }));
  assert.equal(result.valid, false);
  assert.deepEqual(result.tasks.find(item => item.id === meeting.id), meeting);
});

test('an interruption before preferred work hours starts now, while automatic work waits for preferences', () => {
  const result = createPlan([task('work', { start: null })], settings, request({ now: 480 }));
  assert.equal(result.valid, true);
  assert.equal(result.tasks.find(item => item.id.startsWith('interruption-'))!.start, 480);
  assert.equal(result.tasks.find(item => item.id === 'work')!.start, 540);
});

test('expired deadlines cannot be silently rescheduled to today', () => {
  const due = task('overdue', { start: null, deadline: '2026-10-18' });
  assert.equal(scheduleTask([due], due.id, settings, today, 840), null);
  assert.equal(createPlan([due], settings, request({ reason: 'rebalance' })).valid, false);
});

test('legacy rescue blocks can be extended, while an expired block starts a separate interruption', () => {
  const legacy = task('interruption-2026-10-19-840', { title: '临时事项', notes: '通过一键救场加入', fixed: true, start: 840 });
  const extended = createPlan([legacy], settings, request({ now: 845, minutes: 15 }));
  assert.equal(extended.valid, true);
  assert.equal(extended.tasks[0].duration, 45);
  assert.equal(legacy.duration, 30);
  const later = createPlan(extended.tasks, settings, request({ now: 900 }));
  assert.equal(later.valid, true);
  assert.equal(later.tasks.length, 2);
  assert.equal(later.tasks[1].start, 900);
  assert.equal(new Set(later.tasks.map(item => item.id)).size, 2);
  const manual = task('personal', { title: '临时事项', fixed: true });
  assert.equal(createPlan([manual], settings, request()).valid, false);
});

test('remaining duration is replaced on each overrun instead of accumulating, and oversized extension is blocked', () => {
  const first = createPlan([task('work', { duration: 90 })], settings, request({ reason: 'overrun', taskId: 'work', minutes: 45 }));
  const second = createPlan(first.tasks, settings, request({ reason: 'overrun', taskId: 'work', minutes: 20, now: 850 }));
  assert.equal(second.valid, true);
  assert.equal(second.tasks[0].duration, 20);
  assert.equal(second.tasks[0].start, 850);
  const long = createPlan([], { ...settings, dayStart: 0, dayEnd: 1440 }, request({ now: 0, minutes: 720 }));
  assert.equal(long.valid, true);
  assert.equal(createPlan(long.tasks, { ...settings, dayStart: 0, dayEnd: 1440 }, request({ now: 15, minutes: 30 })).valid, false);
});

test('repeated rescues across midnight extend one block and keep real dates and fixed next-day meetings', () => {
  const overnight = { ...settings, dayEnd: 1800 };
  const meeting = task('tomorrow-meeting', { date: '2026-10-20', start: 120, fixed: true });
  const first = createPlan([meeting, task('work')], overnight, request({ now: 1410, minutes: 60 }));
  assert.equal(first.valid, true);
  const second = createPlan(first.tasks, overnight, request({ now: 1450, minutes: 30 }));
  assert.equal(second.valid, true);
  const block = second.tasks.find(item => item.rescueInterruption)!;
  assert.deepEqual([block.date, block.start, block.duration], [today, 1410, 90]);
  assert.deepEqual(second.tasks.find(item => item.id === meeting.id), meeting);
  for (const item of second.tasks.filter(item => !item.fixed)) {
    assert.equal(second.tasks.some(other => other.id !== item.id && overlaps(item, other)), false);
  }
});
