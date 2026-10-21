import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Task } from '../types';
import type { TaskPosition } from '../week';
import { clock, durationText } from '../utils';
import { colors as c } from '../theme';
import { parseTime } from './TaskEditor';
import { Badge, Button, Dialog, FieldTitle, Icon, Label } from './ui';
import { TimeField } from './TimeField';
import { DateField } from './DateField';
import { isQuick } from '../quick';
import { usePlanning } from '../store';

export function WeekTaskDetails({ task, fallbackDate, fallbackStart, onClose, onSave, onUnlock, onEdit }: {
  task: Task; fallbackDate: string; fallbackStart: number; onClose: () => void;
  onSave: (position: TaskPosition) => string | null; onUnlock: () => void; onEdit: () => void;
}) {
  const [date, setDate] = useState(task.date ?? fallbackDate);
  const { setCompleted } = usePlanning();
  const [time, setTime] = useState(clock(task.start ?? fallbackStart));
  const [error, setError] = useState('');
  const quick = isQuick(task);
  function save() {
    const start = parseTime(time);
    if (start === null) { setError('请选择有效的小时和分钟。'); return; }
    const message = onSave({ date, start });
    if (message) setError(message);
  }
  return <Dialog visible title={task.title} subtitle="拖动适合快速调整，也可以在这里精确选择日期与时间。" onClose={onClose}
    footer={<View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
      <Button title="编辑详情" variant="ghost" small icon="edit-2" onPress={onEdit} />
      <Button title={task.fixed ? '确认修改固定时间' : '保存这个时间'} disabled={task.completed} icon="check" onPress={save} />
    </View>}>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="此事件已完成" accessibilityState={{ checked: task.completed }}
      onPress={() => { setCompleted(task.id, !task.completed); onClose(); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <Icon name={task.completed ? 'check-square' : 'square'} color={c.purple} size={21} /><Label style={{ fontSize: 13 }}>此事件已完成</Label>
    </Pressable>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
      <Badge title={quick ? '顺手小事 · 时间点提醒' : durationText(task.duration)} tone="neutral" icon={quick ? 'bell' : undefined} />
      {task.fixed && <Badge title="固定事项 · 默认锁定" tone="orange" icon="lock" />}
      {task.completed && <Badge title="已完成 · 不可拖动" tone="green" icon="check" />}
      {task.deadline && <Badge title={`${task.deadline} 到期`} tone="orange" />}
    </View>
    {task.notes ? <Label muted style={{ fontSize: 12, marginTop: 18 }}>{task.notes}</Label> : null}
    {task.fixed && !task.completed && <View style={{ backgroundColor: c.orangeBg, padding: 14, borderRadius: 10, marginTop: 18 }}>
      <Label style={{ fontSize: 12, color: c.orange }}>固定事项不能直接拖动。确认后只允许移动一次，放下后自动重新锁定。</Label>
      <Button title="解锁一次拖动" icon="unlock" variant="secondary" small onPress={onUnlock} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
    </View>}
    <FieldTitle>任务日期</FieldTitle><DateField label="周览任务日期" value={date} onChangeText={setDate} fallback={fallbackDate} disabled={task.completed} />
    <FieldTitle>{quick ? '提醒时间' : '开始时间'}</FieldTitle><TimeField label={quick ? '周览提醒时间' : '周览开始时间'} value={time} onChangeText={setTime} disabled={task.completed} />
    <Label muted style={{ fontSize: 11, marginTop: 10 }}>{quick ? '只调整提醒时刻，不占用日程时长。' : `时长保持 ${durationText(task.duration)}。时间重叠时确认后可保存，不能超出截止日期。`}</Label>
    {error && <Label accessibilityRole="alert" style={{ fontSize: 12, color: c.red, marginTop: 15 }}>{error}</Label>}
  </Dialog>;
}
