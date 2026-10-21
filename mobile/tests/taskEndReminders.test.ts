import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmpty } from '../src/seed.ts';
import type { AppData, Task } from '../src/types.ts';
import { createNotificationSync, type LocalNotification } from '../src/notificationSync.ts';
import { applyEndCompletions, createEndReceiptStore, decodeEndResponse, END_ACTIONS, END_CATEGORY, END_COMPLETE,
  END_RESCUE, endAt, endReminderFor, endResponseTarget } from '../src/taskEndReminders.ts';
import { localMoment } from '../src/inboxReminders.ts';
import { createEventRescuePlan } from '../src/eventRescue.ts';
import { applyPlanToData } from '../src/planApply.ts';
import { setTaskCompletion } from '../src/completion.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';

const day = '2026-10-21';
const settings = { dayStart: 540, dayEnd: 1080, buffer: 10, notificationsEnabled: true };
const task = (id: string, patch: Partial<Task> = {}): Task => ({ id, title: id, notes: '', duration: 60, date: day, start: 600,
  category: 'work', priority: 'normal', important: false, fixed: false, completed: false, deadline: null, postponed: 0, ...patch });
const data = (tasks: Task[]): AppData => ({ ...createEmpty(settings), tasks });
function notificationSystem(minute = 540) {
  const pending = new Map<string, { request: LocalNotification; signature: string }>();
  let granted = true, now = localMoment(day, minute);
  const sync = createNotificationSync({ now: () => now, permission: async () => granted, readLedger: async () => null, writeLedger: async () => {},
    pending: async () => [...pending].map(([id, item]) => ({ id, signature: item.signature })),
    cancel: async id => { pending.delete(id); }, schedule: async (request, signature) => { pending.set(request.id, { request, signature }); } });
  return { pending, sync, revoke: () => { granted = false; }, time: (minute: number) => { now = localMoment(day, minute); } };
}
function receiptSystem() {
  const values = new Map<string, string>();
  let fail = false;
  const driver = { keys: async () => [...values.keys()], get: async (key: string) => values.get(key) ?? null,
    set: async (key: string, value: string) => { if (fail) throw new Error('disk full'); values.set(key, value); },
    remove: async (key: string) => { values.delete(key); } };
  return { values, driver, receipts: createEndReceiptStore(driver), fail: (next: boolean) => { fail = next; } };
}

test('ongoing events still receive an end confirmation, while quick and already-ended events do not', async () => {
  const system = notificationSystem(630);
  const source = data([task('ongoing'), task('future', { start: 700 }), task('past', { start: 540 }),
    task('point', { kind: 'quick', duration: 0, start: 700 })]);
  await system.sync(source);
  const ends = [...system.pending.values()].map(item => item.request).filter(item => item.data.kind === 'task-end');
  assert.deepEqual(ends.map(item => item.data.taskId), ['ongoing', 'future']);
  assert.equal(ends[0].at, localMoment(day, 660).getTime());
  assert.equal(ends[0].category, END_CATEGORY);
  assert.ok(ends[0].body.includes('ongoing'));
  assert.equal(system.pending.has('liubai-ongoing'), false);
  assert.ok(system.pending.has('liubai-point'));
  assert.deepEqual(END_ACTIONS.map(action => action.buttonTitle), ['标记已完成', '一键救场']);
  assert.equal(END_ACTIONS[0].options.opensAppToForeground, false);
});

test('end requests follow date/start/duration edits and disappear on completion, deletion, permission denial or disabling', async () => {
  const system = notificationSystem();
  let source = data([task('event')]);
  await system.sync(source);
  const original = endReminderFor(source.tasks[0])!;
  source = data([task('event', { date: '2026-10-22', start: 700, duration: 30 })]);
  await system.sync(source);
  const next = endReminderFor(source.tasks[0])!;
  assert.equal(system.pending.has(original.id), false);
  assert.equal(system.pending.get(next.id)!.request.at, endAt(next));
  await system.sync(data([{ ...source.tasks[0], completed: true }]));
  assert.equal(system.pending.size, 0);
  await system.sync(source);
  await system.sync(data([]));
  assert.equal(system.pending.size, 0);
  await system.sync(source);
  await system.sync({ ...source, settings: { ...settings, notificationsEnabled: false } });
  assert.equal(system.pending.size, 0);
  await system.sync({ ...source, demo: true });
  assert.equal(system.pending.size, 0);
  await system.sync(source); system.revoke(); await system.sync(source);
  assert.equal(system.pending.size, 0);
});

