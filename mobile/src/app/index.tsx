import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { clock, dateKey, durationText } from '../utils';
import { dayBudget, timelineGaps } from '../budget';
import { inPlanningDay, occupiedDuration, relativeStart } from '../time';
import type { RescueReason, Task } from '../types';
import { Badge, Button, Card, EmptyState, Icon, Label } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';
import { RescueDialog } from '../components/RescueDialog';
import { isQuick } from '../quick';
import { homeGreeting } from '../profile';
import { ImportantButton } from '../components/ImportantButton';

export default function Today() {
  const { data, planningDate: today, planningNow: now, today: calendarToday, now: realNow, setCompleted, toggleImportant } = usePlanning();
  const { width } = useWindowDimensions();
  const desktop = width >= 1200;
  const compact = width < 600;
  const router = useRouter();
  const [editor, setEditor] = useState<{ task?: Task; kind?: Task['kind'] } | null>(null);
  const [rescue, setRescue] = useState<RescueReason | null>(null);
  const [showDone, setShowDone] = useState(false);
  const tasks = data.tasks.filter(task => isQuick(task) ? task.date === calendarToday : inPlanningDay(task, today, data.settings));
  const timelineTask = (task: Task): Task => ({ ...task, date: today, start: relativeStart(task, today) });
  const done = tasks.filter(task => task.completed);
  const pending = tasks.filter(task => !task.completed);
  const planned = pending.filter(task => task.start !== null).sort((a, b) => timelineTask(a).start! - timelineTask(b).start!);
  const unscheduled = pending.filter(task => task.start === null);
  const { capacity, occupied, pendingMinutes, switching, space } = dayBudget(data.tasks, data.settings, today, now);
  const demand = occupied + pendingMinutes;
  const gaps = timelineGaps(planned, today);
  const focus = pending.filter(task => task.important);
  const progress = tasks.length ? Math.round(done.length / tasks.length * 100) : 0;
  const date = new Date(`${calendarToday}T12:00:00`);
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][date.getDay()];
  const dayOver = now >= data.settings.dayEnd;

  function toggleTask(task: Task) {
    setCompleted(task.id, !task.completed);
  }

  return <><ScrollView contentContainerStyle={{ padding: compact ? 20 : 38, paddingTop: compact ? 26 : 32, paddingBottom: 42 }}>
    <View style={{ maxWidth: 1210, width: '100%', alignSelf: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24 }}>
        <View><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Label style={{ fontSize: compact ? 25 : 28, lineHeight: 37, fontWeight: '700', letterSpacing: 0.3 }}>今天</Label><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.purple, opacity: 0.5 }} /></View>
          <Label muted style={{ fontSize: 11, marginTop: 3 }}>{date.getMonth() + 1} 月 {date.getDate()} 日 · {weekday} <Label style={{ fontSize: 10, color: c.faint }}> / {date.getFullYear()}</Label></Label></View>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><Button title="顺手小事" icon="bell" variant="secondary" onPress={() => setEditor({ kind: 'quick' })} small={compact} /><Button title="添加任务" icon="plus" onPress={() => setEditor({})} small={compact} /></View>
      </View>

      {today !== calendarToday && <Label muted style={{ fontSize: 11, marginBottom: 14 }}>跨夜延续 · 正在继续 {today.slice(5).replace('-', '/')} 的安排</Label>}

      <View style={[styles.hero, { padding: compact ? 23 : 30, minHeight: compact ? 118 : 171 }]}>
        <View style={{ zIndex: 1, maxWidth: compact ? '100%' : '73%' }}>{!compact && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 13 }}><Icon name="sun" size={15} color="#9B86CE" /><Label style={{ fontSize: 10, color: '#9B86CE', letterSpacing: 2 }}>A LITTLE ROOM FOR LIFE</Label></View>}
          <Label style={{ fontSize: compact ? 23 : 28, fontWeight: '600', lineHeight: 38, color: '#4F446C', letterSpacing: 1 }}>{homeGreeting(data.settings.nickname, realNow)}</Label>
          <Label style={{ fontSize: 12, marginTop: 9, color: '#8D819F', lineHeight: 22 }}>{space < 0 ? '想做的事有点多，试着为今天做一点取舍。' : '重要的事慢慢做，意外的事也有位置。'}</Label>
        </View>
        <HeroArt compact={compact} />
      </View>


      {!desktop && <View style={{ backgroundColor: '#F0EBF9', borderWidth: 1, borderColor: '#E5DDF2', borderRadius: 13, padding: 15, marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 11 }}>
        <Icon name="wind" color={c.purple} size={20} /><View style={{ flex: 1 }}><Label style={{ fontSize: 12, fontWeight: '600', color: '#615473' }}>计划赶不上变化？</Label><Label style={{ fontSize: 10, color: '#9586AA' }}>一起安排好接下来。</Label></View><Button title="一键救场" icon="shuffle" small onPress={() => setRescue('interruption')} />
      </View>}

      <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'flex-start', gap: 25, marginTop: 25 }}>
        <View style={{ flex: desktop ? 1 : undefined, width: desktop ? undefined : '100%', minWidth: 0 }}>
          <Card style={{ padding: compact ? 18 : 22, marginBottom: 27 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="pie-chart" size={15} color={c.purple} /><Label style={{ fontSize: 12, fontWeight: '600' }}>今天的时间预算</Label></View><Badge title={space < 0 ? '需要取舍' : dayOver ? '收尾时间' : '还有余地'} tone={space < 0 ? 'orange' : 'green'} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 17, flexWrap: 'wrap' }}><Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '600', color: space < 0 ? c.orange : c.text }}>{durationText(Math.abs(space))}</Label><Label muted style={{ fontSize: 11 }}>{space < 0 ? '预计超出' : '可留给变化'}</Label></View>
            <View style={{ height: 8, borderRadius: 5, backgroundColor: '#F0EDF5', flexDirection: 'row', overflow: 'hidden', marginTop: 15, marginBottom: 12 }}>
              <View style={{ width: `${Math.min(100, capacity ? demand / capacity * 100 : demand ? 100 : 0)}%`, backgroundColor: '#A18BD8' }} />
              <View style={{ width: `${Math.min(100, capacity ? switching / capacity * 100 : 0)}%`, backgroundColor: '#D3C9E8' }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap' }}><Legend color="#A18BD8" text={`事件占用 ${durationText(occupied)}`} /><Legend color="#D3C9E8" text={`切换缓冲 ${switching} 分钟`} /><Legend color="#E8E4F0" text={`待安排 ${durationText(pendingMinutes)}`} /></View>
          </Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Label style={{ fontSize: 16, fontWeight: '600' }}>今日时间轴</Label><Label muted style={{ fontSize: 10 }}>{pending.length} 项待完成</Label></View><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.purple }} /><Label style={{ fontSize: 10, color: c.purple }}>{data.demo ? '模拟' : '现在'} {clock(now)}</Label></View></View>

          {!compact && done.length > 0 && <><Pressable accessibilityRole="button" accessibilityLabel={showDone ? '收起已完成任务' : '展开已完成任务'} onPress={() => setShowDone(!showDone)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingLeft: 62, marginBottom: 12 }}><Icon name="check-circle" size={14} color={c.green} /><Label muted style={{ fontSize: 11 }}>已完成 {done.length} 件事，做得很好</Label><Icon name={showDone ? 'chevron-up' : 'chevron-down'} size={12} /></Pressable>
            {showDone && done.map(task => <TimelineTask key={task.id} task={timelineTask(task)} now={now} onEdit={() => setEditor({ task })} onToggle={() => toggleTask(task)} onToggleImportant={() => toggleImportant(task.id)} compact={compact} />)}</>}

          {planned.length === 0 && unscheduled.length === 0 && <Card style={{ padding: 12 }}><EmptyState title={done.length ? '今天的安排，都完成了' : '今天还有很多可能'} description={done.length ? '留一点时间给自己。明天的事，可以明天再说。' : '先放进一件重要的小事，其余的慢慢来。'} action="添加第一件事" onPress={() => setEditor({})} /></Card>}
          {planned.map(task => {
            const gap = gaps.get(task.id) ?? 0;
            return <View key={task.id}><TimelineTask task={timelineTask(task)} now={now} onEdit={() => setEditor({ task })} onToggle={() => toggleTask(task)} onToggleImportant={() => toggleImportant(task.id)} compact={compact} />
              {gap >= 15 && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingLeft: compact ? 58 : 75, paddingVertical: 7, marginBottom: 8 }}><Icon name="coffee" size={12} color="#A5A0B1" /><Label style={{ color: '#A5A0B1', fontSize: 10 }}>{gap} 分钟留白 · 伸个懒腰，喘口气</Label></View>}
            </View>;
          })}
          {unscheduled.length > 0 && <View style={{ marginTop: 16 }}><Label style={{ fontSize: 12, color: c.orange, marginBottom: 12 }}>还有 {unscheduled.length} 项待安排</Label>{unscheduled.map(task => <TimelineTask key={task.id} task={task} now={now} onEdit={() => setEditor({ task })} onToggle={() => toggleTask(task)} onToggleImportant={() => toggleImportant(task.id)} compact={compact} />)}<Button title="帮我重新安排" variant="secondary" small icon="shuffle" onPress={() => setRescue('rebalance')} style={{ alignSelf: 'flex-end' }} /></View>}
          {pending.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="添加一件事" onPress={() => setEditor({})} style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#DAD6E6', borderRadius: 12, padding: 14, marginLeft: compact ? 49 : 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}><Icon name="plus" size={14} color={c.faint} /><Label style={{ fontSize: 11, color: c.faint }}>添加一件事</Label></Pressable>}
          {compact && done.length > 0 && <><Button title={showDone ? `收起 ${done.length} 件已完成的事` : `看看 ${done.length} 件已完成的事`} variant="ghost" small icon="check-circle" onPress={() => setShowDone(!showDone)} style={{ marginTop: 18 }} />{showDone && done.map(task => <TimelineTask key={task.id} task={timelineTask(task)} now={now} onEdit={() => setEditor({ task })} onToggle={() => toggleTask(task)} onToggleImportant={() => toggleImportant(task.id)} compact />)}</>}
        </View>

        <View style={{ width: desktop ? 290 : '100%', gap: 18 }}>
          {desktop && <View style={styles.rescueCard}>
            <View style={{ width: 38, height: 38, backgroundColor: '#E6DEF7', borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 15 }}><Icon name="wind" size={21} color={c.purple} /></View>
            <Label style={{ fontSize: 17, fontWeight: '600', color: '#514466' }}>计划赶不上变化？</Label><Label style={{ fontSize: 11, color: '#9586AA', marginTop: 8, lineHeight: 21 }}>不用从头再来。{`\n`}告诉我发生了什么，一起安排好接下来。</Label>
            <Button title="一键救场" icon="shuffle" onPress={() => setRescue('interruption')} style={{ marginTop: 20 }} />
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}><Button title="任务超时" icon="clock" variant="ghost" small onPress={() => setRescue('overrun')} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} /><Button title="有点累了" icon="battery" variant="ghost" small onPress={() => setRescue('lowEnergy')} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} /></View>
          </View>}

          <Card style={{ padding: 20 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 17 }}><Label style={{ fontSize: 12, fontWeight: '600' }}>今日重点</Label><Icon name="star" size={15} color={c.orange} /></View>
            {focus.length ? focus.map((task, index) => <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`编辑重点：${task.title}`} onPress={() => setEditor({ task })} style={{ flexDirection: 'row', gap: 10, marginBottom: index < focus.length - 1 ? 13 : 0 }}><View style={{ width: 20, height: 20, backgroundColor: c.lavender, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }}><Label style={{ color: c.purple, fontSize: 10, lineHeight: 15 }}>{String(index + 1).padStart(2, '0')}</Label></View><View style={{ flex: 1 }}><Label style={{ fontSize: 12, lineHeight: 21 }}>{task.title}</Label><Label muted style={{ fontSize: 10 }}>{durationText(task.duration)} · {task.deadline === today ? '今天到期' : '值得优先保护'}</Label></View></Pressable>)
              : <Label muted style={{ fontSize: 11 }}>今天最想推进什么？点亮事件卡片上的星标。</Label>}
            <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 13, marginTop: 17 }}><Label muted style={{ fontSize: 10 }}>不必做完所有事，先做好重要的事。</Label></View>
          </Card>

          <Card style={{ padding: 20 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Label style={{ fontSize: 12, fontWeight: '600' }}>一点点，也在前进</Label><Icon name="trending-up" size={15} color={c.green} /></View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 18 }}><Label style={{ fontSize: 29, lineHeight: 36, fontWeight: '600' }}>{done.length}</Label><Label muted style={{ fontSize: 11 }}>/ {tasks.length} 件事已完成</Label></View>
            <View style={{ height: 5, backgroundColor: '#F1F2F5', borderRadius: 4, marginTop: 12, overflow: 'hidden' }}><View style={{ width: `${progress}%`, height: '100%', backgroundColor: '#A6BAA9', borderRadius: 4 }} /></View>
            <Button title="看看今天的进展" variant="ghost" small icon="arrow-up-right" onPress={() => router.navigate('/review')} style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginTop: 9 }} />
          </Card>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 38 }}><Icon name="feather" size={12} color="#B4AFBE" /><Label style={{ fontSize: 10, color: '#B4AFBE', letterSpacing: 1 }}>今天不必塞满，也可以很好。</Label></View>
    </View>
  </ScrollView>
    <TaskEditor visible={!!editor} task={editor?.task} initialKind={editor?.kind} onClose={() => setEditor(null)} />
    {rescue && <RescueDialog visible initialReason={rescue} onClose={() => setRescue(null)} />}
  </>;
}

