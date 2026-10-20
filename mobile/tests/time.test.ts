import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarSegments, finishesByDeadline, inPlanningDay, nonPreferredRanges, normalizePosition, overlaps, parsePreferenceEnd, parseTime, planningContext, preferenceTime, validSettings } from '../src/time.ts';
import { outsidePreferredHours, moveTaskTo, positionFromPoint, weekDates } from '../src/week.ts';
import { createPlan, freeMinutes, scheduleTask } from '../src/scheduler.ts';
import type { Settings, Task } from '../src/types.ts';

const date = '2026-10-19';
const settings: Settings = { dayStart: 540, dayEnd: 1800, buffer: 10 };
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, notes: '', duration: 60, category: 'work', priority: 'normal', important: false, completed: false, fixed: false, date, start: null, deadline: null, postponed: 0, ...extra });

test('common time text is completed without requiring HH:mm punctuation', () => {
  for (const [text, expected] of [['9', 540], ['09', 540], ['930', 570], ['０９：３０', 570], ['9:', 540], ['9:3', 543], ['9.30', 570], ['9点半', 570], ['九点半', 570], ['九点一刻', 555], ['晚上11点', 1380], ['下午2点', 840], ['12am', 0]] as const) {
    assert.equal(parseTime(text), expected, text);
  }
  for (const text of ['', '99', '1260', '9:99', 'abc', '次日2', '2401']) assert.equal(parseTime(text), null, text);
});

test('preference endings infer next day, normalize extended clocks and enforce the 6AM maximum', () => {
  for (const text of ['6', '600', '凌晨六点', '次日6:00', '30:00', '3000']) assert.equal(parsePreferenceEnd(text, 540), 1800, text);
  assert.equal(parsePreferenceEnd('凌晨2点', 540), 1560);
  assert.equal(parsePreferenceEnd('24', 540), 1440);
  assert.equal(parsePreferenceEnd('0', 540), 1440);
  assert.equal(parsePreferenceEnd('次日00:30', 540), 1470);
  assert.equal(parsePreferenceEnd('6', 0), 360);
  for (const text of ['次日6:01', '30:01', '次日7', '早上8']) assert.equal(parsePreferenceEnd(text, 1080), null, text);
  assert.equal(preferenceTime(1440), '次日 00:00');
  assert.equal(preferenceTime(1800), '次日 06:00');
  assert.equal(validSettings(settings), true);
  assert.equal(validSettings({ ...settings, dayEnd: 1801 }), false);
});

test('overnight preference checks cover late night and early morning, including full duration', () => {
  assert.equal(outsidePreferredHours(1410, 90, settings), false);
  assert.equal(outsidePreferredHours(120, 120, settings), false);
  assert.equal(outsidePreferredHours(330, 30, settings), false);
  assert.equal(outsidePreferredHours(330, 45, settings), true);
  assert.equal(outsidePreferredHours(480, 30, settings), true);
  assert.deepEqual(nonPreferredRanges(settings), [{ start: 360, end: 540 }]);
  assert.deepEqual(nonPreferredRanges({ ...settings, dayStart: 0 }), []);
});

test('late-night planning continues across midnight until the preference window closes', () => {
  assert.deepEqual(planningContext('2027-01-01', 120, settings), { date: '2026-12-31', now: 1560 });
  assert.deepEqual(planningContext('2027-01-01', 360, settings), { date: '2027-01-01', now: 360 });
  assert.deepEqual(planningContext(date, 120, { ...settings, dayEnd: 1080 }), { date, now: 120 });
  assert.equal(inPlanningDay(task('early', { date: '2026-10-20', start: 120 }), date, settings), true);
  assert.equal(inPlanningDay(task('later', { date: '2026-10-20', start: 420 }), date, settings), false);
});

test('overnight tasks stay in real calendar coordinates and have two non-duplicating display segments', () => {
  const source = task('night', { date: '2026-12-31', start: 1410, duration: 90 });
  const segments = calendarSegments(source);
  assert.deepEqual(segments.map(({ date, start, duration, offset }) => ({ date, start, duration, offset })), [
    { date: '2026-12-31', start: 1410, duration: 30, offset: 0 },
    { date: '2027-01-01', start: 0, duration: 60, offset: 30 },
  ]);
  assert.equal(segments.reduce((sum, piece) => sum + piece.duration, 0), 90);
  assert.deepEqual(normalizePosition('2026-12-31', 1560), { date: '2027-01-01', start: 120 });
  assert.equal(overlaps(source, task('morning', { date: '2027-01-01', start: 45 })), true);
  assert.equal(overlaps(source, task('adjacent', { date: '2027-01-01', start: 60 })), false);
});

