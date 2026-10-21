import React, { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';
import { colors as c, font } from '../theme';
import { usePlanning } from '../store';
import { clock, nextDay, uid } from '../utils';
import type { Category, Priority, Task } from '../types';
import { saveTaskDraft } from '../taskDraft';
import { TimeField } from './TimeField';
import { durationTime, parseDuration } from '../timePicker';
import { Button, Chip, Confirm, Dialog, FieldTitle, Label } from './ui';
import { categoriesFor } from '../categories';
import { CategoryPicker } from './CategoryPicker';
import { QuickReminderSetup } from './QuickReminderSetup';
export { parseTime } from '../time';

type TaskEditorProps = { visible: boolean; task?: Task | null; target?: 'today' | 'inbox'; initialDate?: string; initialCategory?: Category; initialKind?: Task['kind']; onClose: () => void };

export function TaskEditor(props: TaskEditorProps) {
  return props.visible ? <TaskEditorForm key={props.task?.id ?? props.target ?? 'today'} {...props} /> : null;
}

function TaskEditorForm({ visible, task, target = 'today', initialDate, initialCategory, initialKind, onClose }: TaskEditorProps) {
  const { data, planningDate: today, planningNow: now, today: calendarToday, now: calendarNow, mutateTasks, notify, addCategory } = usePlanning();
  const [title, setTitle] = useState(task?.title ?? '');
  const [kind, setKind] = useState<Task['kind']>(task?.kind ?? initialKind ?? 'task');
  const quick = kind === 'quick';
  const quickDefaultDate = calendarNow + 5 >= 1440 ? nextDay(calendarToday) : calendarToday;
  const quickDefaultTime = (calendarNow + 5) % 1440;
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [duration, setDuration] = useState(durationTime(task?.duration ?? 30));
  const [category, setCategory] = useState<Category>(task?.category ?? initialCategory ?? 'work');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'normal');
  const [important, setImportant] = useState(task?.important ?? false);
  const [fixed, setFixed] = useState(task?.fixed ?? false);
  const [timeMode, setTimeMode] = useState<'auto' | 'manual'>(task?.start !== null && task?.start !== undefined ? 'manual' : 'auto');
  const [date, setDate] = useState<string | null>(task ? task.date : initialDate ?? (initialKind === 'quick' ? quickDefaultDate : target === 'today' ? today : null));
  const [time, setTime] = useState(clock(task?.start ?? (initialKind === 'quick' ? quickDefaultTime : calendarNow)));
  const [deadline, setDeadline] = useState(task?.deadline ?? '');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [taskId] = useState(() => task?.id ?? uid());
  const [overlapRequest, setOverlapRequest] = useState<{ key: string; task: Task; conflicts: Task[] } | null>(null);

  function save(consentKey?: string) {
    setOverlapRequest(null);
    setError('');
    const result = saveTaskDraft(data.tasks, data.settings, { id: taskId, kind, title, notes, duration, category, priority, important, fixed, date, time, timeMode, deadline },
      { today, now, calendarToday, calendarNow }, task, consentKey);
    if (result.kind === 'error') { setError(result.error); return; }
    if (result.kind === 'overlap') { setOverlapRequest(result); return; }
    if (!mutateTasks(current => current === data.tasks ? result.tasks : current)) {
      setError('日程已变更，请重新检查后保存。'); return;
    }
    notify(quick ? data.settings.notificationsEnabled ? '顺手小事已保存。' : '顺手小事已保存，可在“我的”中开启日程提醒。' : result.noSlot ? '已保存到待安排区。当天时间不足，可以通过一键救场调整。' : task ? '修改已保存。' : '记下来了，给它一个合适的位置。');
    onClose();
  }

  return <><Dialog visible={visible && !deleting && !overlapRequest} title={quick ? task ? '编辑顺手小事' : '记一件顺手小事' : task ? '编辑这件事' : '给想做的事，一个位置'} subtitle={quick ? '到点提醒，不占用日程时长。' : '先记下来，再找到适合它的节奏。'} onClose={onClose}
    footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {task && <Button title="删除" variant="danger" small onPress={() => setDeleting(true)} />}<View style={{ flex: 1 }} />
      <Button title="取消" variant="ghost" onPress={onClose} /><Button title={task ? '保存修改' : quick ? '添加小事' : '添加任务'} icon="check" onPress={() => save()} />
    </View>}>
    {!task && <View style={styles.chips}><Chip title="任务" selected={!quick} onPress={() => setKind('task')} /><Chip title="顺手小事" icon="bell" selected={quick} onPress={() => { setKind('quick'); if (!date || date <= calendarToday) setDate(quickDefaultDate); setTime(clock(quickDefaultTime)); }} /></View>}
    <FieldTitle>想做什么</FieldTitle><TextInput accessibilityLabel="任务名称" placeholder={quick ? '例如：给花浇水' : '例如：把产品方案写出第一稿'} placeholderTextColor={c.faint} value={title} onChangeText={setTitle} maxLength={100} style={[styles.input, { fontSize: 16 }]} autoFocus />
    <FieldTitle>补充一点细节</FieldTitle><TextInput accessibilityLabel="任务备注" placeholder="什么算完成？第一步可以做什么？" placeholderTextColor={c.faint} value={notes} onChangeText={setNotes} multiline maxLength={1500} style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]} />
    {!quick && <><FieldTitle>预计需要多久</FieldTitle><View style={styles.chips}>{[15, 30, 45, 60, 90].map(value => <Chip key={value} title={`${value} 分钟`} selected={parseDuration(duration) === value} onPress={() => setDuration(durationTime(value))} />)}</View>
    <View style={{ marginTop: 10 }}><TimeField label="自定义时长" value={duration} onChangeText={setDuration} mode="duration" min={5} max={720} fallback={30} /></View></>}
    <FieldTitle>{quick ? '提醒日期' : '安排到哪里'}</FieldTitle><View style={styles.chips}>{!quick && <Chip title="收集箱" selected={!date} onPress={() => { setDate(null); setFixed(false); }} />}<Chip title="今天" selected={date === calendarToday} onPress={() => setDate(calendarToday)} /><Chip title="明天" selected={date === nextDay(calendarToday)} onPress={() => setDate(nextDay(calendarToday))} />{!quick && today !== calendarToday && <Chip title="继续昨晚" selected={date === today} onPress={() => { setDate(today); setFixed(false); }} />}{date && date !== today && date !== calendarToday && date !== nextDay(calendarToday) && <Chip title={date} selected />}</View>
    {quick && <><TextInput accessibilityLabel="小事提醒日期" value={date ?? ''} onChangeText={setDate} placeholder="YYYY-MM-DD" style={[styles.input, { marginTop: 10 }]} maxLength={10} /><FieldTitle>提醒时间</FieldTitle><TimeField label="小事提醒时间" value={time} onChangeText={setTime} /><QuickReminderSetup /></>}
    {date !== null && !quick && <><FieldTitle>开始时间</FieldTitle><View style={styles.chips}>
      <Chip title="自动安排" selected={timeMode === 'auto'} onPress={() => { setTimeMode('auto'); setFixed(false); }} />
      <Chip title="指定时间" selected={timeMode === 'manual'} onPress={() => { setTimeMode('manual'); if (!task && date === today && now >= 1440) setDate(calendarToday); }} />
    </View>
      {timeMode === 'manual' && <><TextInput accessibilityLabel="任务日期" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" style={[styles.input, { marginTop: 12 }]} maxLength={10} />
        <View style={{ marginTop: 12 }}><TimeField label="开始时间" value={time} onChangeText={setTime} /></View>
        <View style={styles.switchRow}><View><Label style={{ fontSize: 13 }}>固定开始时间</Label><Label muted style={{ fontSize: 11 }}>会议、预约等，救场时保持不变</Label></View><Switch accessibilityLabel="固定开始时间" value={fixed} onValueChange={setFixed} trackColor={{ false: '#E3E1E9', true: '#C6B7EC' }} thumbColor={fixed ? c.purple : '#fff'} /></View></>}
    </>}
    <FieldTitle>属于生活的哪一部分</FieldTitle><CategoryPicker categories={categoriesFor(data)} value={category} onChange={setCategory} onAdd={addCategory} />
    {!quick && <><FieldTitle>优先级</FieldTitle><View style={styles.chips}>{([['high', '优先处理'], ['normal', '正常安排'], ['low', '有空再做']] as const).map(([value, label]) => <Chip key={value} title={label} selected={priority === value} onPress={() => setPriority(value)} />)}</View>
    <View style={styles.switchRow}><View><Label style={{ fontSize: 13 }}>设为重点</Label><Label muted style={{ fontSize: 11 }}>调整日程时，优先保护它</Label></View><Switch accessibilityLabel="设为重点" value={important} onValueChange={setImportant} trackColor={{ false: '#E3E1E9', true: '#C6B7EC' }} thumbColor={important ? c.purple : '#fff'} /></View>
    <FieldTitle>截止日期（选填）</FieldTitle><TextInput accessibilityLabel="截止日期" value={deadline} onChangeText={setDeadline} placeholder="YYYY-MM-DD" placeholderTextColor={c.faint} style={styles.input} />
    <View style={[styles.chips, { marginTop: 9 }]}><Chip title="今天到期" selected={deadline === calendarToday} onPress={() => setDeadline(calendarToday)} /><Chip title="明天到期" selected={deadline === nextDay(calendarToday)} onPress={() => setDeadline(nextDay(calendarToday))} /><Chip title="无截止日期" selected={!deadline} onPress={() => setDeadline('')} /></View></>}
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
