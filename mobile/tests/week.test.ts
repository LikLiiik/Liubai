import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, layoutDay, moveTaskTo, positionFromPoint, validDate, weekDates } from '../src/week.ts';
import type { Settings, Task } from '../src/types.ts';

const settings: Settings = { dayStart: 540, dayEnd: 1080, buffer: 10 };
const today = '2026-10-19';
function task(id: string, overrides: Partial<Task> = {}): Task {
  return { id, title: id, duration: 60, notes: '', category: 'work', priority: 'normal', important: false,
    fixed: false, completed: false, date: today, start: 600, deadline: null, postponed: 0, ...overrides };
}

test('week starts on Monday, including Sunday and year boundaries', () => {
  assert.deepEqual(weekDates('2026-10-25'), weekDates(today));
  assert.equal(weekDates('2027-01-01')[0], '2026-12-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2028-02-29'), true);
});

test('drag maps horizontal movement to dates and snaps vertical placement to 15 minutes', () => {
  const dates = weekDates(today);
  const result = positionFromPoint({ x: 205, y: 152, dayWidth: 100, startMinute: 420, endMinute: 1380,
    pixelsPerMinute: 1, dates, grabOffset: 20 });
  assert.deepEqual(result, { date: '2026-10-21', start: 555 });
  assert.equal(positionFromPoint({ x: -1, y: 50, dayWidth: 100, startMinute: 420, endMinute: 1380, pixelsPerMinute: 1, dates, grabOffset: 0 }), null);
  assert.equal(positionFromPoint({ x: 700, y: 50, dayWidth: 100, startMinute: 420, endMinute: 1380, pixelsPerMinute: 1, dates, grabOffset: 0 }), null);
});

test('flexible task moves across days without changing duration or other tasks', () => {
  const source = [task('moving'), task('other', { start: 800 })];
  const before = structuredClone(source);
  const result = moveTaskTo(source, 'moving', { date: '2026-10-21', start: 900 }, settings, today);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.tasks[0].date, '2026-10-21');
  assert.equal(result.tasks[0].duration, 60);
  assert.deepEqual(source, before);
  assert.deepEqual(result.tasks[1], source[1]);
  assert.ok(result.change);
});

test('fixed tasks cannot move without explicit confirmation and stay fixed after moving', () => {
  const source = [task('fixed', { fixed: true })];
  const position = { date: today, start: 900 };
  assert.equal(moveTaskTo(source, 'fixed', position, settings, today).ok, false);
  const allowed = moveTaskTo(source, 'fixed', position, settings, today, true);
  assert.equal(allowed.ok, true);
  if (!allowed.ok) return;
  assert.equal(allowed.tasks[0].fixed, true);
  assert.equal(allowed.tasks[0].start, 900);
  assert.equal(moveTaskTo(allowed.tasks, 'fixed', { date: today, start: 1000 }, settings, today).ok, false);
});

test('conflict rejects the drop, including overlaps with completed or fixed tasks', () => {
  for (const other of [task('other', { start: 900 }), task('other', { start: 900, fixed: true }), task('other', { start: 900, completed: true })]) {
    const source = [task('moving'), other];
    const result = moveTaskTo(source, 'moving', { date: today, start: 915 }, settings, today);
    assert.equal(result.ok, false);
    assert.equal(source[0].start, 600);
  }
});

test('adjacent times are legal, hard deadlines and midnight crossings are protected', () => {
  assert.equal(moveTaskTo([task('a'), task('b', { start: 900 })], 'a', { date: today, start: 840 }, settings, today).ok, true);
  assert.equal(moveTaskTo([task('a', { deadline: today })], 'a', { date: '2026-10-20', start: 600 }, settings, today).ok, false);
  assert.equal(moveTaskTo([task('a')], 'a', { date: today, start: 1410 }, settings, today).ok, false);
  assert.equal(moveTaskTo([task('a')], 'a', { date: '2026-02-30', start: 600 }, settings, today).ok, false);
});