test('automatic placement uses next-day slots without colliding with next-day meetings', () => {
  const source = [task('new', { date: null }), task('meeting', { date: '2026-10-20', start: 0, duration: 60, fixed: true })];
  const result = scheduleTask(source, 'new', settings, date, 1440)!;
  assert.deepEqual([result[0].date, result[0].start], ['2026-10-20', 60]);
  assert.equal(source[0].start, null);
  assert.equal(freeMinutes(source, date, 1440, 1800), 300);
  assert.equal(scheduleTask([task('large', { duration: 90 })], 'large', settings, date, 1740), null);
});

test('automatic plans can cross midnight and replan early-morning work in the same overnight cycle', () => {
  const source = [task('night', { duration: 90 }), task('morning', { date: '2026-10-20', start: 120, duration: 60 })];
  const plan = createPlan(source, settings, { reason: 'rebalance', mode: 'boundary', now: 1410, minutes: 30, date });
  assert.equal(plan.valid, true);
  assert.deepEqual([plan.tasks[0].date, plan.tasks[0].start], [date, 1410]);
  assert.deepEqual([plan.tasks[1].date, plan.tasks[1].start], ['2026-10-20', 70]);
  assert.equal(plan.finish, 1570);
  const resumed = createPlan(plan.tasks, settings, { reason: 'rebalance', mode: 'balanced', now: 1680, minutes: 30, date });
  assert.equal(resumed.valid, true);
  assert.ok(resumed.finish <= 1800);
  assert.equal(resumed.deferred, 1);
});

test('cross-midnight interruptions preserve fixed next-day meetings and enforce 6AM', () => {
  const meeting = task('meeting', { date: '2026-10-20', start: 15, fixed: true });
  const blocked = createPlan([meeting], settings, { reason: 'interruption', mode: 'boundary', now: 1410, minutes: 90, date });
  assert.equal(blocked.valid, false);
  const allowed = createPlan([], settings, { reason: 'interruption', mode: 'boundary', now: 1410, minutes: 90, date });
  assert.equal(allowed.valid, true);
  assert.equal(allowed.tasks[0].duration, 90);
  assert.equal(createPlan([], settings, { reason: 'interruption', mode: 'balanced', now: 1770, minutes: 60, date }).valid, false);
});

test('a date deadline still ends at calendar midnight even when preferences extend to 6AM', () => {
  const due = task('due', { duration: 90, deadline: date });
  assert.equal(scheduleTask([due], 'due', settings, date, 1410), null);
  const plan = createPlan([due], settings, { reason: 'rebalance', mode: 'balanced', now: 1410, minutes: 30, date });
  assert.equal(plan.valid, false);
  assert.equal(finishesByDeadline(date, 1410, 30, date), true);
  assert.equal(finishesByDeadline(date, 1410, 31, date), false);
});

test('weekly night moves protect next-day collisions and retain confirmation outside preferences', () => {
  const source = [task('moving'), task('meeting', { date: '2026-10-20', start: 0, fixed: true })];
  assert.equal(moveTaskTo(source, 'moving', { date, start: 1410 }, settings, date).ok, false);
  const allowed = moveTaskTo([task('moving', { duration: 90 })], 'moving', { date, start: 1410 }, settings, date);
  assert.equal(allowed.ok, true);
  const early = moveTaskTo([task('moving')], 'moving', { date: '2026-10-20', start: 120 }, settings, date);
  assert.equal(early.ok, true);
  const outside = moveTaskTo([task('moving')], 'moving', { date, start: 480 }, settings, date);
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.confirmation, 'outside-preferences');
});

test('dragging the continuation segment preserves the whole task and resolves its prior-day start', () => {
  const position = positionFromPoint({ dates: weekDates(date), x: 120, y: 10, dayWidth: 100, startMinute: 0, endMinute: 1440, pixelsPerMinute: 1, grabOffset: 40, rollover: true });
  assert.deepEqual(position, { date, start: 1410 });
});
