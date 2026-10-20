import assert from 'node:assert/strict';
import test from 'node:test';
import { changePickerHour, durationTime, formatTimeInput, parseDuration, pickerHours, pickerMinutes, readTimeInput } from '../src/timePicker.ts';
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
