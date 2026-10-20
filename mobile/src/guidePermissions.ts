import type { NotificationAccess } from './types.ts';

export type ReminderChoice = { tasks: boolean; inbox: boolean };
export type GuidePermissionDriver = {
  inspect: () => Promise<NotificationAccess>; request: () => Promise<boolean>; settings: () => Promise<void>;
};
export async function setupGuideReminders(choice: ReminderChoice, driver: GuidePermissionDriver): Promise<{
  action: 'enabled' | 'disabled' | 'denied' | 'settings' | 'unsupported'; access?: NotificationAccess;
}> {
  if (!choice.tasks && !choice.inbox) return { action: 'disabled' };
  const access = await driver.inspect();
  if (access.status === 'unsupported') return { action: 'unsupported', access };
  if (access.status === 'granted') return { action: 'enabled', access };
  if (!access.canAskAgain) { await driver.settings(); return { action: 'settings', access }; }
  await driver.request();
  const current = await driver.inspect();
  return { action: current.status === 'granted' ? 'enabled' : 'denied', access: current };
}
