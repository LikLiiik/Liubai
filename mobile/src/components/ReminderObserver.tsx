import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { subscribeReminderResponses, subscribeEndResponses } from '../notifications';
import { usePlanning } from '../store';
import { InboxSuggestionDialog } from './InboxSuggestionDialog';
import { OnboardingGuide } from './OnboardingGuide';

export function ReminderObserver() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const { refreshEndCompletions, isCurrentEndReminder, notify } = usePlanning();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => subscribeReminderResponses(response => setTaskId(response.taskId)), []);
  useEffect(() => {
    const refresh = () => { void refreshEndCompletions().catch(() => notify('完成记录同步失败，请重新打开应用重试。')); };
    refresh();
    const state = AppState.addEventListener('change', value => { if (value === 'active') refresh(); });
    const stop = subscribeEndResponses(response => {
      if (response.action === 'complete') refresh();
      else if (isCurrentEndReminder(response)) router.push({ pathname: '/rescue', params: { taskId: response.taskId,
        eventId: response.id, date: response.date, start: String(response.start), duration: String(response.duration) } });
      else notify('此事件已完成、改期或移除，旧提醒已失效。');
    }, () => notify('通知操作未保存，请在应用中重试。'));
    return () => { stop(); state.remove(); };
  }, [refreshEndCompletions, isCurrentEndReminder, notify, router]);
  return <><OnboardingGuide blocked={!!taskId || pathname === '/rescue'} /><InboxSuggestionDialog taskId={taskId} onClose={() => setTaskId(null)} /></>;
}
