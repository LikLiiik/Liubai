import assert from 'node:assert/strict';
import test from 'node:test';
import { saveTaskDraft, type TaskDraft, type TaskSaveResult } from '../src/taskDraft.ts';
import { createPlan } from '../src/scheduler.ts';
import { overlaps } from '../src/time.ts';
import type { Settings, Task } from '../src/types.ts';

const settings: Settings = { dayStart: 540, dayEnd: 1080, buffer: 10 };
const context = { today: '2026-10-21', now: 840, calendarToday: '2026-10-21', calendarNow: 840 };
const draft = (extra: Partial<TaskDraft> = {}): TaskDraft => ({ id: 'new', title: '整理方案', notes: '', duration: '30',
  category: 'work', priority: 'normal', important: false, fixed: false, date: context.today, time: '1400', deadline: '', ...extra });
function saved(result: TaskSaveResult) { assert.equal(result.kind, 'saved'); if (result.kind !== 'saved') throw new Error(); return result; }
function task(extra: Partial<Task> = {}): Task { return { id: 'existing', title: '已有事项', notes: '', duration: 60, date: context.today,
  start: 840, fixed: true, completed: false, priority: 'normal', category: 'work', important: false, deadline: null, postponed: 0, ...extra }; }

test('adding automatic work repeatedly uses different free slots and preserves every previous task', () => {
  let tasks = [task({ duration: 30 })];
  for (let index = 0; index < 5; index++) {
    const before = structuredClone(tasks);
    const result = saved(saveTaskDraft(tasks, settings, draft({ id: `new-${index}` }), context));
    assert.equal(result.noSlot, false);
    assert.deepEqual(result.tasks.slice(0, tasks.length), before);
    const next = result.tasks.at(-1)!;
    assert.equal(result.tasks.some(other => other.id !== next.id && overlaps(next, other)), false);
    tasks = result.tasks;
  }
  assert.equal(new Set(tasks.map(item => item.id)).size, 6);
});

test('insufficient capacity saves a pending task without overwriting any existing appointment', () => {
  const meeting = task({ duration: 240 });
  const result = saved(saveTaskDraft([meeting], settings, draft(), context));
  assert.equal(result.noSlot, true);
  assert.equal(result.tasks[1].start, null);
  assert.equal(result.tasks[1].date, context.today);
  assert.deepEqual(result.tasks[0], meeting);
});

test('new unscheduled tasks cannot be assigned after their deadline, and invalid dates are rejected', () => {
  for (const extra of [{ deadline: '2026-10-20' }, { deadline: '2026-02-30' }, { date: '2026-02-30' }, { duration: '0' }]) {
    assert.equal(saveTaskDraft([], settings, draft(extra), context).kind, 'error');
  }
  const inbox = saved(saveTaskDraft([], settings, draft({ date: null }), context));
  assert.equal(inbox.tasks[0].date, null); assert.equal(inbox.tasks[0].start, null);
});

test('editing only text preserves a manually chosen flexible position and import metadata', () => {
  const original = task({ fixed: false, start: 1000, courseImport: { school: 'hitsz', semester: '2026/1', key: 'course', fingerprint: 'original' } });
  const result = saved(saveTaskDraft([original], settings, draft({ id: original.id, title: '新名称', duration: '60' }), context, original));
  assert.equal(result.tasks[0].start, 1000);
  assert.deepEqual(result.tasks[0].courseImport, original.courseImport);
  assert.equal(original.title, '已有事项');
});

test('manual overlap needs consent for the exact placement and current collision set', () => {
  const existing = task();
  const entry = draft({ fixed: true });
  const confirm = saveTaskDraft([existing], settings, entry, context);
  assert.equal(confirm.kind, 'overlap');
  if (confirm.kind !== 'overlap') return;
  assert.equal(saved(saveTaskDraft([existing], settings, entry, context, null, confirm.key)).tasks.length, 2);
  assert.equal(saveTaskDraft([existing], settings, { ...entry, duration: '45' }, context, null, confirm.key).kind, 'overlap');
  assert.equal(saveTaskDraft([existing, task({ id: 'another' })], settings, entry, context, null, confirm.key).kind, 'overlap');
});

