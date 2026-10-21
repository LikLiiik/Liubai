import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
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
import { createAdvancePlan, setTaskCompletion } from '../completion';
import { previewCompletionUndo } from '../completionUndo';
import { NicknameCard } from './NicknameCard';
import { homeGreeting } from '../profile';
export { WeekGuideLesson } from './GuideWeekLesson';

export function NicknameGuideLesson() {
  const [nickname, setNickname] = useState('小白');
  const moment = new Date();
  return <View style={{ marginTop: 18 }}><NicknameCard key={nickname} demo nickname={nickname} onSave={setNickname} />
    <Label style={{ fontSize: 19, color: c.purple, fontWeight: '600' }}>{homeGreeting(nickname, moment.getHours() * 60 + moment.getMinutes())}</Label>
    <Label muted style={{ fontSize: 11, marginTop: 6 }}>教学示例，不会修改你的昵称。</Label>
  </View>;
}

export function CompletionGuideLesson() {
  const initial = useMemo<Task[]>(() => {
    const base: Task = { id: '', title: '', notes: '', duration: 30, category: 'work', priority: 'normal', important: false,
      fixed: false, completed: false, date: '2026-10-21', start: 840, deadline: null, postponed: 0 };
    return [{ ...base, id: 'guide-current', title: '整理资料', duration: 60 }, { ...base, id: 'guide-next', title: '处理邮件', start: 910 },
      { ...base, id: 'guide-fixed', title: '固定会议', start: 960, fixed: true }];
  }, []);
  const [tasks, setTasks] = useState(initial);
  const [stage, setStage] = useState<'pending' | 'offer' | 'kept' | 'advanced' | 'undo' | 'undo-confirm' | 'restored'>('pending');
  const plan = useMemo(() => createAdvancePlan(tasks, { dayStart: 540, dayEnd: 1080, buffer: 10 }, 'guide-current', '2026-10-21', 860), [tasks]);
  const undoKeep = previewCompletionUndo({ tasks, history: [] }, 'guide-current', 'keep');
  const undoCancel = previewCompletionUndo({ tasks, history: [] }, 'guide-current', 'cancel-advance');
  function undo() {
    if (stage === 'advanced') setStage('undo');
    else if (stage === 'kept') { setTasks(undoKeep.tasks); setStage('restored'); }
  }
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13, gap: 12 }}>
    <View style={{ alignSelf: 'flex-start' }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    <Label muted style={{ fontSize: 12 }}>现在是 14:20，试着勾选当前事项。</Label>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="演示：当前事件已完成" accessibilityState={{ checked: tasks[0].completed }}
      onPress={() => { if (stage === 'pending') { setTasks(setTaskCompletion(tasks, 'guide-current', true, new Date('2026-10-21T14:20:00').toISOString()).tasks); setStage('offer'); } else undo(); }}
      style={{ minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Icon name={tasks[0].completed ? 'check-square' : 'square'} color={c.purple} /><Label style={{ fontSize: 13 }}>整理资料 · {tasks[0].completed ? '已完成' : '进行中'}</Label>
    </Pressable>
    {tasks.slice(1).map(task => <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name={task.fixed ? 'lock' : 'circle'} size={13} /><Label style={{ fontSize: 12 }}>{clock(task.start!)} · {task.title}</Label></View>)}
    {stage === 'offer' && <View style={{ padding: 12, borderRadius: 10, backgroundColor: c.lavender, gap: 10 }}>
      <Label style={{ fontSize: 12 }}>后续可提前：处理邮件 15:10 → 14:30</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title="演示：保持原安排" small variant="ghost" onPress={() => setStage('kept')} />
        <Button title="演示：确认提前" small onPress={() => { setTasks(plan.tasks); setStage('advanced'); }} /></View>
    </View>}
    {(stage === 'kept' || stage === 'advanced') && <><Label accessibilityLiveRegion="polite" muted style={{ fontSize: 12 }}>{stage === 'kept' ? '已记录完成，后续时间保持原样。' : '后续任务已提前，16:00 的固定会议保持不变。'}</Label><Button title="演示：撤销完成" variant="secondary" small onPress={undo} /></>}
    {stage === 'undo' && <View style={{ gap: 8 }}><Label style={{ fontSize: 12 }}>撤销完成，要一并取消后续提前吗？</Label>
      <Button title="演示：一并取消提前" small onPress={() => { setTasks(undoCancel.tasks); setStage('restored'); }} />
      <Button title="演示：只撤销完成，保留提前" variant="secondary" small onPress={() => setStage('undo-confirm')} />
      <Button title="演示：返回" variant="ghost" small onPress={() => setStage('advanced')} />
    </View>}
    {stage === 'undo-confirm' && <View style={{ gap: 8 }}><Label style={{ fontSize: 12 }}>保留 14:30 的邮件任务，会与恢复后的资料整理重叠，需要再次确认。</Label>
      <Button title="演示：确认恢复并保留重叠" small onPress={() => { setTasks(undoKeep.tasks); setStage('restored'); }} />
      <Button title="演示：返回选择" variant="ghost" small onPress={() => setStage('undo')} />
    </View>}
    {stage === 'restored' && <Label accessibilityLiveRegion="polite" muted style={{ fontSize: 12 }}>已撤销完成，后续时刻按刚才的选择保留。</Label>}
    {(stage === 'kept' || stage === 'advanced' || stage === 'restored') && <Button title="重新体验完成选择" small variant="ghost" onPress={() => { setTasks(initial); setStage('pending'); }} />}
  </View>;
}

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
  const [manual, setManual] = useState(true);
  const [duration, setDuration] = useState(durationTime(90));
  return <View style={{ marginTop: 20, padding: 16, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}><Button title="演示：自动安排" small variant={manual ? 'ghost' : 'secondary'} onPress={() => setManual(false)} /><Button title="演示：指定时间" small variant={manual ? 'secondary' : 'ghost'} onPress={() => setManual(true)} /></View>
    {manual ? <><Label muted style={{ fontSize: 12, marginBottom: 8 }}>开始时间</Label><TimeWheelPicker label="演示开始时间" value={time} onChange={setTime} /></>
      : <Label muted style={{ fontSize: 12 }}>按偏好自动寻找空位，避开已有事件。</Label>}
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
