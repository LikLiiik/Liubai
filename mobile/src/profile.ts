import type { Settings } from './types.ts';
import { greetingChoices, greetingPeriod, personalizeGreeting } from './greetings.ts';

export function normalizeNickname(value: string): string | null {
  const name = value.trim().replace(/\s+/gu, ' ');
  return /[\p{Cc}\p{Cf}]/u.test(name.replace(/\u200d/g, '')) || [...name].length > 20 ? null : name;
}
export function validNickname(value: unknown): boolean {
  return value === undefined || typeof value === 'string' && normalizeNickname(value) === value;
}
export function withNickname(settings: Settings, value: string): Settings | null {
  const nickname = normalizeNickname(value);
  return nickname === null ? null : { ...settings, nickname: nickname || undefined };
}
export function homeGreeting(nickname: string | undefined, minute: number): string {
  return personalizeGreeting(nickname, greetingChoices(greetingPeriod(minute))[0].title);
}
