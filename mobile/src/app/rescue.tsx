import React from 'react';
import { ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePlanning } from '../store';
import { decodeEndResponse, END_RESCUE, endResponseTarget } from '../taskEndReminders';
import { RescueDialog } from '../components/RescueDialog';
import { Button, Card, Label } from '../components/ui';

export default function EventRescue() {
  const params = useLocalSearchParams<{ taskId?: string; eventId?: string; date?: string; start?: string; duration?: string }>();
  const { data } = usePlanning();
  const router = useRouter();
  const event = decodeEndResponse(params.eventId ?? '', { kind: 'task-end', taskId: params.taskId,
    date: params.date, start: params.start, duration: params.duration }, END_RESCUE);
  const target = event && endResponseTarget(data, event, new Date());
  const close = () => router.replace('/');
  return <ScrollView contentContainerStyle={{ padding: 24 }}><Card><Label style={{ fontSize: 20, fontWeight: '600' }}>事件救场</Label>
    <Label muted style={{ marginTop: 12 }}>{target ? target.title : '此事件已完成、改期或移除，旧提醒已失效。'}</Label>
    <Button title="返回今天" variant="secondary" onPress={close} style={{ marginTop: 18 }} /></Card>
    {target && <RescueDialog key={target.id} visible initialReason="overrun" initialTaskId={target.id} onClose={close} />}
  </ScrollView>;
}
