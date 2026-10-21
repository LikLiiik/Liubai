import { parsePreferenceEnd, parseTime, preferenceTime } from './time.ts';
import { clock } from './utils.ts';

export type TimeInputMode = 'clock' | 'end' | 'duration';
export function parseDuration(value: string): number | null {
  const text = value.trim().replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 65296)).replace(/：/g, ':').replace(/\s/g, '');
  if (/^\d+$/.test(text)) return Number.isSafeInteger(Number(text)) ? Number(text) : null;
  const parts = /^(\d{1,3}):(\d{1,2})$/.exec(text);
  if (parts) return Number(parts[2]) < 60 ? Number(parts[1]) * 60 + Number(parts[2]) : null;
  const units = /^(?:(\d{1,3})(?:小时|时))?(?:(\d{1,3})(?:分钟|分))?$/.exec(text);
  return units && (units[1] || units[2]) ? Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0) : null;
}
export function durationTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function readTimeInput(value: string, mode: TimeInputMode, dayStart = 0): number | null {
  return mode === 'duration' ? parseDuration(value) : mode === 'end' ? parsePreferenceEnd(value, dayStart) : parseTime(value);
}
export function formatTimeInput(value: number, mode: TimeInputMode): string {
  return mode === 'duration' ? durationTime(value) : mode === 'end' ? preferenceTime(value) : clock(value);
}
export function pickerHours(min: number, max: number): number[] {
  return Array.from({ length: Math.floor(max / 60) - Math.floor(min / 60) + 1 }, (_, index) => Math.floor(min / 60) + index);
}
export function pickerMinutes(hour: number, min: number, max: number): number[] {
  return Array.from({ length: 60 }, (_, index) => index).filter(minute => hour * 60 + minute >= min && hour * 60 + minute <= max);
}
export function changePickerHour(value: number, hour: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, hour * 60 + value % 60));
}

export function readWheelNumber(text: string, values: number[], selected: number, clockHour = false, digits = 2): number | null {
  const normalized = text.trim().replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 65296));
  if (!/^\d+$/.test(normalized) || normalized.length > digits) return null;
  const number = Number(normalized);
  if (!clockHour) return values.includes(number) ? number : null;
  const candidates = values.filter(value => value % 24 === number);
  return candidates.find(value => Math.floor(value / 24) === Math.floor(selected / 24)) ?? candidates[0] ?? null;
}

// A leading zero may be a draft of 05, for example at a five-minute minimum.
// Only complete, allowed values are ever sent to the parent form.
export function readWheelDraft(text: string, values: number[], selected: number, clockHour = false, digits = 2): { text: string; value: number | null } | null {
  const normalized = text.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 65296));
  if (!/^\d*$/.test(normalized) || normalized.length > digits) return null;
  if (!normalized) return { text: '', value: null };
  const value = readWheelNumber(normalized, values, selected, clockHour, digits);
  if (value !== null) return { text: normalized, value };
  const prefix = values.some(item => String(clockHour ? item % 24 : item).padStart(digits, '0').startsWith(normalized));
  return prefix ? { text: normalized, value: null } : null;
}

export function changePickerDay(value: number, day: number, min: number, max: number): number {
  const lower = Math.max(min, day * 1440), upper = Math.min(max, (day + 1) * 1440 - 1);
  if (lower > upper) return value;
  return Math.min(upper, Math.max(lower, value % 1440 + day * 1440));
}
