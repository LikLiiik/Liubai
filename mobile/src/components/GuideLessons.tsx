import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { createPlan } from '../scheduler';
import type { Task } from '../types';
import { clock } from '../utils';
import { colors as c } from '../theme';
import { Badge, Button, Icon, Label } from './ui';

export function WeekGuideLesson() {
  const [moved, setMoved] = useState(false);
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    <View style={{ flexDirection: 'row', gap: 10 }}>{['今天', '明天'].map((day, index) => <View key={day} style={{ flex: 1 }}>
      <Label muted style={{ textAlign: 'center', fontSize: 11, marginBottom: 7 }}>{day}</Label>
      <View style={{ minHeight: 87, borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 8, backgroundColor: '#fff' }}>
        {index === Number(moved) && <View style={{ borderRadius: 7, padding: 9, backgroundColor: c.lavender }}><Label style={{ fontSize: 10, color: c.purple }}>15:00–15:30</Label><Label style={{ fontSize: 12 }}>整理阅读笔记</Label></View>}
      </View>
    </View>)}</View>
    <Button title={moved ? '再试一次：移回今天' : '试一试：移到明天'} icon="move" variant="secondary" small onPress={() => setMoved(value => !value)} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
    {moved && <Label accessibilityLiveRegion="polite" muted style={{ fontSize: 11, marginTop: 8 }}>已移到明天。真实周览中可长按卡片拖动。</Label>}
  </View>;
}

export function RescueGuideLesson() {
  const [changed, setChanged] = useState(false);
  const example = useMemo(() => {
    const base: Task = { id: '', title: '', notes: '', duration: 30, category: 'work', priority: 'normal', important: false, fixed: false, completed: false, date: '2026-10-20', start: 840, deadline: null, postponed: 0 };
    const tasks: Task[] = [{ ...base, id: 'guide-focus', title: '整理方案', duration: 60 },
      { ...base, id: 'guide-mail', title: '处理邮件', start: 910 }, { ...base, id: 'guide-meeting', title: '固定会议', fixed: true, start: 960 }];
    const plan = createPlan(tasks, { dayStart: 540, dayEnd: 1080, buffer: 10 }, { date: '2026-10-20', now: 840, minutes: 30, reason: 'interruption', mode: 'boundary' });
    return { original: tasks, adjusted: plan.tasks };
  }, []);
  const rows = (changed ? example.adjusted : example.original).slice().sort((a, b) => a.start! - b.start!);
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    {rows.map(task => <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}><Label muted style={{ width: 48, fontSize: 11 }}>{clock(task.start!)}</Label><Icon name={task.fixed ? 'lock' : 'circle'} size={12} color={task.fixed ? c.orange : c.purple} /><Label style={{ fontSize: 12 }}>{task.title}</Label></View>)}
    <Button title={changed ? '还原演示' : '试一试：临时有事 30 分钟'} variant="secondary" small onPress={() => setChanged(value => !value)} style={{ alignSelf: 'flex-start', marginTop: 10 }} />
    {changed && <Label accessibilityLiveRegion="polite" muted style={{ fontSize: 11, marginTop: 8 }}>灵活任务重新安排，16:00 的固定会议保持不变。</Label>}
  </View>;
}
