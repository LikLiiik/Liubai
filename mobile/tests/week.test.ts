import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, layoutDay, moveTaskTo, overlapConsentKey, positionFromPoint, validDate, weekDates } from '../src/week.ts';
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

test('overlap requests confirmation before the drop, including completed or fixed events', () => {
  for (const other of [task('other', { start: 900 }), task('other', { start: 900, fixed: true }), task('other', { start: 900, completed: true })]) {
    const source = [task('moving'), other];
    const result = moveTaskTo(source, 'moving', { date: today, start: 915 }, settings, today);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.confirmation, 'overlap');
    assert.equal(source[0].start, 600);
    const accepted = moveTaskTo(source, 'moving', { date: today, start: 915 }, settings, today, false, false, true);
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.tasks[0].start, 915);
      assert.equal(accepted.tasks[1], other);
      assert.equal(accepted.conflicts[0], other);
      assert.ok(accepted.change?.reason.includes('经确认保留重叠安排'));
    }
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

test('preference consent cannot bypass overlap consent or hard deadlines, including midnight endings', () => {
  assert.equal(moveTaskTo([task('a'), task('b', { start: 0 })], 'a', { date: today, start: 0 }, settings, today, true, true).ok, false);
  assert.equal(moveTaskTo([task('a', { deadline: today })], 'a', { date: '2026-10-20', start: 0 }, settings, today, true, true).ok, false);
  assert.equal(moveTaskTo([task('a', { deadline: today })], 'a', { date: today, start: 1395 }, settings, today, true, true).ok, false);
});

test('overlap, fixed movement and outside-preference consent remain independent and apply only once', () => {
  const source = [task('a', { fixed: true }), task('b', { start: 0 })];
  const position = { date: today, start: 0 };
  assert.equal(moveTaskTo(source, 'a', position, settings, today, false, true, true).ok, false);
  const outside = moveTaskTo(source, 'a', position, settings, today, true, false, true);
  assert.equal(outside.ok, false);
  if (!outside.ok) assert.equal(outside.confirmation, 'outside-preferences');
  const overlap = moveTaskTo(source, 'a', position, settings, today, true, true);
  assert.equal(overlap.ok, false);
  if (!overlap.ok) assert.equal(overlap.confirmation, 'overlap');
  const accepted = moveTaskTo(source, 'a', position, settings, today, true, true, true);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.tasks[0].fixed, true);
  assert.equal(moveTaskTo(accepted.tasks, 'a', { date: today, start: 15 }, settings, today, true, true).ok, false);
  assert.deepEqual(source[0], task('a', { fixed: true }));
});

test('even explicit overlap consent cannot bypass a deadline, invalid date or completed-task protection', () => {
  const source = [task('a', { deadline: today }), task('b', { start: 15, date: '2026-10-20' })];
  assert.equal(moveTaskTo(source, 'a', { date: '2026-10-20', start: 0 }, settings, today, true, true, true).ok, false);
  assert.equal(moveTaskTo(source, 'a', { date: '2026-02-30', start: 0 }, settings, today, true, true, true).ok, false);
  assert.equal(moveTaskTo([task('a', { completed: true })], 'a', { date: today, start: 900 }, settings, today, true, true, true).ok, false);
});

test('manual overlap across midnight uses real dates and preserves the other event', () => {
  const nextDate = '2026-10-20';
  const source = [task('night', { start: 1380, duration: 120 }), task('early', { date: nextDate, start: 30, duration: 60 })];
  const position = { date: nextDate, start: 0 };
  const pending = moveTaskTo(source, 'early', position, settings, today, false, true);
  assert.equal(pending.ok, false);
  if (!pending.ok) assert.equal(pending.confirmation, 'overlap');
  const accepted = moveTaskTo(source, 'early', position, settings, today, false, true, true);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.tasks[0], source[0]);
    assert.equal(accepted.tasks[1].date, nextDate);
    assert.equal(accepted.tasks[1].start, 0);
  }
});

test('overlap consent belongs to the precise task position and overlapping event set', () => {
  const proposed = task('a');
  const conflicts = [task('b'), task('c', { start: 620 })];
  const key = overlapConsentKey(proposed, conflicts);
  assert.equal(overlapConsentKey(proposed, conflicts.slice().reverse()), key);
  assert.notEqual(overlapConsentKey({ ...proposed, start: 615 }, conflicts), key);
  assert.notEqual(overlapConsentKey({ ...proposed, duration: 90 }, conflicts), key);
  assert.notEqual(overlapConsentKey(proposed, [conflicts[0]]), key);
  assert.notEqual(overlapConsentKey(proposed, [conflicts[0], { ...conflicts[1], start: 630 }]), key);
  assert.notEqual(overlapConsentKey(proposed, [...conflicts, task('new')]), key);
});

test('saving an existing overlapping position unchanged does not ask again or create history', () => {
  const result = moveTaskTo([task('a'), task('b')], 'a', { date: today, start: 600 }, settings, today);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.change, null);
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
