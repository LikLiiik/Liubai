import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppData, Task } from '../src/types.ts';
import { acceptInboxSuggestion, decodeReminderResponse, findInboxSuggestion, freeWindows, localMoment, parseReminderLedger, planInboxReminders, retainReminderLedger } from '../src/inboxReminders.ts';
import { createNotificationSync, type LocalNotification, type NotificationDriver } from '../src/notificationSync.ts';
import { dateKey } from '../src/utils.ts';
import { validSettings } from '../src/time.ts';

const day = '2026-10-20';
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, notes: '', duration: 30, category: 'work', priority: 'normal', important: false, completed: false, fixed: false, date: null, start: null, deadline: null, postponed: 0, ...extra });
const data = (tasks: Task[] = [task('inbox')]): AppData => ({ version: 1, demo: false, tasks, history: [], settings: { dayStart: 540, dayEnd: 1080, buffer: 10, inboxRemindersEnabled: true } });

test('a day with classes still recommends an inbox task in a long continuous gap', () => {
  const source = data([task('class', { date: day, start: 540, duration: 120, fixed: true }), task('meeting', { date: day, start: 780, duration: 60, fixed: true }), task('inbox')]);
  const before = JSON.stringify(source);
  const suggestion = planInboxReminders(source, localMoment(day, 600), {})[0];
  assert.equal(suggestion.day, day);
  assert.equal(suggestion.at, localMoment(day, 660).getTime());
  assert.equal(suggestion.freeMinutes, 120);
  assert.equal(suggestion.taskId, 'inbox');
  assert.equal(JSON.stringify(source), before, 'a notification never schedules the task itself');
});

test('several short gaps cannot be added together to satisfy the continuous-gap minimum', () => {
  const source = data([task('a', { date: day, start: 570, duration: 30, fixed: true }), task('b', { date: day, start: 630, duration: 30, fixed: true }), task('inbox')]);
  source.settings.dayEnd = 690;
  assert.equal(findInboxSuggestion(source, localMoment(day, 540)), null);
  source.settings.inboxReminderMinMinutes = 30;
  source.settings.buffer = 0;
  assert.ok(findInboxSuggestion(source, localMoment(day, 540)));
});

test('task duration, transition buffer, snooze and hard deadline all limit eligibility', () => {
  const source = data([task('long', { duration: 91 }), task('snoozed', { inboxReminderAfter: '2026-10-23' }), task('expired', { deadline: '2026-10-19' }), task('completed', { completed: true }), task('fixed', { fixed: true }), task('inbox')]);
  source.settings.dayEnd = 640;
  assert.equal(findInboxSuggestion(source, localMoment(day, 540))?.taskId, 'inbox');
  assert.equal(findInboxSuggestion(source, localMoment(day, 540), 'snoozed'), null);
  assert.equal(findInboxSuggestion(source, localMoment('2026-10-23', 540), 'snoozed')?.taskId, 'snoozed');
  const overnight = data([task('deadline', { deadline: day, duration: 90 })]);
  overnight.settings = { ...overnight.settings, dayStart: 1380, dayEnd: 1800 };
  assert.equal(findInboxSuggestion(overnight, localMoment(day, 1380)), null);
});

test('completed events and adjacent-day events block time, with flexible-task buffers', () => {
  const source = data([task('done', { date: day, start: 540, duration: 60, completed: true }), task('night', { date: '2026-10-21', start: 0, duration: 120, fixed: true }), task('inbox')]);
  source.settings.dayEnd = 1800;
  assert.deepEqual(freeWindows(source.tasks, source.settings, day), [{ start: 610, end: 1440 }, { start: 1560, end: 1800 }]);
  const morning = data([task('previous', { date: '2026-10-19', start: 1410, duration: 120, fixed: true }), task('inbox')]);
  morning.settings = { ...morning.settings, dayStart: 0, dayEnd: 360 };
  assert.equal(findInboxSuggestion(morning, localMoment(day, 0))?.at, localMoment(day, 90).getTime());
});

