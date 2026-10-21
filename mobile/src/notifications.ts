import type { AppData, NotificationAccess } from './types';
import type { ReminderResponse } from './inboxReminders';
import type { EndCompletion, EndResponse } from './taskEndReminders';

export async function enableNotifications(): Promise<boolean> { return false; }
export async function getNotificationAccess(): Promise<NotificationAccess> { return { status: 'unsupported', canAskAgain: false }; }
export async function syncNotifications(_data: AppData): Promise<void> {}
export function subscribeReminderResponses(_listener: (response: ReminderResponse) => void): () => void { return () => {}; }
export function subscribeEndResponses(_listener: (response: EndResponse) => void, _onError: () => void): () => void { return () => {}; }
export async function pendingEndCompletions(): Promise<EndCompletion[]> { return []; }
export async function acknowledgeEndCompletions(_data: AppData): Promise<void> {}