test('overlapping events finish independently, and midnight plus legacy fractional durations preserve the real endpoint', async () => {
  const system = notificationSystem();
  const source = data([task('a'), task('b', { start: 630, duration: 30 }), task('night', { start: 1410, duration: 90 })]);
  await system.sync(source);
  for (const item of source.tasks) assert.equal(system.pending.get(endReminderFor(item)!.id)!.request.at, endAt(endReminderFor(item)!));
  assert.equal(endAt(endReminderFor(source.tasks[2])!), localMoment('2026-10-22', 60).getTime());
  assert.equal(endAt(endReminderFor(task('legacy', { duration: 30.5 }))!), localMoment(day, 630).getTime() + 30000);
});

test('start and end requests share a chronological notification budget', async () => {
  const system = notificationSystem();
  await system.sync(data(Array.from({ length: 40 }, (_, index) => task(`event-${index}`, { start: 600 + index * 5, duration: 15 }))));
  const pending = [...system.pending.values()].map(item => item.request);
  assert.equal(pending.length, 50);
  assert.ok(pending.some(item => item.data.kind === 'task-end'));
  assert.ok(pending.every((item, index) => index === 0 || pending[index - 1].at <= item.at));
});

test('notification tray keeps the matching end reminder but dismisses it after completion or permission revocation', async () => {
  const source = data([task('a')]);
  const event = endReminderFor(source.tasks[0])!;
  const shown = new Set([event.id, 'foreign']);
  let allowed = true;
  const sync = createNotificationSync({ now: () => localMoment(day, 660), permission: async () => allowed,
    pending: async () => [], cancel: async () => {}, schedule: async () => {}, readLedger: async () => null, writeLedger: async () => {},
    presented: async () => [...shown].map(id => ({ id, data: { kind: 'task-end', taskId: 'a', date: day, start: '600', duration: '60' } })),
    dismiss: async id => { shown.delete(id); } });
  await sync(source);
  assert.equal(shown.has(event.id), true);
  await sync(data([task('a', { completed: true })]));
  assert.deepEqual([...shown], ['foreign']);
  shown.add(event.id); allowed = false; await sync(source);
  assert.deepEqual([...shown], ['foreign']);
});

test('action decoding rejects malformed payloads and binds the notification to the exact scheduled occurrence', () => {
  const event = endReminderFor(task('a'))!;
  const payload = { kind: 'task-end', taskId: event.taskId, date: event.date, start: String(event.start), duration: String(event.duration) };
  assert.equal(decodeEndResponse(event.id, payload, END_COMPLETE)!.action, 'complete');
  assert.equal(decodeEndResponse(event.id, payload, END_RESCUE)!.action, 'rescue');
  for (const [id, patch, action] of [[event.id, { start: '1440' }, END_COMPLETE], [event.id, { duration: '0' }, END_COMPLETE],
    [event.id, { date: '2026-02-30' }, END_COMPLETE], [event.id, { taskId: 'other' }, END_COMPLETE],
    ['forged', {}, END_COMPLETE], [event.id, {}, 'unknown']] as const) assert.equal(decodeEndResponse(id, { ...payload, ...patch }, action), null);
  assert.equal(endResponseTarget(data([task('a')]), event, localMoment(day, 659)), null);
  assert.equal(endResponseTarget(data([task('a')]), event, localMoment('2026-10-30', 660)), null);
});

test('background completion survives restart, preserves concurrent task edits and never replays after undo', async () => {
  const system = receiptSystem();
  const event = endReminderFor(task('a'))!;
  const moment = localMoment(day, 660);
  await Promise.all([system.receipts.enqueue(event, moment), system.receipts.enqueue(event, localMoment(day, 670))]);
  const reopened = createEndReceiptStore(system.driver);
  const records = await reopened.pending();
  assert.equal(records.length, 1);
  assert.equal(records[0].completedAt, moment.toISOString());
  const source = data([task('a', { notes: 'later edit' }), task('other', { start: 720 })]);
  const result = applyEndCompletions(source, records);
  assert.equal(result.tasks[0].completed, true);
  assert.equal(result.tasks[0].notes, 'later edit');
  assert.deepEqual(result.tasks[1], source.tasks[1]);
  assert.equal(applyEndCompletions(result, records), result, 'crash after save but before acknowledgement remains idempotent');
  const undone = { ...result, tasks: setTaskCompletion(result.tasks, 'a', false, localMoment(day, 670).toISOString()).tasks };
  assert.equal(applyEndCompletions(undone, records).tasks[0].completed, false);
  await reopened.acknowledge(JSON.parse(JSON.stringify(result)));
  await reopened.enqueue(event, localMoment(day, 680));
  assert.equal((await reopened.pending()).length, 0, 'duplicate OS response cannot complete an undone event again');
});

