import React, { useEffect, useState } from 'react';
import { subscribeReminderResponses } from '../notifications';
import { InboxSuggestionDialog } from './InboxSuggestionDialog';
import { OnboardingGuide } from './OnboardingGuide';

export function ReminderObserver() {
  const [taskId, setTaskId] = useState<string | null>(null);
  useEffect(() => subscribeReminderResponses(response => setTaskId(response.taskId)), []);
  return <><OnboardingGuide blocked={!!taskId} /><InboxSuggestionDialog taskId={taskId} onClose={() => setTaskId(null)} /></>;
}
