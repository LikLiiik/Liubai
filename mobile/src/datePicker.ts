export type DateParts = { year: number; month: number; day: number };
export const MIN_DATE_YEAR = 1900;
export const MAX_DATE_YEAR = 2199;
export const numberRange = (min: number, max: number) => Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
export function daysInMonth(year: number, month: number): number {
  return month === 2 ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function readDateParts(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match, year = Number(y), month = Number(m), day = Number(d);
  return year >= MIN_DATE_YEAR && year <= MAX_DATE_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? { year, month, day } : null;
}
export function datePartsKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
export function changeDatePart(parts: DateParts, part: keyof DateParts, value: number): { parts: DateParts; adjusted: boolean } | null {
  const max = part === 'year' ? MAX_DATE_YEAR : part === 'month' ? 12 : daysInMonth(parts.year, parts.month);
  const min = part === 'year' ? MIN_DATE_YEAR : 1;
  if (!Number.isInteger(value) || value < min || value > max) return null;
  const next = { ...parts, [part]: value };
  const day = Math.min(next.day, daysInMonth(next.year, next.month));
  return { parts: { ...next, day }, adjusted: day !== next.day };
}
