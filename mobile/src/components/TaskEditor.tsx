import React, { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { colors as c, font } from '../theme';
import { usePlanning } from '../store';
import { clock, nextDay, uid } from '../utils';
import { scheduleTask } from '../scheduler';
import type { Category, Priority, Task } from '../types';
import { finishesByDeadline, overlaps, parseTime } from '../time';
import { overlapConsentKey } from '../week';
import { TimeField } from './TimeField';
import { durationTime, parseDuration } from '../timePicker';
import { Button, Chip, Confirm, Dialog, FieldTitle, Label } from './ui';
export { parseTime } from '../time';

type TaskEditorProps = { visible: boolean; task?: Task | null; target?: 'today' | 'inbox'; initialDate?: string; onClose: () => void };

export function TaskEditor(props: TaskEditorProps) {
  return props.visible ? <TaskEditorForm key={props.task?.id ?? props.target ?? 'today'} {...props} /> : null;
}

function TaskEditorForm({ visible, task, target = 'today', initialDate, onClose }: TaskEditorProps) {
  const { data, planningDate: today, planningNow: now, today: calendarToday, now: calendarNow, mutateTasks, notify } = usePlanning();
  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [duration, setDuration] = useState(durationTime(task?.duration ?? 30));
  const [category, setCategory] = useState<Category>(task?.category ?? 'work');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [important, setImportant] = useState(task?.important ?? false);
  const [fixed, setFixed] = useState(task?.fixed ?? false);
  const [date, setDate] = useState<string | null>(task ? task.date : initialDate ?? (target === 'today' ? today : null));
  const [time, setTime] = useState(clock(task?.start ?? Math.min(1380, Math.max(data.settings.dayStart, Math.ceil(now / 30) * 30))));
  const [deadline, setDeadline] = useState(task?.deadline ?? '');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [taskId] = useState(() => task?.id ?? uid());
  const [overlapRequest, setOverlapRequest] = useState<{ key: string; task: Task; conflicts: Task[] } | null>(null);

  function save(consentKey?: string) {
    setOverlapRequest(null);
    setError('');
    const minutes = parseDuration(duration);
    if (!title.trim()) { setError('先给这件事起一个名字。'); return; }
    if (minutes === null || !Number.isInteger(minutes) || minutes < 5 || minutes > 720) { setError('预计时长应在 5 分钟至 12 小时之间。'); return; }
    if (deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(new Date(`${deadline}T12:00:00`).getTime()) || new Date(`${deadline}T12:00:00`).getDate() !== Number(deadline.slice(-2)))) {
      setError('截止日期请使用有效的 YYYY-MM-DD 格式。'); return;
    }
    // Editing the title or notes must preserve a position chosen in the week grid.
    const preservedStart = !fixed && date && task?.date === date ? task.start : null;
    const start = fixed && date ? parseTime(time) : preservedStart;
    if (fixed && date && start === null) { setError('请输入有效的开始时间。'); return; }
    const timingChanged = !task || task.date !== date || task.start !== start || task.duration !== minutes;
    if ((timingChanged || task?.deadline !== (deadline || null)) && date && start !== null && !finishesByDeadline(date, start, minutes, deadline || null)) { setError('任务结束时间超过截止日期，请调整时间或时长。'); return; }
    const updated: Task = { id: taskId, title: title.trim(), notes: notes.trim(), duration: minutes,
      category, priority, important, fixed: !!date && fixed, completed: task?.completed ?? false,
      completedAt: task?.completedAt, date, start, deadline: deadline || null, postponed: task?.postponed ?? 0,
      courseImport: task?.courseImport, inboxReminderAfter: task?.inboxReminderAfter };
    const conflicts = timingChanged ? data.tasks.filter(item => item.id !== taskId && overlaps(updated, item)) : [];
    if (conflicts.length && consentKey !== overlapConsentKey(updated, conflicts)) {
      setOverlapRequest({ key: overlapConsentKey(updated, conflicts), task: updated, conflicts }); return;
    }
    let next = task ? data.tasks.map(item => item.id === task.id ? updated : item) : [...data.tasks, updated];
    let noSlot = false;
    if (date && !updated.fixed && start === null) {
      const scheduled = scheduleTask(next, updated.id, data.settings, date, date === today ? now : data.settings.dayStart);
      if (scheduled) next = scheduled;
      else noSlot = true;
    }
    mutateTasks(() => next);
    notify(noSlot ? '已保存到待安排区。当天时间不足，可以通过一键救场调整。' : task ? '修改已保存。' : '记下来了，给它一个合适的位置。');
    onClose();
  }

  return <><Dialog visible={visible && !deleting && !overlapRequest} title={task ? '编辑这件事' : '给想做的事，一个位置'} subtitle="先记下来，再找到适合它的节奏。" onClose={onClose}
    footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {task && <Button title="删除" variant="danger" small onPress={() => setDeleting(true)} />}<View style={{ flex: 1 }} />
      <Button title="取消" variant="ghost" onPress={onClose} /><Button title={task ? '保存修改' : '添加任务'} icon="check" onPress={() => save()} />
    </View>}>
    <FieldTitle>想做什么</FieldTitle><TextInput accessibilityLabel="任务名称" placeholder="例如：把产品方案写出第一稿" placeholderTextColor={c.faint} value={title} onChangeText={setTitle} maxLength={100} style={[styles.input, { fontSize: 16 }]} autoFocus />
    <FieldTitle>补充一点细节</FieldTitle><TextInput accessibilityLabel="任务备注" placeholder="什么算完成？第一步可以做什么？" placeholderTextColor={c.faint} value={notes} onChangeText={setNotes} multiline maxLength={1500} style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} />
    <FieldTitle>预计需要多久</FieldTitle><View style={styles.chips}>{[15, 30, 45, 60, 90].map(value => <Chip key={value} title={`${value} 分钟`} selected={parseDuration(duration) === value} onPress={() => setDuration(durationTime(value))} />)}</View>
    <View style={{ marginTop: 10 }}><TimeField label="自定义时长" value={duration} onChangeText={setDuration} mode="duration" min={5} max={720} fallback={30} /></View>
    <FieldTitle>安排到哪里</FieldTitle><View style={styles.chips}><Chip title="收集箱" selected={!date} onPress={() => { setDate(null); setFixed(false); }} /><Chip title="今天" selected={date === today} onPress={() => setDate(today)} /><Chip title="明天" selected={date === nextDay(today)} onPress={() => setDate(nextDay(today))} />{date && date !== today && date !== nextDay(today) && <Chip title={date} selected />}</View>
    {date && <><View style={styles.switchRow}><View><Label style={{ fontSize: 13 }}>固定开始时间</Label><Label muted style={{ fontSize: 11 }}>会议、预约等，救场时保持不变</Label></View><Switch accessibilityLabel="固定开始时间" value={fixed} onValueChange={value => { setFixed(value); if (value && !task && date === today && now >= 1440) { setDate(calendarToday); setTime(clock(calendarNow)); } }} trackColor={{ false: '#E3E1E9', true: '#C6B7EC' }} thumbColor={fixed ? c.purple : '#fff'} /></View>
      {fixed && <TimeField label="开始时间" value={time} onChangeText={setTime} />}</>}
    <FieldTitle>属于生活的哪一部分</FieldTitle><View style={styles.chips}>{([['work', '工作'], ['life', '生活'], ['health', '健康']] as const).map(([value, label]) => <Chip key={value} title={label} selected={category === value} onPress={() => setCategory(value)} />)}</View>
    <FieldTitle>优先级</FieldTitle><View style={styles.chips}>{([['high', '优先处理'], ['normal', '正常安排'], ['low', '有空再做']] as const).map(([value, label]) => <Chip key={value} title={label} selected={priority === value} onPress={() => setPriority(value)} />)}</View>
    <View style={styles.switchRow}><View><Label style={{ fontSize: 13 }}>设为重点</Label><Label muted style={{ fontSize: 11 }}>调整日程时，优先保护它</Label></View><Switch accessibilityLabel="设为重点" value={important} onValueChange={setImportant} trackColor={{ false: '#E3E1E9', true: '#C6B7EC' }} thumbColor={important ? c.purple : '#fff'} /></View>
    <FieldTitle>截止日期（选填）</FieldTitle><TextInput accessibilityLabel="截止日期" value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={c.faint} style={styles.input} />
    <View style={[styles.chips, { marginTop: 9 }]}><Chip title="今天到期" selected={deadline === today} onPress={() => setDeadline(today)} /><Chip title="明天到期" selected={deadline === nextDay(today)} onPress={() => setDeadline(nextDay(today))} /><Chip title="无截止日期" selected={!deadline} onPress={() => setDeadline('')} /></View>
    {error ? <Label style={{ color: c.red, marginTop: 18, fontSize: 12 }} accessibilityRole="alert">{error}</Label> : null}
  </Dialog>
    <Confirm visible={visible && !!overlapRequest} title="同时安排这几件事？" description={`「${overlapRequest?.task.title ?? ''}」将安排到 ${overlapRequest?.task.date ?? ''} ${overlapRequest ? `${clock(overlapRequest.task.start!)}–${clock(overlapRequest.task.start! + overlapRequest.task.duration)}` : ''}，与${overlapRequest?.conflicts.map(item => `「${item.title}」`).join('、') ?? ''}时间重叠。确认后保留这些安排；自动排程仍会避开已占用的时段。`} action="确认重叠安排" onClose={() => setOverlapRequest(null)} onConfirm={() => save(overlapRequest?.key)} />
    <Confirm visible={visible && deleting} title="删除这件事？" description={`「${task?.title ?? ''}」将从日程中移除。`} action="确认删除" onClose={() => setDeleting(false)} onConfirm={() => { mutateTasks(tasks => tasks.filter(item => item.id !== task?.id)); notify('任务已删除。'); setDeleting(false); onClose(); }} />
  </>;
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderColor: '#E5E3ED', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontFamily: font, fontSize: 13, color: c.text, backgroundColor: '#FCFCFD', minHeight: 44 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20, marginBottom: 12 },
});
