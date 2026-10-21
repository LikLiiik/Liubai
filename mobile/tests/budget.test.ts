import assert from 'node:assert/strict';
import test from 'node:test';
import { dayBudget, timelineGaps } from '../src/budget.ts';
import type { Task } from '../src/types.ts';
const day = '2026-10-21';
const settings = { dayStart: 540, dayEnd: 1080, buffer: 0 };
const task = (id: string, start: number | null, duration: number, extra: Partial<Task> = {}): Task => ({
  id, title: id, start, duration, date: day, notes: '', category: 'work', priority: 'normal', important: false,
  completed: false, fixed: false, deadline: null, postponed: 0, ...extra,
});
test('parallel fixed and flexible events count shared minutes once rather than subtracting durations twice', () => {
  const tasks = [task('fixed', 540, 180, { fixed: true }), task('parallel', 600, 60), task('third', 690, 60)];
  const before = structuredClone(tasks);
  const result = dayBudget(tasks, settings, day, 540);
  assert.equal(result.occupied, 210);
  assert.equal(result.space, 330);
  assert.deepEqual(tasks, before);
  assert.equal(dayBudget(tasks, settings, day, 630).space, 330);
});
test('overlapping flexible buffers are merged and fixed occupancy does not generate additional buffers', () => {
  const result = dayBudget([task('a', 600, 60), task('b', 630, 60), task('fixed', 600, 120, { fixed: true })], { ...settings, buffer: 10 }, day, 540);
  assert.equal(result.occupied, 120);
  assert.equal(result.switching, 10);
  assert.equal(result.space, 410);
});
test('remaining-time budget clips elapsed work, respects actual completion and ignores point reminders', () => {
  const result = dayBudget([task('past', 540, 60), task('active', 600, 120),
    task('done', 720, 60, { completed: true, completedAt: `${day}T12:20:00` }),
    task('point', 900, 0, { kind: 'quick' })], settings, day, 630);
  assert.equal(result.occupied, 110);
  assert.equal(result.space, 340);
  assert.equal(dayBudget([], settings, day, 1200).space, 0);
});
test('cross-night occupancy and pending demand use the same planning date without counting the entire next day', () => {
  const result = dayBudget([task('night', 1380, 120, { fixed: true }), task('next', 0, 90, { date: '2026-10-22' }),
    task('pending', null, 30), task('inbox', null, 300, { date: null })], { dayStart: 1200, dayEnd: 1800, buffer: 0 }, day, 1440);
  assert.equal(result.occupied, 90);
  assert.equal(result.pendingMinutes, 30);
  assert.equal(result.space, 240);
});
test('timeline gaps use the end of the entire overlapping cluster, including nested and point events', () => {
  const gaps = timelineGaps([task('long', 540, 180), task('nested', 600, 60), task('point', 750, 0, { kind: 'quick' }), task('next', 780, 60)], day);
  assert.equal(gaps.get('nested'), 60);
  assert.equal(gaps.has('long'), false);
  assert.equal(gaps.has('point'), false);
});