function TimelineTask({ task, now, onEdit, onToggle, onToggleImportant, compact }: { task: Task; now: number; onEdit: () => void; onToggle: () => void; onToggleImportant: () => void; compact: boolean }) {
  const quick = isQuick(task);
  const active = !task.completed && task.start !== null && task.start <= now && task.start + task.duration > now;
  const green = task.category === 'health';
  const color = task.completed ? c.faint : green ? c.green : task.important ? c.purple : c.muted;
  return <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: compact ? 9 : 15, marginBottom: 12 }}>
    <View style={{ width: compact ? 40 : 50, alignItems: 'flex-end', paddingTop: 17 }}><Label style={{ fontSize: 11, fontWeight: active ? '600' : '400', color: active ? c.purple : c.muted }}>{task.start !== null ? clock(task.start) : '待定'}</Label>{task.start !== null && !quick && <Label style={{ fontSize: 9, color: c.faint, lineHeight: 18 }}>{clock(task.start + occupiedDuration(task))}</Label>}</View>
    <View style={{ width: 2, backgroundColor: '#E8E5EF', alignItems: 'center' }}><View style={{ marginTop: 22, width: 7, height: 7, borderRadius: 4, backgroundColor: active ? c.purple : '#D5D0DF', borderWidth: active ? 2 : 0, borderColor: '#E7DFF8' }} /></View>
    <View style={{ flex: 1, borderWidth: 1, borderColor: active ? '#CFBFEF' : task.completed ? '#ECECF1' : c.border, backgroundColor: task.completed ? '#FAFAFB' : active ? '#F9F6FF' : '#fff', borderRadius: 13, flexDirection: 'row', alignItems: 'center', padding: compact ? 14 : 17, gap: 12, minHeight: 93 }}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`${task.completed ? '恢复任务' : '完成任务'}：${task.title}`} accessibilityState={{ checked: task.completed }} onPress={onToggle} style={{ width: 21, height: 21, borderRadius: 7, borderWidth: task.completed ? 0 : 1.5, borderColor: task.important ? '#C8B7E8' : '#DBDCE3', backgroundColor: task.completed ? '#B8CBBE' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{task.completed && <Icon name="check" size={13} color="#fff" />}</Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`编辑任务：${task.title}`} onPress={onEdit} style={{ flex: 1, gap: 7 }}>
        <Label style={{ fontSize: compact ? 12 : 13, fontWeight: active ? '600' : '500', textDecorationLine: task.completed ? 'line-through' : 'none', color: task.completed ? c.faint : c.text }}>{task.title}</Label>
        <View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>{quick ? <Badge title="顺手小事" icon="bell" /> : <Label style={{ fontSize: 10, color }}>{durationText(task.duration)}</Label>}
          {task.fixed && <Badge title="固定事项" tone="neutral" icon="lock" />}{task.important && !task.completed && <Badge title="今日重点" icon="star" />}{task.deadline && task.deadline <= dateKey() && !task.completed && <Badge title="截止临近" tone="orange" />}{green && <Badge title="给自己充电" tone="green" />}
        </View>
      </Pressable>
      {!quick && <ImportantButton title={task.title} important={task.important} onPress={onToggleImportant} />}
      {active && !compact && <Badge title="接下来专注" />}
    </View>
  </View>;
}

