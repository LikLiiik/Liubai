import React from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { dateKey, durationText } from '../utils';
import { Badge, Button, Card, EmptyState, Icon, Label } from '../components/ui';
import { isQuick } from '../quick';

export default function Review() {
  const { data, today, undoPlan, notify } = usePlanning();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const completed = data.tasks.filter(task => task.completed && task.completedAt && dateKey(new Date(task.completedAt)) === today);
  const doneMinutes = completed.reduce((sum, task) => sum + task.duration, 0);
  const todayPlans = data.history.filter(plan => plan.date === today);
  const latest = data.history[0];
  const canUndo = latest && JSON.stringify(data.tasks) === JSON.stringify(latest.appliedTasks);
  const allCompleted = data.tasks.filter(task => task.completed).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));

  return <ScrollView contentContainerStyle={{ padding: compact ? 20 : 38, paddingBottom: 45 }}><View style={{ maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
    <Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '700' }}>回顾</Label><Label muted style={{ fontSize: 11, marginTop: 6, marginBottom: 27 }}>看见做过的事，也看见为自己做的调整。</Label>
    <Card style={{ backgroundColor: '#EDF3EF', borderColor: '#E2EBE5', marginBottom: 25 }}><View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}><Icon name="feather" size={25} color={c.green} /><View style={{ flex: 1 }}><Label style={{ fontSize: 17, color: '#4F6D59', fontWeight: '500' }}>进展，不只有一种模样。</Label><Label style={{ fontSize: 11, color: '#8B9E90', marginTop: 7 }}>完成一件事、重新做一次取舍，都是在向前。</Label></View></View></Card>
    <View style={{ flexDirection: compact ? 'column' : 'row', gap: 15, marginBottom: 28 }}>{[
      { label: '今天完成', value: String(completed.length), unit: '件事', icon: 'check-circle' as const },
      { label: '完成任务的计划时长', value: durationText(doneMinutes), unit: '', icon: 'clock' as const },
      { label: '今天重新找回节奏', value: String(todayPlans.length), unit: '次调整', icon: 'shuffle' as const },
    ].map(item => <Card key={item.label} style={{ flex: compact ? undefined : 1, padding: 21 }}><View style={{ flexDirection: 'row', gap: 7, alignItems: 'center' }}><Icon name={item.icon} size={15} color={c.purple} /><Label muted style={{ fontSize: 11 }}>{item.label}</Label></View><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 15 }}><Label style={{ fontSize: 24, lineHeight: 34, fontWeight: '600' }}>{item.value}</Label><Label muted style={{ fontSize: 10 }}>{item.unit}</Label></View></Card>)}</View>
    <Label muted style={{ fontSize: 10, marginTop: -12, marginBottom: 28 }}>计划时长来自你填写的预计时长，不代表实际专注时长。</Label>

    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}><Label style={{ fontSize: 16, fontWeight: '600' }}>调整足迹</Label><Badge title={`保留最近 ${data.history.length} 次`} tone="neutral" /></View>
    {!data.history.length ? <Card style={{ marginBottom: 27 }}><EmptyState title="变化来了，也没关系" description="使用一次「一键救场」，这里就会留下调整原因和取舍记录。" /></Card>
      : data.history.map((plan, index) => <Card key={plan.id} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><View style={{ flex: 1 }}><Label style={{ fontSize: 14, fontWeight: '600' }}>{plan.title}</Label><Label muted style={{ fontSize: 10, marginTop: 5 }}>{plan.date} · {new Date(plan.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}{data.demo ? ' · 示例调整' : ''}</Label></View>
          {index === 0 && <Button title="撤销本次调整" icon="rotate-ccw" small variant="secondary" disabled={!canUndo} onPress={() => { undoPlan(); notify('已恢复到这次调整之前的日程。'); }} />}</View>
        {index === 0 && !canUndo && <Label style={{ fontSize: 10, color: c.orange, marginTop: 12 }}>调整后又修改了任务，为保护这些修改，当前无法整批撤销。</Label>}
        <View style={{ marginTop: 15 }}>{plan.changes.map((change, changeIndex) => <View key={`${change.taskId}-${changeIndex}`} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}><Icon name="arrow-right" size={13} color={c.purple} /><View style={{ flex: 1 }}><Label style={{ fontSize: 12 }}>{change.title}</Label><Label muted style={{ fontSize: 10, marginTop: 3 }}>{change.from} → {change.to}</Label><Label muted style={{ fontSize: 10 }}>{change.reason}</Label></View></View>)}</View>
      </Card>)}

    <Label style={{ fontSize: 16, fontWeight: '600', marginTop: 17, marginBottom: 15 }}>完成的事，都算数</Label>
    <Card style={{ padding: allCompleted.length ? 22 : 10 }}>{allCompleted.length ? allCompleted.map((task, index) => <View key={task.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: index < allCompleted.length - 1 ? 1 : 0, borderBottomColor: c.border }}><Icon name="check-circle" color={c.green} size={17} /><View style={{ flex: 1 }}><Label style={{ fontSize: 12 }}>{task.title}</Label><Label muted style={{ fontSize: 10, marginTop: 3 }}>{task.completedAt ? new Date(task.completedAt).toLocaleDateString('zh-CN') : '已完成'} · {isQuick(task) ? '顺手小事' : `计划 ${durationText(task.duration)}`}</Label></View></View>) : <EmptyState title="第一件小事，也值得记录" description="在任务旁打一个勾，让进展在这里慢慢积累。" />}</Card>
  </View></ScrollView>;
}
