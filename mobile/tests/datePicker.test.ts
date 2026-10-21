import assert from 'node:assert/strict';
import test from 'node:test';
import { changeDatePart, datePartsKey, daysInMonth, numberRange, readDateParts } from '../src/datePicker.ts';
import { freshGuideProgress, guideStartStep, visitGuideStep } from '../src/guide.ts';
import { readWheelDraft } from '../src/timePicker.ts';

test('date fields detect impossible days and leap years rather than rolling them into another month', () => {
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(1900, 2), 28);
  assert.equal(daysInMonth(2100, 2), 28);
  for (const key of ['', '2026-2-01', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '1899-01-01', '2200-01-01', 'abc']) assert.equal(readDateParts(key), null, key);
  assert.deepEqual(readDateParts('2028-02-29'), { year: 2028, month: 2, day: 29 });
});

test('year and month changes explicitly clamp an existing day to the new month end', () => {
  const jan = { year: 2028, month: 1, day: 31 };
  assert.deepEqual(changeDatePart(jan, 'month', 2), { parts: { year: 2028, month: 2, day: 29 }, adjusted: true });
  assert.deepEqual(changeDatePart({ year: 2028, month: 2, day: 29 }, 'year', 2027), { parts: { year: 2027, month: 2, day: 28 }, adjusted: true });
  for (const value of [0, 13, 1.5, NaN, Infinity]) assert.equal(changeDatePart(jan, 'month', value), null);
  assert.equal(changeDatePart({ year: 2026, month: 4, day: 30 }, 'day', 31), null);
  assert.equal(changeDatePart(jan, 'year', 2200), null);
  assert.deepEqual(changeDatePart(jan, 'month', 3), { parts: { year: 2028, month: 3, day: 31 }, adjusted: false });
});

test('all selectable dates round trip and remain valid when switching month or year', () => {
  for (const year of [1900, 2000, 2026, 2028, 2100, 2199]) {
    for (const month of numberRange(1, 12)) {
      for (const day of numberRange(1, daysInMonth(year, month))) {
        const parts = { year, month, day };
        assert.deepEqual(readDateParts(datePartsKey(parts)), parts);
        assert.ok(readDateParts(datePartsKey(changeDatePart(parts, 'month', 2)!.parts)));
        assert.ok(readDateParts(datePartsKey(changeDatePart(parts, 'year', 2027)!.parts)));
      }
    }
  }
});

test('four digit year input allows unfinished prefixes but rejects out of range and malformed input', () => {
  const years = numberRange(1900, 2199);
  for (const text of ['', '2', '20', '202']) assert.deepEqual(readWheelDraft(text, years, 2026, false, 4), { text, value: null });
  assert.deepEqual(readWheelDraft('２０２８', years, 2026, false, 4), { text: '2028', value: 2028 });
  for (const text of ['2200', '1899', '2e3', '-200', '20260', '20/2', 'NaN', '2026-10-21']) assert.equal(readWheelDraft(text, years, 2026, false, 4), null);
  assert.deepEqual(readWheelDraft('0', numberRange(1, 12), 10), { text: '0', value: null });
  assert.equal(readWheelDraft('32', numberRange(1, 31), 21), null);
  assert.equal(readWheelDraft('29', numberRange(1, 28), 21), null);
});

test('returning v15 users start at date selection teaching without resetting completion', () => {
  const previous = { ...freshGuideProgress(), revision: 15, completedRevision: 15, deferredRevision: 15 };
  assert.equal(guideStartStep(previous), 'tasks');
  assert.equal(visitGuideStep(previous, 'tasks').completedRevision, 15);
});
