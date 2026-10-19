import { Platform } from 'react-native';
import { AndroidImportance, SchedulableTriggerInputTypes, setNotificationHandler, setNotificationChannelAsync,
  getPermissionsAsync, requestPermissionsAsync, getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync, scheduleNotificationAsync } from 'expo-notifications';
import type { AppData } from './types';

setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });

export async function enableNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('tasks', { name: '日程提醒', importance: AndroidImportance.DEFAULT });
  }
  const current = await getPermissionsAsync();
  if (current.granted) return true;
  return (await requestPermissionsAsync()).granted;
}

export async function syncNotifications(data: AppData): Promise<void> {
  const existing = await getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter(item => item.identifier.startsWith('liubai-')).map(item => cancelScheduledNotificationAsync(item.identifier)));
  if (data.demo || !data.settings.notificationsEnabled) return;
  const now = Date.now();
  const upcoming = data.tasks.filter(task => !task.completed && task.date && task.start !== null)
    .map(task => {
      const date = new Date(`${task.date}T00:00:00`);
      date.setMinutes(task.start!);
      return { task, date };
    }).filter(item => item.date.getTime() > now).sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 50);
  for (const { task, date } of upcoming) {
    await scheduleNotificationAsync({ identifier: `liubai-${task.id}`, content: { title: '留白 · 接下来做这件事', body: task.title, sound: true },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date, channelId: 'tasks' } });
  }
}