test('overnight preferences use real dates and never schedule two nudges on the same calendar day', () => {
  const source = data();
  source.settings = { ...source.settings, dayEnd: 1800 };
  const suggestions = planInboxReminders(source, localMoment(day, 60), {});
  assert.equal(suggestions[0].planningDate, '2026-10-19');
  assert.equal(suggestions[0].day, day);
  assert.equal(suggestions[0].at, localMoment(day, 65).getTime());
  assert.equal(new Set(suggestions.map(item => item.day)).size, suggestions.length);
  assert.equal(suggestions.length, 7);
});

test('disabled, demo and empty inboxes produce no notifications; preference hours stay respected', () => {
  assert.deepEqual(planInboxReminders({ ...data(), demo: true }, localMoment(day, 600), {}), []);
  const disabled = data(); disabled.settings.inboxRemindersEnabled = false;
  assert.deepEqual(planInboxReminders(disabled, localMoment(day, 600), {}), []);
  assert.deepEqual(planInboxReminders(data([]), localMoment(day, 600), {}), []);
  const before = planInboxReminders(data(), localMoment(day, 300), {})[0];
  assert.equal(before.at, localMoment(day, 540).getTime());
  assert.equal(validSettings({ ...data().settings, inboxReminderMinMinutes: 15 }), false);
  assert.equal(validSettings({ ...data().settings, inboxReminderMinMinutes: 120 }), true);
});

test('future reservations survive refresh; a delivered reservation spends the day across restarts', () => {
  const source = data();
  const moment = localMoment(day, 600);
  const first = planInboxReminders(source, moment, {});
  const ledger = retainReminderLedger({}, first, moment);
  assert.deepEqual(planInboxReminders(source, localMoment(day, 602), ledger), first);
  const after = planInboxReminders(source, localMoment(day, 606), parseReminderLedger(JSON.stringify(ledger), localMoment(day, 606)));
  assert.equal(after.some(item => item.day === day), false);
  const blocked = data([task('busy', { date: day, start: 600, duration: 120, fixed: true }), task('inbox')]);
  assert.equal(planInboxReminders(blocked, localMoment(day, 602), ledger)[0].at, localMoment(day, 720).getTime());
});

test('recommendations rotate inbox candidates instead of repeating the same one daily', () => {
  const suggestions = planInboxReminders(data([task('a', { important: true }), task('b')]), localMoment(day, 600), {});
  assert.deepEqual(suggestions.slice(0, 3).map(item => item.taskId), ['a', 'b', 'a']);
});

test('confirmation rechecks the gap and changes only the chosen task', () => {
  const source = data([task('meeting', { date: day, start: 600, duration: 120, fixed: true }), task('inbox'), task('other')]);
  const result = acceptInboxSuggestion(source, 'inbox', localMoment(day, 610));
  assert.ok(result?.valid);
  assert.equal(result.tasks[1].start, 720);
  assert.equal(result.tasks[1].date, day);
  assert.equal(result.tasks[0], source.tasks[0]);
  assert.equal(result.tasks[2], source.tasks[2]);
  assert.equal(result.changes.length, 1);
  source.tasks.push(task('filled', { date: day, start: 720, duration: 360, fixed: true }));
  assert.equal(acceptInboxSuggestion(source, 'inbox', localMoment(day, 610)), null);
  assert.equal(acceptInboxSuggestion(data([task('inbox', { date: day, start: 600 })]), 'inbox', localMoment(day, 600)), null);
});

test('malformed frequency data suppresses a duplicate today and unrelated notification taps are ignored', () => {
  const moment = localMoment(day, 600);
  for (const raw of ['bad json', '[]', '{"bad":{}}']) {
    const ledger = parseReminderLedger(raw, moment);
    assert.equal(planInboxReminders(data(), moment, ledger).some(item => item.day === day), false);
  }
  assert.equal(decodeReminderResponse('other', { kind: 'inbox-suggestion', taskId: 'x', day }), null);
  assert.equal(decodeReminderResponse('liubai-inbox-' + day, { kind: 'task', taskId: 'x', day }), null);
  assert.equal(decodeReminderResponse('liubai-inbox-' + day, { kind: 'inbox-suggestion', taskId: 'x', day: '2026-10-21' }), null);
  assert.deepEqual(decodeReminderResponse('liubai-inbox-' + day, { kind: 'inbox-suggestion', taskId: 'x', day }), { id: 'liubai-inbox-' + day, taskId: 'x', day });
});

