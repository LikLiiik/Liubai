import React, { useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { clock, durationText, nextDay } from '../utils';
import { scheduleTask } from '../scheduler';
import { inPlanningDay } from '../time';
import type { Category, Task } from '../types';
import { Badge, Button, Card, Chip, EmptyState, Icon, Label } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';
import { categoriesFor } from '../categories';
import { CategoryPicker } from '../components/CategoryPicker';
import { KeyboardFormScrollView } from '../components/KeyboardForm';

export default function Inbox() {
  const { data, planningDate: today, planningNow: now, mutateTasks, notify, addCategory } = usePlanning();
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [editor, setEditor] = useState<{ task?: Task } | null>(null);
  const [filter, setFilter] = useState<Category | null>(null);
  const categories = categoriesFor(data);
  const pending = data.tasks.filter(task => !task.completed && !inPlanningDay(task, today, data.settings) && (filter === null || task.category === filter));
  const groups = [
    { title: '先记着，还没决定什么时候做', hint: '收集箱', tasks: pending.filter(task => !task.date), icon: 'inbox' as const },
    { title: '从之前带来的事', hint: '需要重新安排', tasks: pending.filter(task => task.date && task.date < today), icon: 'rotate-ccw' as const },
    { title: '留给明天', hint: '明天', tasks: pending.filter(task => task.date === nextDay(today)), icon: 'sunrise' as const },
    { title: '以后慢慢做', hint: '未来日程', tasks: pending.filter(task => task.date && task.date > nextDay(today)), icon: 'calendar' as const },
  ];

  function addToToday(task: Task) {
    if (task.fixed) { setEditor({ task }); return; }
    const next = scheduleTask(data.tasks, task.id, data.settings, today, now);
    if (next) { mutateTasks(() => next); const scheduled = next.find(item => item.id === task.id)!; notify(`已安排到今天 ${clock(scheduled.start!)}。`); }
    else notify('今天的剩余时间放不下这件事。可以先编辑为较小的任务，或留给明天。');
  }

  return <><KeyboardFormScrollView contentContainerStyle={{ padding: compact ? 20 : 38, paddingBottom: 45 }}>
    <View style={{ maxWidth: 1100, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, gap: 12 }}><View><Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '700' }}>收集箱</Label><Label muted style={{ fontSize: 11, marginTop: 6 }}>脑海里的事，先放在这里。</Label></View><Button title="记一件事" icon="plus" small={compact} onPress={() => setEditor({})} /></View>
      <Card style={{ backgroundColor: '#F0ECF7', borderColor: '#E8E1F1', marginBottom: 27, padding: 23 }}><View style={{ flexDirection: 'row', gap: 12 }}><Icon name="inbox" color={c.purple} size={22} /><View style={{ flex: 1 }}><Label style={{ color: '#615473', fontSize: 14, fontWeight: '500' }}>记下来，就不用一直放在心里。</Label><Label style={{ color: '#9586A5', fontSize: 11, marginTop: 5 }}>收集箱里的任务不会占用今天的时间，等你准备好再安排。</Label></View></View></Card>
      <View style={{ marginBottom: 26 }}><CategoryPicker categories={categories} value={filter} onChange={setFilter} onAdd={addCategory}
        prefix={<Chip title="全部" selected={filter === null} onPress={() => setFilter(null)} />} /></View>
      {!pending.length && <Card><EmptyState title="心里轻一点了" description={filter === null ? '这里还没有待安排的事。有想法时，随手记下来。' : '这个分类暂时没有待安排的任务。'} action="记一件事" onPress={() => setEditor({})} /></Card>}
      {groups.filter(group => group.tasks.length).map(group => <View key={group.hint} style={{ marginBottom: 29 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}><Icon name={group.icon} size={16} color={c.purple} /><Label style={{ fontSize: 13, fontWeight: '600' }}>{group.title}</Label><Badge title={String(group.tasks.length)} tone="neutral" /></View>
        <Card style={{ padding: 0, overflow: 'hidden' }}>{group.tasks.map((task, index) => <View key={task.id} style={{ padding: compact ? 17 : 23, borderBottomWidth: index < group.tasks.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
          <View style={{ flexDirection: 'row', gap: 13, alignItems: 'center' }}>
            <Pressable accessibilityRole="checkbox" accessibilityLabel={`完成任务：${task.title}`} accessibilityState={{ checked: false }} onPress={() => { mutateTasks(tasks => tasks.map(item => item.id === task.id ? { ...item, completed: true, completedAt: new Date().toISOString() } : item)); notify('完成了，进展已记录在回顾中。'); }} style={{ width: 20, height: 20, borderWidth: 1.5, borderColor: '#D8D4E2', borderRadius: 7 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`编辑任务：${task.title}`} onPress={() => setEditor({ task })} style={{ flex: 1 }}><Label style={{ fontSize: 13, fontWeight: '500' }}>{task.title}</Label><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 7 }}><Label muted style={{ fontSize: 10 }}>{durationText(task.duration)}</Label><Badge title={categories.find(category => category.id === task.category)?.name ?? '未分类'} tone={task.category === 'health' ? 'green' : 'neutral'} />{task.important && <Badge title="重点" />}{task.date && <Label muted style={{ fontSize: 10 }}>{task.date}{task.start !== null ? ` ${clock(task.start)}` : ' · 待安排'}</Label>}</View></Pressable>
            {!compact && <Button title="安排到今天" icon="arrow-up-right" variant="secondary" small onPress={() => addToToday(task)} />}
          </View>
          {task.postponed >= 3 && <View style={{ backgroundColor: c.orangeBg, padding: 11, borderRadius: 8, marginTop: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="help-circle" size={14} color={c.orange} /><Label style={{ fontSize: 10, color: c.orange, flex: 1 }}>已延期 {task.postponed} 次。也许可以把第一步写得更小一点。</Label><Button title="改一改" variant="ghost" small onPress={() => setEditor({ task })} /></View>}
          {compact && <Button title="安排到今天" variant="secondary" small icon="arrow-up-right" onPress={() => addToToday(task)} style={{ alignSelf: 'flex-end', marginTop: 12 }} />}
        </View>)}</Card>
      </View>)}
    </View>
  </KeyboardFormScrollView><TaskEditor visible={!!editor} task={editor?.task} target="inbox" initialCategory={filter ?? undefined} onClose={() => setEditor(null)} /></>;
}
