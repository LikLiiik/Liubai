import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { createEmpty } from '../seed';
import type { AppData } from '../types';
import { applyCompletionReschedule } from '../completionReschedule';
import { CompletionRescheduleDialog } from './CompletionRescheduleDialog';
import { Badge, Button, Label } from './ui';
import { colors as c } from '../theme';
import { clock } from '../utils';

export function CompletionRescheduleGuideLesson() {
  const initial = useMemo<AppData>(() => ({ ...createEmpty({ dayStart: 540, dayEnd: 1080, buffer: 0 }), tasks: [
    { id: 'guide-expired', title: '整理旧资料', date: '2026-10-21', start: 540, duration: 60, completed: true, completedAt: '2026-10-21T09:30:00',
      notes: '', category: 'work', priority: 'normal', important: false, fixed: false, deadline: null, postponed: 0,
      completionAdvance: { completedAt: '2026-10-21T09:30:00', moves: [{ taskId: 'guide-follower', from: { date: '2026-10-21', start: 1020 }, to: { date: '2026-10-21', start: 960 }, duration: 30, deadline: null }] } },
    { id: 'guide-follower', title: '处理邮件', date: '2026-10-21', start: 960, duration: 30, completed: false, notes: '', category: 'work', priority: 'normal', important: false, fixed: false, deadline: null, postponed: 0 },
    { id: 'guide-meeting', title: '固定会议', date: '2026-10-21', start: 900, duration: 30, completed: false, notes: '', category: 'work', priority: 'normal', important: false, fixed: true, deadline: null, postponed: 0 },
  ] }), []);
  const [example, setExample] = useState(initial);
  const [open, setOpen] = useState(false);
  const source = example.tasks[0];
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13, gap: 12 }}>
    <Badge title="过时段撤销演示 · 不改变日程" tone="neutral" /><Label style={{ fontSize: 13 }}>示例现在是 15:00，原安排为 09:00–10:00。</Label>
    <Label style={{ fontSize: 12 }}>整理旧资料 · {source.completed ? '已完成' : `${source.date} ${clock(source.start!)} · 待完成`}</Label>
    <Button title={source.completed ? '演示：撤销已过时段的完成' : '重试过时段撤销演示'} small variant="secondary" onPress={() => source.completed ? setOpen(true) : setExample(initial)} />
    {open && <CompletionRescheduleDialog data={example} taskId={source.id} initialChoice="keep" moment={new Date('2026-10-21T15:00:00')} onClose={() => setOpen(false)} onConfirm={(request, key, consent) => {
      const result = applyCompletionReschedule(example, request, key, new Date('2026-10-21T15:00:00'), 'guide-reschedule', consent);
      if (result.error) return false;
      setExample(result.data); setOpen(false); return true;
    }} />}
  </View>;
}
