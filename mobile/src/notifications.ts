import type { AppData } from './types';
import type { ReminderResponse } from './inboxReminders';

export async function enableNotifications(): Promise<boolean> { return false; }
export async function syncNotifications(_data: AppData): Promise<void> {}
export function subscribeReminderResponses(_listener: (response: ReminderResponse) => void): () => void { return () => {}; }
