import React, { useState } from 'react';
import { View } from 'react-native';
import type { AppData } from '../types';
import { completionAdvanceFor, type CompletionUndoChoice } from '../completionUndo';
import { previewCompletionReschedule, type CompletionRescheduleRequest } from '../completionReschedule';
import { clock, dateKey } from '../utils';
import { parseTime } from '../time';
import { colors as c } from '../theme';
import { Button, Chip, Confirm, Dialog, FieldTitle, Label } from './ui';
import { DateField } from './DateField';
import { TimeField } from './TimeField';

export function CompletionRescheduleDialog({ data, taskId, initialChoice, onClose, onConfirm, moment = new Date() }: {
  data: AppData; taskId: string; initialChoice: CompletionUndoChoice; onClose: () => void; moment?: Date;
  onConfirm: (request: CompletionRescheduleRequest, key: string, consent?: string) => boolean;
}) {
  const source = data.tasks.find(task => task.id === taskId);
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [choice, setChoice] = useState(initialChoice);
  const [later] = useState(() => new Date(moment.getTime() + 5 * 60000));
  const [date, setDate] = useState(() => dateKey(later));
  const [time, setTime] = useState(() => clock(later.getHours() * 60 + later.getMinutes()));
  const [deadline, setDeadline] = useState(source?.deadline ?? '');
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState('');
  const request: CompletionRescheduleRequest = { taskId, choice, deadline: deadline || null,
    placement: mode === 'auto' ? { mode } : { mode, date, start: parseTime(time) ?? -1 } };
  const preview = previewCompletionReschedule(data, request, moment);
  const advance = completionAdvanceFor(data, taskId);
  function confirm(consent?: string) {
    if (confirmation && confirmation !== preview.key) { setConfirmation(null); setError('日程或当前时间已变化，请重新核对安排。'); return; }
    if (onConfirm(request, preview.key, consent)) setConfirmation(null);
    else { setConfirmation(null); setError('未能保存，请重新核对当前预览。'); }
  }
  if (confirmation) return <Confirm visible title="确认这次手动安排？" description={`${preview.conflicts.length ? `与${preview.conflicts.map(task => `「${task.title}」`).join('、')}时间重叠。` : ''}${preview.outside ? '所选时间超出偏好时段。' : ''}确认后按所选时间恢复为待完成；自动排程仍避开占用。`}
    action="确认撤销并安排" onClose={() => setConfirmation(null)} onConfirm={() => confirm(preview.consentKey)} />;
  return <Dialog visible title="原时段已结束，重新安排这件事？" subtitle={`「${source?.title ?? ''}」确认安排前仍保留已完成状态。`} onClose={onClose}
    footer={<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}><Button title="取消" variant="ghost" onPress={onClose} /><Button title="确认撤销并安排" disabled={!preview.valid} onPress={() => preview.needsConsent ? setConfirmation(preview.key) : confirm()} /></View>}>
    {advance && <><FieldTitle>后续事件的提前安排</FieldTitle><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Chip title="保留提前" selected={choice === 'keep'} onPress={() => setChoice('keep')} /><Chip title="一并取消提前" selected={choice === 'cancel-advance'} onPress={() => setChoice('cancel-advance')} /></View></>}
    <FieldTitle>安排方式</FieldTitle><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Chip title="空闲时间自动安排" selected={mode === 'auto'} onPress={() => setMode('auto')} /><Chip title="自己选时间" selected={mode === 'manual'} onPress={() => setMode('manual')} /></View>
    {mode === 'manual' && <><FieldTitle>日期</FieldTitle><DateField label="重新安排日期" value={date} onChangeText={setDate} /><FieldTitle>{source?.kind === 'quick' ? '提醒时间' : '开始时间'}</FieldTitle><TimeField label="重新安排时间" value={time} onChangeText={setTime} /></>}
    {source?.deadline && <><FieldTitle>截止日期</FieldTitle><DateField label="重新安排截止日期" value={deadline} onChangeText={setDeadline} optional /></>}
    {preview.position && <View style={{ padding: 14, borderRadius: 10, backgroundColor: c.lavender, marginTop: 18 }}><Label style={{ fontSize: 13, color: c.purpleDark }}>安排预览：{preview.position.date} {clock(preview.position.start)}{source?.kind !== 'quick' ? `–${clock(preview.position.start + (source?.duration ?? 0))}` : ''}</Label><Label muted style={{ fontSize: 11, marginTop: 6 }}>{source?.fixed ? '固定事项保留固定属性。' : '只重新安排这件事。'}{choice === 'cancel-advance' ? '同时按预览取消此前的提前。' : '后续事件保持原安排。'}</Label></View>}
    {preview.changes.filter(change => change.taskId !== taskId).map(change => <Label key={change.taskId} muted style={{ fontSize: 11, marginTop: 10 }}>{change.title}：{change.from} → {change.to}</Label>)}
    {preview.skipped.map(item => <Label key={item.taskId} style={{ color: c.orange, fontSize: 11, marginTop: 10 }}>{item.title}：{item.reason}，保留当前状态。</Label>)}
    {preview.error && <Label accessibilityRole="alert" style={{ color: c.orange, fontSize: 12, marginTop: 16 }}>{preview.error}</Label>}
    {!!error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 12 }}>{error}</Label>}
  </Dialog>;
}
