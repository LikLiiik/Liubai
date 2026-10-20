import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { createPlan } from '../scheduler';
import type { Category, Task } from '../types';
import { clock, taskPosition, uid } from '../utils';
import { colors as c } from '../theme';
import { Badge, Button, FieldTitle, Icon, Label } from './ui';
import { TimeField, TimeWheelPicker } from './TimeField';
import { durationTime } from '../timePicker';
import { addCategoryToData, categoriesFor } from '../categories';
import { createEmpty } from '../seed';
import { CategoryPicker } from './CategoryPicker';
import { parseTime } from '../time';
export { WeekGuideLesson } from './GuideWeekLesson';

export function QuickGuideLesson() {
  const [time, setTime] = useState('15:00');
  const [completed, setCompleted] = useState(false);
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13, gap: 12 }}>
    <View style={{ alignSelf: 'flex-start' }}><Badge title="教学演示 · 不发送通知" tone="neutral" /></View>
    <TimeField label="演示小事提醒时间" value={time} onChangeText={setTime} />
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.purple, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Icon name={completed ? 'check-circle' : 'bell'} color={c.purple} size={16} /><Label style={{ fontSize: 12, textDecorationLine: completed ? 'line-through' : 'none' }}>{clock(parseTime(time) ?? 900)} · 给花浇水</Label>
    </View>
    <Button title={completed ? '恢复未完成' : '试试标记完成'} variant="secondary" small onPress={() => setCompleted(value => !value)} />
  </View>;
}

export function CategoryGuideLesson() {
  const [example, setExample] = useState(createEmpty);
  const [category, setCategory] = useState<Category>('work');
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变分类" tone="neutral" /></View>
    <CategoryPicker categories={categoriesFor(example)} value={category} onChange={setCategory} onAdd={name => {
      const next = addCategoryToData(example, name, uid());
      setExample(next.data);
      return next.result;
    }} />
  </View>;
}

export function TimeGuideLesson() {
  const [time, setTime] = useState(870);
  const [duration, setDuration] = useState(durationTime(90));
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    <Label muted style={{ fontSize: 12, marginBottom: 8 }}>时间点</Label>
    <TimeWheelPicker label="演示开始时间" value={time} onChange={setTime} />
    <FieldTitle>事件时长</FieldTitle><TimeField label="演示事件时长" value={duration} onChangeText={setDuration} mode="duration" min={5} max={720} fallback={90} />
  </View>;
}

export function RescueGuideLesson() {
  const [attempts, setAttempts] = useState(0);
  const example = useMemo(() => {
    const base: Task = { id: '', title: '', notes: '', duration: 30, category: 'work', priority: 'normal', important: false, fixed: false, completed: false, date: '2026-10-20', start: 840, deadline: null, postponed: 0 };
    const tasks: Task[] = [{ ...base, id: 'guide-focus', title: '整理方案', duration: 60 },
      { ...base, id: 'guide-mail', title: '处理邮件', start: 910 }, { ...base, id: 'guide-meeting', title: '固定会议', fixed: true, start: 960 }];
    let adjusted = tasks;
    let warning = '';
    for (let attempt = 0; attempt < attempts; attempt++) {
      const plan = createPlan(adjusted, { dayStart: 540, dayEnd: 1080, buffer: 10 }, { date: '2026-10-20', now: 840,
        minutes: attempt === 0 ? 30 : 15, reason: 'interruption', mode: 'boundary' });
      if (!plan.valid) { warning = plan.warnings[0]; break; }
      adjusted = plan.tasks;
    }
    return { tasks: adjusted, warning };
  }, [attempts]);
  const rows = example.tasks.slice().sort((a, b) => (a.start ?? Infinity) - (b.start ?? Infinity));
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    {rows.map(task => <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}><Label muted style={{ width: 88, fontSize: 11 }}>{task.start === null ? taskPosition(task, '2026-10-20') : clock(task.start)}</Label><Icon name={task.fixed ? 'lock' : 'circle'} size={12} color={task.fixed ? c.orange : c.purple} /><Label style={{ fontSize: 12 }}>{task.title}</Label></View>)}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
      <Button title={attempts ? '再加 15 分钟' : '试一试：临时有事 30 分钟'} variant="secondary" small onPress={() => setAttempts(value => value + 1)} />
      {attempts > 0 && <Button title="还原演示" variant="ghost" small onPress={() => setAttempts(0)} />}
    </View>
    {attempts > 0 && <Label accessibilityLiveRegion="polite" muted style={{ fontSize: 11, marginTop: 8 }}>临时事项累计 {example.tasks.find(task => task.rescueInterruption)?.duration ?? 0} 分钟，16:00 的固定会议保持不变。</Label>}
    {!!example.warning && <Label accessibilityRole="alert" style={{ fontSize: 11, color: c.orange, marginTop: 8 }}>{example.warning}</Label>}
  </View>;
}
