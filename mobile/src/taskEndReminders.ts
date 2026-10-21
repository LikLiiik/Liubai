import type { AppData, Task } from './types.ts';
import { localMoment } from './inboxReminders.ts';
import { isQuick } from './quick.ts';
import { validDate } from './week.ts';
import { setTaskCompletion } from './completion.ts';

export const END_CATEGORY = 'liubai_event_end';
export const END_COMPLETE = 'liubai_event_complete';
export const END_RESCUE = 'liubai_event_rescue';
export const END_ACTIONS = [
  { identifier: END_COMPLETE, buttonTitle: '标记已完成', options: { opensAppToForeground: false } },
  { identifier: END_RESCUE, buttonTitle: '一键救场', options: { opensAppToForeground: true } },
];
export type EndReminder = { id: string; taskId: string; date: string; start: number; duration: number };
export type EndResponse = EndReminder & { action: 'complete' | 'rescue' };
export type EndCompletion = EndReminder & { completedAt: string; done?: boolean };
export const receiptId = (record: EndCompletion) => JSON.stringify([record.id, record.completedAt]);
export const endAt = (event: Pick<EndReminder, 'date' | 'start' | 'duration'>) => localMoment(event.date, event.start).getTime() + event.duration * 60000;
export const endReminderId = (task: Pick<EndReminder, 'taskId' | 'date' | 'start' | 'duration'>) =>
  `liubai-end-${task.taskId}-${task.date}-${task.start}-${task.duration}`;
export function endReminderFor(task: Task): EndReminder | null {
  if (isQuick(task) || !task.date || task.start === null || task.duration <= 0) return null;
  const event = { taskId: task.id, date: task.date, start: task.start, duration: task.duration };
  return { ...event, id: endReminderId(event) };
}
export function decodeEndResponse(id: string, value: Record<string, unknown>, actionIdentifier: string): EndResponse | null {
  if (value.kind !== 'task-end' || typeof value.taskId !== 'string' || !value.taskId || typeof value.date !== 'string'
    || !validDate(value.date) || typeof value.start !== 'string' || !/^\d+$/.test(value.start)
    || typeof value.duration !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.duration)) return null;
  const event = { id, taskId: value.taskId, date: value.date, start: Number(value.start), duration: Number(value.duration) };
  if (event.start < 0 || event.start >= 1440 || event.duration < 5 || event.duration > 720 || endReminderId(event) !== id) return null;
  if (actionIdentifier === END_COMPLETE) return { ...event, action: 'complete' };
  if (actionIdentifier === END_RESCUE || actionIdentifier === 'expo.modules.notifications.actions.DEFAULT') return { ...event, action: 'rescue' };
  return null;
}
export function endResponseTarget(data: AppData, event: EndReminder, moment: Date): Task | null {
  const task = data.tasks.find(item => item.id === event.taskId);
  if (!Number.isFinite(moment.getTime()) || data.demo || !task || task.completed || endReminderFor(task)?.id !== event.id
    || moment.getTime() < endAt(event) || moment.getTime() - endAt(event) > 7 * 86400000) return null;
  return task;
}
export function applyEndCompletions(data: AppData, records: EndCompletion[]): AppData {
  let result = data;
  for (const record of records) {
    const key = receiptId(record);
    if (record.done || result.notificationReceipts?.includes(key)) continue;
    const tasks = endResponseTarget(result, record, new Date(record.completedAt))
      ? setTaskCompletion(result.tasks, record.taskId, true, record.completedAt).tasks : result.tasks;
    result = { ...result, tasks, notificationReceipts: [...(result.notificationReceipts ?? []), key] };
  }
  return result;
}

export const END_RECEIPT_PREFIX = 'liubai.end-actions.v1.';
type ReceiptDriver = { keys: () => Promise<string[]>; get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>; remove: (key: string) => Promise<void> };
// Separate durable receipts avoid overwriting live task edits from a headless runtime.
// Acknowledge only after the corresponding app snapshot has been saved successfully.
export function createEndReceiptStore(driver: ReceiptDriver) {
  let queue = Promise.resolve();
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const result = queue.catch(() => {}).then(run);
    queue = result.then(() => {}, () => {});
    return result;
  };
  const keyFor = (id: string) => END_RECEIPT_PREFIX + encodeURIComponent(id);
  async function records(): Promise<EndCompletion[]> {
    const result: EndCompletion[] = [];
    for (const key of (await driver.keys()).filter(key => key.startsWith(END_RECEIPT_PREFIX))) {
      const raw = await driver.get(key);
      if (!raw) continue;
      try {
        const record = JSON.parse(raw) as EndCompletion;
        const decoded = decodeEndResponse(record.id, { kind: 'task-end', taskId: record.taskId, date: record.date,
          start: String(record.start), duration: String(record.duration) }, END_COMPLETE);
        if (decoded && key === keyFor(record.id) && typeof record.completedAt === 'string' && Number.isFinite(Date.parse(record.completedAt))) result.push(record);
      } catch { /* A damaged receipt must not stop reading personal schedules. */ }
    }
    return result;
  }
  return {
    enqueue: (event: EndReminder, moment: Date) => serial(async () => {
      if (moment.getTime() < endAt(event) || moment.getTime() - endAt(event) > 7 * 86400000) return;
      const key = keyFor(event.id);
      if (await driver.get(key)) return;
      await driver.set(key, JSON.stringify({ ...event, completedAt: moment.toISOString() }));
    }),
    pending: () => serial(async () => (await records()).filter(record => !record.done)),
    acknowledge: (saved: AppData) => serial(async () => {
      for (const record of await records()) {
        if (!record.done && saved.notificationReceipts?.includes(receiptId(record))) {
          await driver.set(keyFor(record.id), JSON.stringify({ ...record, done: true }));
        } else if (record.done && Date.now() - endAt(record) > 8 * 86400000) await driver.remove(keyFor(record.id));
      }
    }),
  };
}