test('non-preferred hours require permission and leave original data untouched until confirmed', () => {
  const source = [task('a')];
  const before = structuredClone(source);
  for (const start of [0, 525, 1035, 1380]) {
    const result = moveTaskTo(source, 'a', { date: today, start }, settings, today);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.confirmation, 'outside-preferences');
    assert.deepEqual(source, before);
    const confirmed = moveTaskTo(source, 'a', { date: today, start }, settings, today, false, true);
    assert.equal(confirmed.ok, true);
    if (confirmed.ok) {
      assert.equal(confirmed.tasks[0].start, start);
      assert.equal(confirmed.tasks[0].duration, 60);
      assert.ok(confirmed.warnings.length);
    }
  }
});

test('preferred boundaries include tasks starting at dayStart and ending at dayEnd', () => {
  for (const start of [settings.dayStart, settings.dayEnd - 60]) {
    const result = moveTaskTo([task('a')], 'a', { date: today, start }, settings, today);
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.warnings, []);
  }
});

test('fixed and non-preferred hours require independent, one-time permissions', () => {
  const source = [task('a', { fixed: true })];
  const position = { date: today, start: 0 };
  assert.equal(moveTaskTo(source, 'a', position, settings, today, false, true).ok, false);
  const pending = moveTaskTo(source, 'a', position, settings, today, true);
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.confirmation, 'outside-preferences');
  const allowed = moveTaskTo(source, 'a', position, settings, today, true, true);
  assert.equal(allowed.ok, true);
  if (allowed.ok) {
    assert.equal(allowed.tasks[0].fixed, true);
    assert.equal(moveTaskTo(allowed.tasks, 'a', { date: today, start: 1380 }, settings, today, true).ok, false);
  }
});

test('confirmation cannot bypass overlaps or hard deadlines, including midnight endings', () => {
  assert.equal(moveTaskTo([task('a'), task('b', { start: 0 })], 'a', { date: today, start: 0 }, settings, today, true, true).ok, false);
  assert.equal(moveTaskTo([task('a', { deadline: today })], 'a', { date: '2026-10-20', start: 0 }, settings, today, true, true).ok, false);
  assert.equal(moveTaskTo([task('a', { deadline: today })], 'a', { date: today, start: 1395 }, settings, today, true, true).ok, false);
});

test('full-day grid maps midnight and late-night positions regardless of preferences', () => {
  const input = { dayWidth: 100, startMinute: 0, endMinute: 1440, pixelsPerMinute: 0.5, dates: weekDates(today), grabOffset: 0 };
  assert.deepEqual(positionFromPoint({ ...input, x: 20, y: 0 }), { date: today, start: 0 });
  assert.deepEqual(positionFromPoint({ ...input, x: 620, y: 712 }), { date: '2026-10-25', start: 1425 });
  assert.equal(positionFromPoint({ ...input, x: 20, y: 720 }), null);
});

test('completed tasks are not draggable, unscheduled tasks can be placed on the grid', () => {
  assert.equal(moveTaskTo([task('a', { completed: true })], 'a', { date: today, start: 900 }, settings, today).ok, false);
  const result = moveTaskTo([task('a', { start: null, date: null })], 'a', { date: today, start: 900 }, settings, today);
  assert.equal(result.ok, true);
});

test('dropping at the original position produces no history entry', () => {
  const result = moveTaskTo([task('a')], 'a', { date: today, start: 600 }, settings, today);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.change, null);
  const outside = moveTaskTo([task('a', { start: 0 })], 'a', { date: today, start: 0 }, settings, today);
  assert.equal(outside.ok, true);
  if (outside.ok) assert.equal(outside.change, null);
});

test('overlapping cards use separate lanes while adjacent cards reclaim the full width', () => {
  const layout = layoutDay([task('a'), task('b', { start: 630 }), task('c', { start: 690 })]);
  assert.equal(layout[0].lanes, 2);
  assert.notEqual(layout[0].lane, layout[1].lane);
  assert.equal(layout[2].lanes, 1);
});
