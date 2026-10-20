import { Platform } from 'react-native';
import { AndroidImportance, SchedulableTriggerInputTypes, setNotificationHandler, setNotificationChannelAsync,
  getPermissionsAsync, requestPermissionsAsync, getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync, scheduleNotificationAsync, addNotificationResponseReceivedListener,
  getLastNotificationResponse, clearLastNotificationResponse, IosAuthorizationStatus, type NotificationPermissionsStatus } from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { createNotificationSync } from './notificationSync';
import { decodeReminderResponse, type ReminderResponse } from './inboxReminders';
import type { NotificationAccess } from './types';

setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

async function channels() {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('tasks', { name: '日程提醒', importance: AndroidImportance.DEFAULT });
    await setNotificationChannelAsync('inbox', { name: '收集箱空闲提醒', importance: AndroidImportance.DEFAULT });
  }
}

const allowed = (status: NotificationPermissionsStatus) => status.granted || status.ios?.status === IosAuthorizationStatus.PROVISIONAL;
export async function getNotificationAccess(): Promise<NotificationAccess> {
  const permission = await getPermissionsAsync();
  return { status: allowed(permission) ? 'granted' : permission.status, canAskAgain: permission.canAskAgain };
}
export async function enableNotifications(): Promise<boolean> {
  await channels();
  const current = await getPermissionsAsync();
  if (allowed(current)) return true;
  if (!current.canAskAgain) return false;
  return allowed(await requestPermissionsAsync());
}

export const syncNotifications = createNotificationSync({
  now: () => new Date(),
  permission: async () => {
    const permission = await getPermissionsAsync();
    if (allowed(permission)) await channels();
    return allowed(permission);
  },
  pending: async () => (await getAllScheduledNotificationsAsync()).map(item => ({ id: item.identifier,
    signature: typeof item.content.data?.liubaiSignature === 'string' ? item.content.data.liubaiSignature : undefined })),
  cancel: cancelScheduledNotificationAsync,
  readLedger: () => Storage.getItem('liubai.inbox-reminders.v1'),
  writeLedger: value => Storage.setItem('liubai.inbox-reminders.v1', value),
  schedule: async (notification, signature) => {
    await scheduleNotificationAsync({ identifier: notification.id,
      content: { title: notification.title, body: notification.body, sound: true, autoDismiss: true,
        data: { ...notification.data, liubaiSignature: signature } },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: new Date(notification.at), channelId: notification.channel } });
  },
});

export function subscribeReminderResponses(listener: (response: ReminderResponse) => void): () => void {
  const seen = new Set<string>();
  function handle(response: ReturnType<typeof getLastNotificationResponse>) {
    if (!response) return;
    const request = response.notification.request;
    const decoded = decodeReminderResponse(request.identifier, request.content.data);
    if (!decoded || seen.has(decoded.id)) return;
    seen.add(decoded.id); listener(decoded); clearLastNotificationResponse();
  }
  const subscription = addNotificationResponseReceivedListener(handle);
  handle(getLastNotificationResponse());
  return () => subscription.remove();
}