test('a deleted or changed task cannot be resurrected or overwritten by an old editor', () => {
  const original = task({ fixed: false });
  const entry = draft({ id: original.id, duration: '60' });
  assert.equal(saveTaskDraft([], settings, entry, context, original).kind, 'error');
  assert.equal(saveTaskDraft([{ ...original, start: 900 }], settings, entry, context, original).kind, 'error');
  const first = saved(saveTaskDraft([], settings, draft(), context));
  assert.equal(saveTaskDraft(first.tasks, settings, draft(), context).kind, 'error');
});

test('cross-night additions distinguish continuing last night from the actual current and next calendar days', () => {
  const overnight = { ...settings, dayEnd: 1800 };
  const night = { today: '2026-10-20', now: 1560, calendarToday: '2026-10-21', calendarNow: 120 };
  const continued = saved(saveTaskDraft([], overnight, draft({ date: night.today }), night)).tasks[0];
  assert.deepEqual([continued.date, continued.start], ['2026-10-21', 120]);
  const actualToday = saved(saveTaskDraft([], overnight, draft({ date: night.calendarToday }), night)).tasks[0];
  assert.deepEqual([actualToday.date, actualToday.start], ['2026-10-21', 540]);
  const tomorrow = saved(saveTaskDraft([], overnight, draft({ date: '2026-10-22' }), night)).tasks[0];
  assert.deepEqual([tomorrow.date, tomorrow.start], ['2026-10-22', 540]);
});

test('a sequence of adding work, rescuing twice, changing remaining duration and editing keeps ownership and collision rules', () => {
  let tasks = saved(saveTaskDraft([], settings, draft({ duration: '60' }), context)).tasks;
  tasks = createPlan(tasks, settings, { date: context.today, now: 840, minutes: 30, reason: 'interruption', mode: 'boundary' }).tasks;
  tasks = saved(saveTaskDraft(tasks, settings, draft({ id: 'second' }), context)).tasks;
  const repeated = createPlan(tasks, settings, { date: context.today, now: 845, minutes: 15, reason: 'interruption', mode: 'boundary' });
  assert.equal(repeated.valid, true); tasks = repeated.tasks;
  const remaining = createPlan(tasks, settings, { date: context.today, now: 885, minutes: 20, taskId: 'new', reason: 'overrun', mode: 'boundary' });
  assert.equal(remaining.valid, true); tasks = remaining.tasks;
  const original = tasks.find(item => item.id === 'new')!;
  tasks = saved(saveTaskDraft(tasks, settings, draft({ title: '更新方案', duration: '20' }), { ...context, now: 885 }, original)).tasks;
  assert.equal(tasks.length, 3);
  assert.equal(tasks.find(item => item.id === 'new')!.start, 885);
  for (const item of tasks) assert.equal(tasks.some(other => other.id !== item.id && overlaps(item, other)), false);
});

test('forty mixed operation sequences preserve IDs, fixed appointments, deadlines and automatic exclusivity', () => {
  for (let run = 0; run < 40; run++) {
    const meeting = task({ id: 'meeting', start: 960, duration: 30 });
    let tasks = [meeting];
    for (let step = 0; step < 12; step++) {
      const now = 840 + step * 5;
      const before = structuredClone(tasks);
      if (step % 3 === 0) {
        tasks = saved(saveTaskDraft(tasks, settings, draft({ id: `work-${step}`, duration: String(15 + (run + step) % 4 * 15),
          deadline: step === 0 ? context.today : '', important: run % 2 === 0 }), { ...context, now, calendarNow: now })).tasks;
      } else {
        const reason = (['interruption', 'rebalance', 'overrun', 'lowEnergy'] as const)[(run + step) % 4];
        const selected = tasks.find(item => !item.fixed && !item.completed && item.date === context.today);
        const plan = createPlan(tasks, settings, { date: context.today, now, minutes: 15 + run % 3 * 15, reason,
          taskId: selected?.id, mode: (['balanced', 'boundary', 'focus'] as const)[run % 3] });
        if (plan.valid) tasks = plan.tasks;
        else assert.deepEqual(tasks, before);
      }
      assert.equal(new Set(tasks.map(item => item.id)).size, tasks.length);
      assert.deepEqual(tasks.find(item => item.id === meeting.id), meeting);
      for (const item of tasks.filter(item => item.start !== null)) {
        assert.equal(tasks.some(other => other.id !== item.id && overlaps(item, other)), false, `run ${run}, step ${step}`);
        if (item.deadline) assert.ok(item.date! <= item.deadline);
      }
    }
  }
});
