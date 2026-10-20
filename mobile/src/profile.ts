import type { Settings } from './types.ts';

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
  const hour = Math.floor(minute / 60);
  const greeting = hour < 5 ? '凌晨好' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  return nickname ? `${nickname}，${greeting}` : greeting;
}
