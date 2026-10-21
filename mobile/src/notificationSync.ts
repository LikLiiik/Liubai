import type { AppData } from './types.ts';
import { isQuick } from './quick.ts';
import { END_CATEGORY, END_RESCUE, decodeEndResponse, endAt, endReminderFor, endResponseTarget } from './taskEndReminders.ts';
import { INBOX_REMINDER_PREFIX, localMoment, parseReminderLedger, planInboxReminders, retainReminderLedger, suggestionMessage } from './inboxReminders.ts';

export type LocalNotification = { id: string; at: number; title: string; body: string; channel: 'tasks' | 'inbox'; category?: string; data: Record<string, string> };
export type NotificationDriver = {
  now: () => Date;
  permission: () => Promise<boolean>;
  pending: () => Promise<{ id: string; signature?: string }[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (notification: LocalNotification, signature: string) => Promise<void>;
  readLedger: () => Promise<string | null>;
  writeLedger: (value: string) => Promise<void>;
  presented?: () => Promise<{ id: string; data: Record<string, unknown> }[]>;
  dismiss?: (id: string) => Promise<void>;
};
export const notificationSignature = (notification: LocalNotification) => JSON.stringify(notification);

export function createNotificationSync(driver: NotificationDriver): (data: AppData) => Promise<void> {
  let queue = Promise.resolve();
  let latest: AppData;
  return data => {
    latest = data;
    queue = queue.catch(() => {}).then(async () => {
      const snapshot = latest;
      const moment = driver.now();
      const [pending, rawLedger, granted, presented] = await Promise.all([driver.pending(), driver.readLedger(), driver.permission(), driver.presented?.() ?? []]);
      const enabled = !snapshot.demo && granted;
      for (const notification of presented) {
        if (!notification.id.startsWith('liubai-end-')) continue;
        const event = decodeEndResponse(notification.id, notification.data, END_RESCUE);
        if (!enabled || !snapshot.settings.notificationsEnabled || !event || !endResponseTarget(snapshot, event, moment)) await driver.dismiss?.(notification.id);
      }
      const ledger = parseReminderLedger(rawLedger, moment);
      const suggestions = enabled ? planInboxReminders(snapshot, moment, ledger) : [];
      const desired: LocalNotification[] = [];
      if (enabled && snapshot.settings.notificationsEnabled) {
        const events: LocalNotification[] = [];
        for (const task of snapshot.tasks.filter(task => !task.completed && task.date && task.start !== null)) {
          const start = localMoment(task.date!, task.start!).getTime();
          if (start > moment.getTime()) events.push({ id: `liubai-${task.id}`, at: start,
            title: isQuick(task) ? '留白 · 顺手做件小事' : '留白 · 接下来做这件事', body: task.title,
            channel: 'tasks', data: { kind: isQuick(task) ? 'quick' : 'task', taskId: task.id } });
          const end = endReminderFor(task);
          if (end && endAt(end) > moment.getTime()) events.push({ id: end.id, at: endAt(end), title: '留白 · 这件事完成了吗？',
            body: `「${task.title}」已到结束时间`, channel: 'tasks', category: END_CATEGORY,
            data: { kind: 'task-end', taskId: task.id, date: end.date, start: String(end.start), duration: String(end.duration) } });
        }
        // Share the existing OS request budget between start and end reminders.
        desired.push(...events.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, 50));
      }
      for (const suggestion of suggestions) desired.push({ id: INBOX_REMINDER_PREFIX + suggestion.day, at: suggestion.at,
        title: '留白 · 有一段空闲时间', body: suggestionMessage(suggestion), channel: 'inbox',
        data: { kind: 'inbox-suggestion', taskId: suggestion.taskId, day: suggestion.day, planningDate: suggestion.planningDate } });
      const expected = new Map(desired.map(notification => [notification.id, notification]));
      const existing = new Map(pending.map(notification => [notification.id, notification]));
      for (const notification of pending) {
        if (!notification.id.startsWith('liubai-')) continue;
        const next = expected.get(notification.id);
        if (!next || notification.signature !== notificationSignature(next)) await driver.cancel(notification.id);
      }
      const nextLedger = retainReminderLedger(ledger, suggestions, moment);
      const encoded = JSON.stringify(nextLedger);
      // Reserve before scheduling: an app/process restart cannot send a second nudge that day.
      if (encoded !== rawLedger) await driver.writeLedger(encoded);
      for (const notification of desired) {
        const signature = notificationSignature(notification);
        if (existing.get(notification.id)?.signature !== signature) await driver.schedule(notification, signature);
      }
    });
    return queue;
  };
}
