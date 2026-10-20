import type { AppData } from './types.ts';
import { isQuick } from './quick.ts';
import { INBOX_REMINDER_PREFIX, localMoment, parseReminderLedger, planInboxReminders, retainReminderLedger, suggestionMessage } from './inboxReminders.ts';

export type LocalNotification = { id: string; at: number; title: string; body: string; channel: 'tasks' | 'inbox'; data: Record<string, string> };
export type NotificationDriver = {
  now: () => Date;
  permission: () => Promise<boolean>;
  pending: () => Promise<{ id: string; signature?: string }[]>;
  cancel: (id: string) => Promise<void>;
  schedule: (notification: LocalNotification, signature: string) => Promise<void>;
  readLedger: () => Promise<string | null>;
  writeLedger: (value: string) => Promise<void>;
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
      const [pending, rawLedger, granted] = await Promise.all([driver.pending(), driver.readLedger(), driver.permission()]);
      const enabled = !snapshot.demo && granted;
      const ledger = parseReminderLedger(rawLedger, moment);
      const suggestions = enabled ? planInboxReminders(snapshot, moment, ledger) : [];
      const desired: LocalNotification[] = [];
      if (enabled && snapshot.settings.notificationsEnabled) {
        desired.push(...snapshot.tasks.filter(task => !task.completed && task.date && task.start !== null)
          .map(task => ({ task, at: localMoment(task.date!, task.start!).getTime() })).filter(item => item.at > moment.getTime())
          .sort((a, b) => a.at - b.at).slice(0, 50).map(({ task, at }) => ({ id: `liubai-${task.id}`, at,
            title: isQuick(task) ? '留白 · 顺手做件小事' : '留白 · 接下来做这件事', body: task.title, channel: 'tasks' as const, data: { kind: isQuick(task) ? 'quick' : 'task', taskId: task.id } })));
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
