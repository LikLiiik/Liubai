import type { AppData } from './types';

export async function enableNotifications(): Promise<boolean> { return false; }
export async function syncNotifications(_data: AppData): Promise<void> {}
