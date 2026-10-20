import React from 'react';
import { View } from 'react-native';
import { usePlanning } from '../store';
import { acceptInboxSuggestion, findInboxSuggestion, localMoment } from '../inboxReminders';
import { clock, durationText } from '../utils';
import { shiftDate } from '../time';
import { Badge, Button, Dialog, Label } from './ui';

export function InboxSuggestionDialog({ taskId, onClose, preview = false }: { taskId: string | null; onClose: () => void; preview?: boolean }) {
  const { data, today, now, mutateTasks, applyPlan, notify } = usePlanning();
  const moment = localMoment(today, now);
  const task = data.tasks.find(item => item.id === taskId);
  const enabled = preview || !data.demo && data.settings.inboxRemindersEnabled;
  const suggestion = enabled && taskId ? findInboxSuggestion(data, moment, taskId) : null;
  const valid = !!suggestion;
  function accept() {
    const plan = taskId && acceptInboxSuggestion(data, taskId, localMoment(today, now));
    if (!plan || !enabled) { notify('当前没有合适的空闲时段，任务仍保留在收集箱。'); return; }
    applyPlan(plan, '空闲提醒：安排收集箱待办'); onClose();
  }
  function later() {
    if (taskId && task && task.date === null && !task.completed) mutateTasks(tasks => tasks.map(item => item.id === taskId ? { ...item, inboxReminderAfter: shiftDate(today, 3) } : item));
    notify('这件事将在 3 天后恢复提醒。'); onClose();
  }
  return <Dialog visible={!!taskId} title="这段空闲，要做这件事吗？" onClose={onClose}
    footer={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
      {valid ? <><Button title="暂不安排" variant="ghost" onPress={later} /><Button title="安排这件事" icon="check" onPress={accept} /></>
        : <Button title="关闭" onPress={onClose} />}
    </View>}>
    {preview && <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="通知内容预览 · 不发送系统通知" tone="neutral" /></View>}
    {task && <><Label style={{ fontWeight: '600', fontSize: 17 }}>{task.title}</Label><Label muted style={{ fontSize: 12, marginTop: 6 }}>预计 {durationText(task.duration)}</Label></>}
    {suggestion ? <><Label style={{ marginTop: 18, fontSize: 13 }}>{durationText(suggestion.freeMinutes)}连续空闲</Label>
      <Label muted style={{ marginTop: 7, fontSize: 12 }}>可安排：{new Date(suggestion.at).getMonth() + 1}/{new Date(suggestion.at).getDate()} {clock(new Date(suggestion.at).getHours() * 60 + new Date(suggestion.at).getMinutes())}–{clock(new Date(suggestion.at).getHours() * 60 + new Date(suggestion.at).getMinutes() + suggestion.task.duration)}</Label></>
      : <Label muted style={{ marginTop: 16 }}>{!enabled ? '空闲时段提醒已关闭。' : !task || task.completed || task.date !== null ? '这件事已完成、安排或移除。' : '当前已没有足够的连续空闲时间，任务仍保留在收集箱。'}</Label>}
  </Dialog>;
}