function harness() {
  let moment = localMoment(day, 600), granted = true, ledger: string | null = null, failWrite = false;
  const scheduled = new Map<string, { notification: LocalNotification; signature: string }>();
  const calls: string[] = [];
  const driver: NotificationDriver = {
    now: () => moment, permission: async () => granted,
    pending: async () => [...scheduled].map(([id, value]) => ({ id, signature: value.signature })),
    cancel: async id => { calls.push('cancel:' + id); scheduled.delete(id); },
    schedule: async (notification, signature) => { calls.push('schedule:' + notification.id); scheduled.set(notification.id, { notification, signature }); },
    readLedger: async () => ledger,
    writeLedger: async value => { calls.push('ledger'); if (failWrite) throw new Error('disk'); ledger = value; },
  };
  return { sync: createNotificationSync(driver), scheduled, calls, get ledger() { return ledger; },
    advance: (minutes: number) => { moment = localMoment(day, minutes); }, revoke: () => { granted = false; }, failWrite: () => { failWrite = true; } };
}

test('notification sync keeps unchanged requests and leaves foreign notifications untouched', async () => {
  const system = harness();
  await system.sync(data());
  assert.equal(system.scheduled.size, 7);
  assert.equal(system.calls[0], 'ledger', 'frequency reservation is persisted before any OS scheduling');
  const count = system.calls.length;
  system.scheduled.set('foreign', { notification: { id: 'foreign', at: 0, title: '', body: '', channel: 'tasks', data: {} }, signature: 'external' });
  await system.sync(data());
  assert.equal(system.calls.length, count);
  const filled = data([task('full', { date: day, start: 600, duration: 480, fixed: true }), task('inbox')]);
  await system.sync(filled);
  assert.equal(system.scheduled.has('liubai-inbox-' + day), false);
  assert.equal(system.scheduled.has('foreign'), true);
});

test('task and inbox switches are independent; revoked permission cancels both', async () => {
  const system = harness();
  const source = data([task('scheduled', { date: day, start: 900 }), task('inbox')]);
  source.settings.notificationsEnabled = true;
  await system.sync(source);
  assert.equal(system.scheduled.size, 9);
  source.settings.inboxRemindersEnabled = false;
  await system.sync(source);
  assert.equal(system.scheduled.size, 2);
  assert.ok(system.scheduled.has('liubai-scheduled'));
  assert.equal([...system.scheduled.values()].filter(item => item.notification.data.kind === 'task-end').length, 1);
  source.settings.inboxRemindersEnabled = true;
  source.settings.notificationsEnabled = false;
  await system.sync(source);
  assert.equal(system.scheduled.has('liubai-scheduled'), false);
  assert.equal(system.scheduled.size, 7);
  system.revoke();
  await system.sync(source);
  assert.equal(system.scheduled.size, 0);
});

test('a fired notification is not recreated after data changes or a same-day restart', async () => {
  const system = harness();
  const source = data();
  await system.sync(source);
  system.scheduled.delete('liubai-inbox-' + day);
  system.advance(606);
  source.tasks.push(task('new-inbox'));
  await system.sync(source);
  assert.equal(system.scheduled.has('liubai-inbox-' + day), false);
  assert.equal(dateKey(new Date(JSON.parse(system.ledger!)[day].at)), day);
});

test('frequency persistence failure prevents any new notification from being submitted', async () => {
  const system = harness(); system.failWrite();
  await assert.rejects(system.sync(data()), /disk/);
  assert.equal(system.scheduled.size, 0);
});
