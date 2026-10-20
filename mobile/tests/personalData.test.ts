import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemo, createEmpty, personalData } from '../src/seed.ts';

test('first use starts empty with real time and no tutorial fixture tasks', () => {
  const data = createEmpty();
  assert.equal(data.demo, false);
  assert.deepEqual(data.tasks, []);
  assert.deepEqual(data.history, []);
  assert.strictEqual(personalData(data), data);
});
test('an untouched older demo is removed while notification choices and preferences survive', () => {
  const demo = createDemo('2026-09-01');
  demo.settings = { dayStart: 600, dayEnd: 1560, buffer: 15, notificationsEnabled: true, inboxRemindersEnabled: true, inboxReminderMinMinutes: 47 };
  const original = JSON.stringify(demo);
  const result = personalData(demo);
  assert.deepEqual(result, createEmpty(demo.settings));
  assert.equal(JSON.stringify(demo), original);
  assert.notStrictEqual(result.settings, demo.settings);
});
test('legacy demos with added, edited, completed, removed or imported work preserve all tasks and history', () => {
  for (const edit of ['added', 'edited', 'completed', 'removed', 'history']) {
    const data = createDemo('2026-09-01');
    if (edit === 'added') data.tasks.push({ ...data.tasks[0], id: 'personal', title: '我的安排' });
    if (edit === 'edited') data.tasks[2].notes = '自己的备注';
    if (edit === 'completed') data.tasks[2].completed = true;
    if (edit === 'removed') data.tasks.pop();
    if (edit === 'history') data.history.push({ id: 'history', date: '2026-09-01', createdAt: '', title: '调整', changes: [], snapshot: [], appliedTasks: data.tasks, snapshotDemo: true });
    const result = personalData(data);
    assert.equal(result.demo, false);
    assert.deepEqual(result.tasks, data.tasks);
    assert.equal(result.history.length, data.history.length);
    assert.ok(result.history.every(entry => !entry.snapshotDemo));
    assert.equal(data.demo, true, 'migration does not mutate its input');
  }
});
