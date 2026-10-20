import assert from 'node:assert/strict';
import test from 'node:test';
import { changePickerDay, changePickerHour, durationTime, formatTimeInput, parseDuration, pickerHours, pickerMinutes, readTimeInput, readWheelDraft, readWheelNumber } from '../src/timePicker.ts';
import { validSettings } from '../src/time.ts';

test('duration entry accepts minutes, hours/minutes and explicit units without treating a duration as a clock', () => {
  for (const value of ['90', '01:30', '1小时30分钟', '１：３０', '90分钟']) assert.equal(parseDuration(value), 90);
  for (const value of ['', '1:60', '-1', '1.5', 'abc', 'NaN']) assert.equal(parseDuration(value), null);
  assert.equal(parseDuration('0'), 0);
  assert.equal(durationTime(720), '12:00');
  for (let minute = 0; minute <= 720; minute++) assert.equal(parseDuration(durationTime(minute)), minute);
});
test('end-time entry and wheel values agree through next-day six without changing normal clock rules', () => {
  assert.equal(readTimeInput('凌晨2点半', 'end', 540), 1590);
  assert.equal(formatTimeInput(1800, 'end'), '次日 06:00');
  assert.equal(readTimeInput('次日6点01', 'end', 540), null);
  assert.equal(readTimeInput('24:00', 'clock'), null);
  assert.equal(readTimeInput('930', 'clock'), 570);
  assert.deepEqual(pickerMinutes(30, 541, 1800), [0]);
  assert.equal(changePickerHour(23 * 60 + 59, 30, 541, 1800), 1800);
});
test('wheel hour changes preserve minutes where valid and clamp only at range boundaries', () => {
  for (const [min, max] of [[0, 1439], [541, 1800], [5, 720], [0, 60], [30, 120]]) {
    for (const hour of pickerHours(min, max)) {
      const minutes = pickerMinutes(hour, min, max);
      assert.ok(minutes.length > 0);
      for (const minute of minutes) assert.ok(hour * 60 + minute >= min && hour * 60 + minute <= max);
      for (const minute of [0, 17, 59]) {
        const result = changePickerHour(minute, hour, min, max);
        assert.ok(result >= min && result <= max);
        assert.ok(minutes.includes(result % 60));
      }
    }
  }
  assert.equal(changePickerHour(90, 0, 5, 720), 30);
  assert.equal(changePickerHour(59, 12, 5, 720), 720);
});
test('free-period thresholds persist arbitrary whole minutes within the existing bounds', () => {
  const settings = { dayStart: 540, dayEnd: 1320, buffer: 10 };
  assert.equal(validSettings({ ...settings, inboxReminderMinMinutes: 47 }), true);
  for (const value of [29, 121, 60.5, NaN]) assert.equal(validSettings({ ...settings, inboxReminderMinMinutes: value }), false);
});

test('separate hour and minute inputs accept unpadded digits and retain next-day meaning within valid ranges', () => {
  assert.equal(readWheelNumber('7', pickerHours(0, 1439), 14), 7);
  assert.equal(readWheelNumber('０５', pickerMinutes(14, 0, 1439), 30), 5);
  assert.equal(readWheelNumber('2', pickerHours(541, 1800), 18, true), 26);
  assert.equal(readWheelNumber('2', pickerHours(1, 1800), 26, true), 26);
  assert.equal(readWheelNumber('2', pickerHours(1, 1800), 10, true), 2);
  assert.equal(readWheelNumber('1', pickerMinutes(30, 541, 1800), 0), null);
  for (const invalid of ['', '2:30', '2.5', '-1', '60']) assert.equal(readWheelNumber(invalid, pickerMinutes(14, 0, 1439), 30), null);
});

test('split numeric entry rejects punctuation, letters, overflow and partial invalid pastes', () => {
  const values = pickerMinutes(0, 0, 1439);
  for (const invalid of ['9:30', '1.5', '-1', 'abc', ' 5', '5 ', '60', '99', '123', '5分钟', '１２３']) {
    assert.equal(readWheelDraft(invalid, values, 30), null, invalid);
  }
  assert.deepEqual(readWheelDraft('０５', values, 30), { text: '05', value: 5 });
  assert.deepEqual(readWheelDraft('', values, 30), { text: '', value: null });
  assert.deepEqual(readWheelDraft('0', pickerMinutes(0, 5, 720), 30), { text: '0', value: null });
  assert.deepEqual(readWheelDraft('05', pickerMinutes(0, 5, 720), 30), { text: '05', value: 5 });
  assert.equal(readWheelDraft('99', pickerHours(0, 1439), 9), null);
});

test('all split entry and wheel combinations respect contextual clock and duration limits', () => {
  for (const [min, max, clockHour] of [[0, 1439, false], [541, 1800, true], [5, 720, false], [0, 60, false], [30, 120, false]] as const) {
    const hours = pickerHours(min, max);
    for (const hour of hours) {
      for (let value = 0; value < 100; value++) {
        const readHour = readWheelDraft(String(value), hours, hour, clockHour);
        if (readHour?.value !== null && readHour?.value !== undefined) {
          const next = changePickerHour(hour * 60, readHour.value, min, max);
          assert.ok(next >= min && next <= max);
        }
        const readMinute = readWheelDraft(String(value), pickerMinutes(hour, min, max), 0);
        if (readMinute?.value !== null && readMinute?.value !== undefined) assert.ok(hour * 60 + readMinute.value >= min && hour * 60 + readMinute.value <= max);
      }
    }
  }
  assert.equal(readWheelDraft('1', pickerMinutes(30, 541, 1800), 0), null);
  assert.equal(readWheelDraft('1', pickerMinutes(12, 5, 720), 0), null);
});

test('explicit day selection preserves the clock where possible and enforces next-day six', () => {
  assert.equal(changePickerDay(150, 1, 1, 1800), 1590);
  assert.equal(changePickerDay(1590, 0, 1, 1800), 150);
  assert.equal(changePickerDay(1080, 1, 541, 1800), 1800);
  assert.equal(changePickerDay(1590, 0, 541, 1800), 541);
  assert.equal(changePickerDay(600, 2, 541, 1800), 600);
});
