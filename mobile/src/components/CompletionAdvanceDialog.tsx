import React, { useMemo } from 'react';
import { View } from 'react-native';
import { usePlanning } from '../store';
import { createAdvancePlan } from '../completion';
import { colors as c } from '../theme';
import { Button, Confirm, Dialog, Icon, Label } from './ui';
import { planningContext } from '../time';
import { dateKey } from '../utils';

export function CompletionAdvanceDialog() {
  const { data, completionOffer, completionRestore, setCompleted, dismissCompletionOffer, applyPlan } = usePlanning();
  const moment = new Date();
  const context = planningContext(dateKey(moment), moment.getHours() * 60 + moment.getMinutes(), data.settings);
  const plan = useMemo(() => createAdvancePlan(data.tasks, data.settings, completionOffer ?? '', context.date, context.now),
    [data.tasks, data.settings, completionOffer, context.date, context.now]);
  if (completionRestore) return <Confirm visible title="恢复后会与其他事项重叠" description={`恢复为未完成后，会与${completionRestore.conflicts.map(title => `「${title}」`).join('、')}重叠。可先取消，在回顾撤销提前安排；也可确认保留重叠。`}
    action="确认恢复并保留重叠" onClose={dismissCompletionOffer} onConfirm={() => setCompleted(completionRestore.taskId, false, completionRestore.key)} />;
  if (!completionOffer) return null;
  const source = data.tasks.find(task => task.id === completionOffer);
  return <Dialog visible title="已完成，要提前后面的安排吗？" subtitle={`「${source?.title ?? ''}」已记录完成。你也可以保留这段空闲。`} onClose={dismissCompletionOffer}
    footer={<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
      <Button title="保持原安排" variant="ghost" onPress={dismissCompletionOffer} />
      <Button title="确认提前" icon="check" disabled={!plan.valid || !plan.changes.length} onPress={() => {
        if (applyPlan(plan, `完成后提前安排：${source?.title ?? ''}`)) dismissCompletionOffer();
      }} />
    </View>}>
    <Label muted style={{ fontSize: 12 }}>按原顺序提前灵活任务，保留切换缓冲。固定事项和顺手小事保持原时刻，确认后可在回顾中撤销这次提前。</Label>
    <Label style={{ marginTop: 20, marginBottom: 8, fontWeight: '600' }}>调整预览 · {plan.changes.length} 项</Label>
    {plan.changes.map(change => <View key={change.taskId} style={{ borderTopWidth: 1, borderTopColor: c.border, paddingVertical: 12, gap: 5 }}>
      <Label style={{ fontSize: 13 }}>{change.title}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><Label muted style={{ fontSize: 12 }}>{change.from}</Label><Icon name="arrow-right" size={12} color={c.purple} /><Label style={{ fontSize: 12, color: c.purple }}>{change.to}</Label></View>
    </View>)}
    {!plan.changes.length && <Label accessibilityLiveRegion="polite" muted style={{ fontSize: 12, marginTop: 8 }}>当前已没有适合提前的任务，原安排保持不变。</Label>}
  </Dialog>;
}
