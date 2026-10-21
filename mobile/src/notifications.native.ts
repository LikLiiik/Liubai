import { Platform } from 'react-native';
import { AndroidImportance, SchedulableTriggerInputTypes, setNotificationHandler, setNotificationChannelAsync,
  getPermissionsAsync, requestPermissionsAsync, getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync, scheduleNotificationAsync, addNotificationResponseReceivedListener,
  getLastNotificationResponse, clearLastNotificationResponse, IosAuthorizationStatus, setNotificationCategoryAsync,
  registerTaskAsync, dismissNotificationAsync, getPresentedNotificationsAsync, type NotificationTaskPayload, type NotificationResponse, type NotificationPermissionsStatus } from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import Storage from 'expo-sqlite/kv-store';
import { createNotificationSync } from './notificationSync';
import { decodeReminderResponse, type ReminderResponse } from './inboxReminders';
import type { NotificationAccess } from './types';
import { createEndReceiptStore, decodeEndResponse, END_ACTIONS, END_CATEGORY, type EndResponse } from './taskEndReminders';

const endReceipts = createEndReceiptStore({ keys: () => Storage.getAllKeys(), get: key => Storage.getItem(key),
  set: (key, value) => Storage.setItem(key, value), remove: key => Storage.removeItem(key) });
export const pendingEndCompletions = endReceipts.pending;
export const acknowledgeEndCompletions = endReceipts.acknowledge;
const END_BACKGROUND_TASK = 'liubai_event_end_actions';

async function saveEndResponse(response: NotificationResponse): Promise<EndResponse | null> {
  const request = response.notification.request;
  const decoded = decodeEndResponse(request.identifier, request.content.data ?? {}, response.actionIdentifier);
  if (decoded?.action === 'complete') {
    await endReceipts.enqueue(decoded, new Date());
    // Completion is already durable; notification tray cleanup can retry at sync.
    await dismissNotificationAsync(request.identifier).catch(() => {});
  }
  return decoded;
}
// Imported before the root layout mounts, including in Android's headless runtime.
if (Platform.OS === 'android' && !TaskManager.isTaskDefined(END_BACKGROUND_TASK)) {
  TaskManager.defineTask<NotificationTaskPayload>(END_BACKGROUND_TASK, async ({ data, error }) => {
    if (!error && data && 'actionIdentifier' in data) await saveEndResponse(data);
  });
}

setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

async function channels() {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('tasks', { name: '日程提醒', importance: AndroidImportance.DEFAULT });
    await setNotificationChannelAsync('inbox', { name: '收集箱空闲提醒', importance: AndroidImportance.DEFAULT });
  }
  let background = false;
  if (Platform.OS === 'android') {
    try {
      if (await TaskManager.isAvailableAsync()) {
        if (!await TaskManager.isTaskRegisteredAsync(END_BACKGROUND_TASK)) await registerTaskAsync(END_BACKGROUND_TASK);
        background = true;
      }
    } catch { /* Keep one-tap completion available through the foreground handler. */ }
  }
  await setNotificationCategoryAsync(END_CATEGORY, END_ACTIONS.map(action => ({ ...action,
    options: { ...action.options, opensAppToForeground: action.options.opensAppToForeground || !background } })));
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
  presented: async () => (await getPresentedNotificationsAsync()).map(item => ({ id: item.request.identifier, data: item.request.content.data ?? {} })),
  dismiss: dismissNotificationAsync,
  readLedger: () => Storage.getItem('liubai.inbox-reminders.v1'),
  writeLedger: value => Storage.setItem('liubai.inbox-reminders.v1', value),
  schedule: async (notification, signature) => {
    await scheduleNotificationAsync({ identifier: notification.id,
      content: { title: notification.title, body: notification.body, sound: true, autoDismiss: true, categoryIdentifier: notification.category,
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

export function subscribeEndResponses(listener: (response: EndResponse) => void, onError: () => void): () => void {
  const seen = new Set<string>();
  let active = true;
  function handle(response: ReturnType<typeof getLastNotificationResponse>) {
    if (!response) return;
    const request = response.notification.request;
    if (!decodeEndResponse(request.identifier, request.content.data ?? {}, response.actionIdentifier)) return;
    const key = `${request.identifier}/${response.actionIdentifier}`;
    if (seen.has(key)) return;
    seen.add(key);
    void saveEndResponse(response).then(decoded => {
      if (decoded && active) { listener(decoded); clearLastNotificationResponse(); }
    }).catch(() => { seen.delete(key); if (active) onError(); });
  }
  const subscription = addNotificationResponseReceivedListener(handle);
  handle(getLastNotificationResponse());
  return () => { active = false; subscription.remove(); };
}