function Legend({ color, text }: { color: string; text: string }) {
  return <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: color }} /><Label muted style={{ fontSize: 9 }}>{text}</Label></View>;
}
function HeroArt({ compact }: { compact: boolean }) {
  return <View pointerEvents="none" style={{ position: 'absolute', right: compact ? -35 : 45, top: compact ? 28 : 12, width: 180, height: 180, opacity: compact ? 0.35 : 0.85 }}>
    <View style={{ position: 'absolute', right: 15, top: 22, width: 93, height: 93, borderRadius: 50, backgroundColor: '#E2D8F2' }} />
    <View style={{ position: 'absolute', right: 31, top: 38, width: 61, height: 61, borderRadius: 40, backgroundColor: '#EEDFB9', borderWidth: 9, borderColor: '#E9DFD3' }} />
    <View style={{ position: 'absolute', width: 145, height: 100, borderWidth: 1, borderColor: '#C9BCDD', borderRadius: 80, top: 50, right: 0, transform: [{ rotate: '-28deg' }] }} />
    <View style={{ position: 'absolute', width: 145, height: 100, borderWidth: 1, borderColor: '#D9CEE8', borderRadius: 80, top: 34, right: 12, transform: [{ rotate: '25deg' }] }} />
    <View style={{ position: 'absolute', width: 15, height: 15, backgroundColor: '#B3A1CF', borderRadius: 10, left: 34, bottom: 36 }} />
    <View style={{ position: 'absolute', width: 6, height: 6, backgroundColor: '#B6A6CD', borderRadius: 5, right: 6, top: 57 }} />
    <View style={{ position: 'absolute', right: 29, bottom: 11 }}><Icon name="wind" size={23} color="#C1B3D5" /></View>
  </View>;
}

const styles = StyleSheet.create({
  hero: { borderRadius: 19, backgroundColor: '#EEE9F6', borderWidth: 1, borderColor: '#E8E1F1', overflow: 'hidden', justifyContent: 'center' },
  rescueCard: { padding: 23, borderRadius: 17, backgroundColor: '#F0EBF9', borderWidth: 1, borderColor: '#E5DDF2' },
});
