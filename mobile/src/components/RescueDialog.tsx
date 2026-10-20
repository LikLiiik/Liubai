import React, { useMemo, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { colors as c } from '../theme';
import { usePlanning } from '../store';
import { createPlan } from '../scheduler';
import { clock } from '../utils';
import { inPlanningDay } from '../time';
import { TimeField } from './TimeField';
import { durationTime, parseDuration } from '../timePicker';
import type { PlanMode, RescueReason } from '../types';
import { Badge, Button, Chip, Dialog, FieldTitle, Icon, Label, type IconName } from './ui';

const modes: { key: PlanMode; title: string; desc: string; icon: IconName }[] = [
  { key: 'balanced', title: '保截止时间', desc: '可延后结束，最多 60 分钟', icon: 'flag' },
  { key: 'boundary', title: '保结束时间', desc: '不加时，放不下的移到明天', icon: 'coffee' },
  { key: 'focus', title: '保今日重点', desc: '不加时，优先重点与硬截止', icon: 'star' },
];
export function RescueDialog({ visible, initialReason = 'interruption', onClose }: { visible: boolean; initialReason?: RescueReason; onClose: () => void }) {
  // Remount this dialog when opening so each preview starts from current data.
  const { data, planningDate: today, planningNow: now, applyPlan } = usePlanning();
  const { width } = useWindowDimensions();
  const [reason, setReason] = useState<RescueReason>(initialReason);
  const [duration, setDuration] = useState(durationTime(30));
  const minutes = reason === 'interruption' || reason === 'overrun' ? parseDuration(duration) ?? 0 : 30;
  const [mode, setMode] = useState<PlanMode>('boundary');
  const candidates = data.tasks.filter(task => inPlanningDay(task, today, data.settings) && !task.completed && !task.fixed);
  const [taskId, setTaskId] = useState(candidates[0]?.id);
  const plan = useMemo(() => createPlan(data.tasks, data.settings, { reason, minutes, mode, taskId, now, date: today }), [data, reason, minutes, mode, taskId, now, today]);
  return <Dialog visible={visible} wide title="计划变了，我们重新安排" subtitle="固定事项保持原时间。每一项取舍，都先让你看见。" onClose={onClose}
    footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <View style={{ flex: 1, minWidth: 150 }}><Label style={{ fontSize: 12 }}>{plan.valid ? `${plan.deferred} 项移到明天 · ${clock(plan.finish)} 结束` : '存在需要处理的冲突'}</Label><Label muted style={{ fontSize: 10 }}>套用后可在「回顾」撤销</Label></View>
      <Button title="先不调整" variant="ghost" small onPress={onClose} /><Button title="就按这个安排" icon="check" disabled={!plan.valid || !plan.changes.length} onPress={() => { applyPlan(plan, reason === 'interruption' ? `临时有事 ${minutes} 分钟` : reason === 'overrun' ? `任务还需 ${minutes} 分钟` : reason === 'rebalance' ? '重新安排今天' : '今天放慢一点'); onClose(); }} />
    </View>}>
    <FieldTitle>发生了什么</FieldTitle><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip title="临时有事" icon="zap" selected={reason === 'interruption'} onPress={() => setReason('interruption')} />
      <Chip title="任务还没做完" icon="clock" selected={reason === 'overrun'} onPress={() => setReason('overrun')} />
      <Chip title="今天有点累" icon="battery" selected={reason === 'lowEnergy'} onPress={() => setReason('lowEnergy')} />
      <Chip title="只重新安排" icon="shuffle" selected={reason === 'rebalance'} onPress={() => setReason('rebalance')} />
    </View>
    {reason === 'overrun' && <><FieldTitle>哪件事还需要时间</FieldTitle><View style={{ gap: 7 }}>{candidates.length ? candidates.map(task => <Chip key={task.id} title={task.title} selected={taskId === task.id} onPress={() => setTaskId(task.id)} />) : <Label muted>今天没有尚未完成的灵活任务。</Label>}</View></>}
    {reason === 'interruption' || reason === 'overrun' ? <><FieldTitle>{reason === 'overrun' ? '从现在起，还需要多久？' : `从 ${clock(now)} 开始，占用多久？`}</FieldTitle><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{[15, 30, 60, 90].map(value => <Chip key={value} title={`${value} 分钟`} selected={minutes === value} onPress={() => setDuration(durationTime(value))} />)}</View>
      <View style={{ marginTop: 10 }}><TimeField label="救场时长" value={duration} onChangeText={setDuration} mode="duration" min={5} max={720} fallback={30} /></View>
      {reason === 'overrun' && <Label muted style={{ fontSize: 11, marginTop: 8 }}>按你确认的剩余时长重新安排，不把经过的时间自动视为已完成。</Label>}</>
      : <View style={{ backgroundColor: c.greenBg, borderRadius: 10, padding: 13, marginTop: 15 }}><Label style={{ color: c.green, fontSize: 12 }}>{reason === 'lowEnergy' ? '把剩余空闲时间的一半留给休息。任务不会被擅自缩短。' : '从现在开始重新安排未完成任务，不新增临时事项。'}</Label></View>}
    <FieldTitle>这一次，你更想保住什么</FieldTitle><View style={{ flexDirection: width >= 650 ? 'row' : 'column', gap: 9 }}>
      {modes.map(item => <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected: item.key === mode }} key={item.key} onPress={() => setMode(item.key)} style={{ flex: width >= 650 ? 1 : undefined, borderWidth: 1, borderColor: item.key === mode ? '#BCA9E9' : c.border, backgroundColor: item.key === mode ? '#F6F2FE' : '#fff', padding: 14, borderRadius: 12, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name={item.icon} size={15} color={item.key === mode ? c.purple : c.muted} /><Label style={{ fontWeight: '600', fontSize: 12 }}>{item.title}</Label></View>
        <Label muted style={{ fontSize: 10, lineHeight: 18 }}>{item.desc}</Label>
      </Pressable>)}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 27, marginBottom: 13 }}><Label style={{ fontWeight: '600' }}>调整预览</Label><Badge title={`${plan.changes.length} 项变化`} tone="neutral" /></View>
    {plan.changes.length === 0 && <Label muted style={{ fontSize: 12 }}>当前日程已经符合这个方案，无需调整。</Label>}
    {plan.changes.map((change, index) => <View key={`${change.taskId}-${index}`} style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: c.border, gap: 5 }}>
      <Label style={{ fontSize: 13, fontWeight: '500' }}>{change.title}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}><Label muted style={{ fontSize: 11 }}>{change.from}</Label><Icon name="arrow-right" size={12} color={c.purple} /><Label style={{ fontSize: 11, color: c.purpleDark }}>{change.to}</Label></View>
      <Label muted style={{ fontSize: 10 }}>{change.reason}</Label>
    </View>)}
    {plan.warnings.map((warning, index) => <View key={index} style={{ backgroundColor: plan.valid ? c.orangeBg : c.redBg, borderRadius: 9, padding: 12, marginTop: 9, flexDirection: 'row', gap: 8 }}><Icon name="alert-circle" size={15} color={plan.valid ? c.orange : c.red} /><Label style={{ flex: 1, color: plan.valid ? c.orange : c.red, fontSize: 11 }}>{warning}</Label></View>)}
  </Dialog>;
}
