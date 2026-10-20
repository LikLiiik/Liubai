import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPlanToData } from '../src/planApply.ts';
import { createPlan } from '../src/scheduler.ts';
import { createEmpty } from '../src/seed.ts';

const entry = { id: 'history', date: '2026-10-21', createdAt: '2026-10-21T14:00:00', title: '临时有事' };
const request = { date: entry.date, now: 840, minutes: 30, reason: 'interruption' as const, mode: 'boundary' as const };

test('repeating a preview application cannot duplicate history or overwrite a later task', () => {
  const data = createEmpty();
  const plan = createPlan(data.tasks, data.settings, request);
  const first = applyPlanToData(data, plan, entry);
  assert.equal(first.data.history.length, 1);
  assert.deepEqual(first.data.history[0].snapshot, data.tasks);
  const duplicate = applyPlanToData(first.data, plan, entry);
  assert.equal(duplicate.data, first.data); assert.ok(duplicate.error);
  const changed = { ...first.data, tasks: first.data.tasks.map(task => ({ ...task, title: '已修改' })) };
  assert.equal(applyPlanToData(changed, plan, entry).data, changed);
});

test('changed preferences and invalid plans are rejected without altering tasks or review history', () => {
  const data = createEmpty();
  const plan = createPlan(data.tasks, data.settings, request);
  const changed = { ...data, settings: { ...data.settings, buffer: 20 } };
  assert.equal(applyPlanToData(changed, plan, entry).data, changed);
  assert.equal(applyPlanToData(data, { ...plan, valid: false }, entry).data, data);
  assert.equal(applyPlanToData(data, { ...plan, tasks: [plan.tasks[0], plan.tasks[0]] }, entry).data, data);
});

test('successive rescues keep separate undo snapshots and restore the previous interruption duration', () => {
  const data = createEmpty();
  const first = applyPlanToData(data, createPlan(data.tasks, data.settings, request), entry).data;
  const next = createPlan(first.tasks, first.settings, { ...request, minutes: 15 });
  const second = applyPlanToData(first, next, { ...entry, id: 'second' }).data;
  assert.equal(second.history.length, 2);
  assert.equal(second.tasks[0].duration, 45);
  assert.equal(second.history[0].snapshot[0].duration, 30);
  assert.equal(second.history[1].snapshot.length, 0);
  assert.equal(first.tasks[0].duration, 30);
});