test('an older queued save cannot acknowledge a later completion action; failed writes remain retryable', async () => {
  const system = receiptSystem();
  const event = endReminderFor(task('a'))!;
  system.fail(true);
  await assert.rejects(system.receipts.enqueue(event, localMoment(day, 660)));
  assert.equal(system.values.size, 0);
  system.fail(false);
  await system.receipts.enqueue(event, localMoment(day, 660));
  await system.receipts.acknowledge(data([task('a', { completed: true })]));
  assert.equal((await system.receipts.pending()).length, 1, 'acknowledgement requires the receipt in the saved snapshot');
  const saved = applyEndCompletions(data([task('a')]), await system.receipts.pending());
  system.fail(true);
  await assert.rejects(system.receipts.acknowledge(saved));
  assert.equal((await system.receipts.pending()).length, 1);
  system.fail(false);
  await system.receipts.acknowledge(saved);
  assert.equal((await system.receipts.pending()).length, 0);
});

test('stale reminders cannot complete moved, resized, deleted or already-completed tasks', () => {
  const event = endReminderFor(task('a'))!;
  const record = { ...event, completedAt: localMoment(day, 660).toISOString() };
  for (const tasks of [[task('a', { start: 720 })], [task('a', { duration: 90 })], [], [task('a', { completed: true })],
    [task('a', { kind: 'quick', duration: 0 })]]) {
    const source = data(tasks);
    const next = applyEndCompletions(source, [record]);
    assert.deepEqual(next.tasks, source.tasks);
    assert.equal(endResponseTarget(source, event, localMoment(day, 660)), null);
  }
});

test('event rescue selects only the requested unfinished event, handles yesterday and protects stale plan application', () => {
  const source = data([task('target', { date: '2026-10-20' }), task('later', { start: 730 }), task('fixed', { start: 750, fixed: true })]);
  for (const mode of ['balanced', 'boundary', 'focus'] as const) {
    const plan = createEventRescuePlan(source.tasks, settings, { date: day, now: 660, reason: 'overrun', minutes: 30, mode }, 'target', 'new');
    assert.equal(plan.valid, true);
    const target = plan.tasks.find(item => item.id === 'target')!;
    assert.equal(target.date, day); assert.equal(target.start, 660); assert.equal(target.duration, 30);
    assert.deepEqual(plan.tasks.find(item => item.id === 'fixed'), source.tasks[2]);
    const entry = { id: 'change', date: day, createdAt: localMoment(day, 660).toISOString(), title: '事件救场' };
    assert.ok(!applyPlanToData(source, plan, entry).error);
    assert.ok(applyPlanToData({ ...source, tasks: source.tasks.map(item => item.id === 'later' ? { ...item, title: 'edited' } : item) }, plan, entry).error);
  }
  const night = createEventRescuePlan([task('night', { start: 1410, duration: 90 })], { ...settings, dayEnd: 1800 },
    { date: day, now: 1500, reason: 'overrun', minutes: 45, mode: 'boundary' }, 'night', 'new');
  assert.equal(night.valid, true);
  assert.equal(night.tasks[0].date, '2026-10-22');
  assert.equal(night.tasks[0].start, 60);
});

test('fixed-event rescue previews a flexible continuation and never moves or duplicates the original fixed record', () => {
  const source = data([task('fixed', { fixed: true }), task('meeting', { fixed: true, start: 660, duration: 30 })]);
  const plan = createEventRescuePlan(source.tasks, settings, { date: day, now: 660, reason: 'overrun', minutes: 30, mode: 'boundary' }, 'fixed', 'continuation');
  assert.equal(plan.valid, true);
  assert.deepEqual(plan.tasks.find(item => item.id === 'fixed'), source.tasks[0]);
  const next = plan.tasks.find(item => item.id === 'continuation')!;
  assert.equal(next.fixed, false); assert.equal(next.start, 690); assert.equal(next.duration, 30);
  assert.equal(source.tasks.length, 2, 'preview does not alter personal tasks');
  assert.ok(plan.changes.some(change => change.taskId === 'continuation'));
  const entry = { id: 'fixed-rescue', date: day, createdAt: localMoment(day, 660).toISOString(), title: '固定事件救场' };
  const applied = applyPlanToData(source, plan, entry).data;
  assert.ok(applyPlanToData(applied, plan, entry).error, 'rapid repeat confirmation cannot add a duplicate continuation');
  assert.equal(createEventRescuePlan(source.tasks, settings, { date: day, now: 660, reason: 'overrun', minutes: 30, mode: 'boundary' }, 'missing', 'continuation').valid, false);
});

test('v13 returning users see the end-notification lesson while preserving their guide completion history', () => {
  const previous = { ...freshGuideProgress(), revision: 13, completedRevision: 13, deferredRevision: 13 };
  assert.equal(guideStartStep(previous), 'completion');
  assert.equal(visitGuideStep(previous, 'completion').completedRevision, 13);
});
