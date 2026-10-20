import React, { useState } from 'react';
import { Platform, ScrollView, Share, TextInput, useWindowDimensions, View } from 'react-native';
import { usePlanning } from '../store';
import { colors as c, font } from '../theme';
import { clock } from '../utils';
import { enableNotifications } from '../notifications';
import { DEFAULT_FREE_MINUTES, findInboxSuggestion, localMoment } from '../inboxReminders';
import { InboxSuggestionDialog } from '../components/InboxSuggestionDialog';
import { defaultSettings } from '../seed';
import { useRouter } from 'expo-router';
import { parseTime, parsePreferenceEnd, preferenceTime } from '../time';
import { Badge, Button, Card, Chip, Confirm, FieldTitle, Icon, Label } from '../components/ui';

export default function Me() {
  const router = useRouter();
  const { data, today, now, updateSettings, notify, reset, saveStatus } = usePlanning();
  const { width } = useWindowDimensions();
  const [start, setStart] = useState(clock(data.settings.dayStart));
  const [end, setEnd] = useState(preferenceTime(data.settings.dayEnd));
  const [buffer, setBuffer] = useState(String(data.settings.buffer));
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'demo' | 'empty' | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [previewTask, setPreviewTask] = useState<string | null>(null);
  const availableSuggestion = findInboxSuggestion(data, localMoment(today, now));

  function save() {
    const dayStart = parseTime(start.trim() || clock(data.settings.dayStart));
    const dayEnd = dayStart === null ? null : parsePreferenceEnd(end.trim() || preferenceTime(data.settings.dayEnd), dayStart);
    const minutes = Number(buffer);
    if (dayStart === null || dayEnd === null) { setError('请输入有效时间，结束最晚可到次日凌晨 6 点。'); return; }
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60) { setError('切换缓冲请输入 0–60 之间的整数分钟。'); return; }
    setStart(clock(dayStart)); setEnd(preferenceTime(dayEnd));
    updateSettings({ ...data.settings, dayStart, dayEnd, buffer: minutes }); setError(''); notify('节奏已保存，后续排程会参考这些偏好。');
  }
  function completeTime(kind: 'start' | 'end') {
    if (kind === 'start') {
      const value = parseTime(start.trim() || clock(data.settings.dayStart));
      if (value !== null) setStart(clock(value));
    } else {
      const value = parsePreferenceEnd(end.trim() || preferenceTime(data.settings.dayEnd), parseTime(start) ?? data.settings.dayStart);
      if (value !== null) setEnd(preferenceTime(value));
    }
  }
  async function toggleNotifications() {
    if (Platform.OS === 'web') { notify('网页预览暂不支持系统提醒，请在 Android 或 iOS 版本开启。'); return; }
    if (data.settings.notificationsEnabled) { updateSettings({ ...data.settings, notificationsEnabled: false }); notify('已关闭日程提醒。'); return; }
    setPermissionPending(true);
    try {
      const granted = await enableNotifications();
      if (granted) { updateSettings({ ...data.settings, notificationsEnabled: true }); notify(data.demo ? '提醒已开启；示例日程不发送通知，真实任务会在开始时提醒。' : '日程提醒已开启。'); }
      else notify('尚未获得通知权限，可以在手机系统设置中允许留白发送通知。');
    } catch { notify('暂时无法开启提醒，请确认当前手机版本支持通知并检查系统权限。'); }
    finally { setPermissionPending(false); }
  }
  async function toggleInboxReminders() {
    if (Platform.OS === 'web') return;
    if (data.settings.inboxRemindersEnabled) { updateSettings({ ...data.settings, inboxRemindersEnabled: false }); notify('已关闭收集箱空闲提醒。'); return; }
    setPermissionPending(true);
    try {
      if (await enableNotifications()) {
        updateSettings({ ...data.settings, inboxRemindersEnabled: true });
        notify(data.demo ? '空闲提醒已开启；示例模式不发送通知。' : '收集箱空闲提醒已开启。');
      } else notify('请在手机系统设置中允许留白发送通知。');
    } catch { notify('暂时无法开启提醒，请检查系统通知权限。'); }
    finally { setPermissionPending(false); }
  }
  async function exportData() {
    const json = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
    if (Platform.OS === 'web') {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `留白备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); notify('备份文件已交给浏览器下载。');
    } else {
      try { await Share.share({ title: '留白数据备份', message: json }); } catch { notify('分享备份失败，请稍后重试。'); }
    }
  }
  const input = { borderWidth: 1, borderColor: '#E2DFEA', borderRadius: 10, padding: 12, backgroundColor: '#FCFCFD', fontFamily: font, fontSize: 14, color: c.text, minHeight: 44 };

  return <><ScrollView contentContainerStyle={{ padding: width < 600 ? 20 : 38, paddingBottom: 45 }}><View style={{ maxWidth: 900, width: '100%', alignSelf: 'center' }}>
    <Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '700' }}>我的</Label><Label muted style={{ fontSize: 11, marginTop: 6, marginBottom: 27 }}>你的节奏、提醒和数据，都在这里。</Label>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', gap: 9, alignItems: 'center' }}><Icon name="sun" size={18} color={c.purple} /><Label style={{ fontWeight: '600', fontSize: 14 }}>日程偏好</Label></View>
      <View style={{ flexDirection: 'row', gap: 16 }}><View style={{ flex: 1 }}><FieldTitle>从几点开始</FieldTitle><TextInput accessibilityLabel="一天开始时间" value={start} onChangeText={setStart} onBlur={() => completeTime('start')} onSubmitEditing={() => completeTime('start')} selectTextOnFocus autoCorrect={false} placeholder="开始时间" style={input} /></View><View style={{ flex: 1 }}><FieldTitle>希望几点结束</FieldTitle><TextInput accessibilityLabel="一天结束时间" value={end} onChangeText={setEnd} onBlur={() => completeTime('end')} onSubmitEditing={() => completeTime('end')} selectTextOnFocus autoCorrect={false} placeholder="结束时间" style={input} /></View></View>
      <Label muted style={{ fontSize: 11, marginTop: 10 }}>结束最晚可到次日凌晨 6 点。</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingTop: 12 }}>{['18:00', '22:00', '次日 02:00', '次日 06:00'].map(value => <Chip key={value} title={value} selected={end === value} onPress={() => { setEnd(value); setError(''); }} />)}</ScrollView>
      <FieldTitle>灵活任务之间，留多少分钟切换</FieldTitle><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><TextInput accessibilityLabel="任务切换缓冲" value={buffer} onChangeText={setBuffer} keyboardType="number-pad" style={[input, { width: 100 }]} /><Label muted style={{ fontSize: 12 }}>分钟</Label></View>
      <Label muted style={{ fontSize: 11, marginTop: 15 }}>只影响后续安排，不会自动移动已有日程。选择「保截止时间」时，可在预览中接受最多延后 60 分钟。</Label>
      {error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 13 }}>{error}</Label>}
      <Button title="保存我的节奏" icon="check" onPress={save} style={{ alignSelf: 'flex-start', marginTop: 20 }} />
    </Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="book-open" color={c.purple} /><View style={{ flex: 1 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>课表导入</Label><Label muted style={{ fontSize: 11, marginTop: 5 }}>哈尔滨工业大学（深圳）</Label></View><Button title="导入课表" icon="download" variant="secondary" small onPress={() => router.navigate('/course-import')} /></View></Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 }}><View style={{ flex: 1 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>日程提醒</Label><Label muted style={{ fontSize: 11, marginTop: 8 }}>{Platform.OS === 'web' ? '系统提醒需要在手机端使用，网页预览不发送通知。' : '在任务开始时发送本地通知。示例日程不发送提醒。'}</Label></View><Button title={permissionPending ? '正在开启…' : data.settings.notificationsEnabled ? '关闭提醒' : '开启提醒'} icon="bell" variant="secondary" small disabled={permissionPending || Platform.OS === 'web'} onPress={toggleNotifications} /></View></Card>
    <Card style={{ marginBottom: 20 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>收集箱空闲提醒</Label>
      <Label muted style={{ fontSize: 11, marginTop: 8 }}>有较长连续空档时，问问要不要做一件待办。</Label>
      <Button title={permissionPending ? '正在开启…' : data.settings.inboxRemindersEnabled ? '关闭空闲提醒' : '开启空闲提醒'} icon="bell" variant="secondary" small disabled={permissionPending || Platform.OS === 'web'} onPress={toggleInboxReminders} style={{ alignSelf: 'flex-start', marginTop: 14 }} />
      <FieldTitle>连续空闲至少</FieldTitle><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{[30, 60, 90, 120].map(minutes => <Chip key={minutes} title={minutes < 60 ? `${minutes} 分钟` : `${minutes / 60} 小时`} selected={(data.settings.inboxReminderMinMinutes ?? DEFAULT_FREE_MINUTES) === minutes} onPress={() => updateSettings({ ...data.settings, inboxReminderMinMinutes: minutes })} />)}</View>
      <Label muted style={{ fontSize: 11, marginTop: 13 }}>按偏好时段计算，每天最多一次。确认后才安排；暂不安排则暂停该待办 3 天。</Label>
      {Platform.OS === 'web' && <Label muted style={{ fontSize: 11, marginTop: 8 }}>系统通知仅在手机端发送。</Label>}
      {data.demo && <Label muted style={{ fontSize: 11, marginTop: 8 }}>示例模式不发送系统通知。</Label>}
      <Button title="预览待办提醒" variant="ghost" small disabled={!availableSuggestion} onPress={() => setPreviewTask(availableSuggestion?.taskId ?? null)} style={{ alignSelf: 'flex-start', marginTop: 14 }} />
      {!availableSuggestion && <Label muted style={{ fontSize: 11, marginTop: 8 }}>当前没有可推荐的待办或足够长的空档。</Label>}
    </Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name="hard-drive" size={18} color={c.green} /><Label style={{ fontSize: 14, fontWeight: '600' }}>数据留在你这里</Label><Badge title={saveStatus === 'saved' ? '本地保存' : saveStatus === 'saving' ? '保存中' : '保存失败'} tone={saveStatus === 'error' ? 'orange' : 'green'} /></View>
      <Label muted style={{ fontSize: 11, marginTop: 12 }}>当前版本无需账号。{Platform.OS === 'web' ? '数据保存在这个浏览器中，清除站点数据会删除记录。' : '数据保存在这台设备上，卸载应用会删除记录。'}跨设备同步尚未接入。</Label>
      <Button title="导出数据备份" icon="download" variant="secondary" small onPress={exportData} style={{ alignSelf: 'flex-start', marginTop: 17 }} />
    </Card>
    <Card style={{ marginBottom: 25 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>重新开始</Label><Label muted style={{ fontSize: 11, marginTop: 9 }}>载入示例或清空任务都会替换当前数据，请先导出需要保留的记录。</Label><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 17 }}><Button title="重新体验示例" icon="refresh-cw" variant="secondary" small onPress={() => setConfirm('demo')} /><Button title="清空，开始我的一天" icon="sunrise" variant="ghost" small onPress={() => setConfirm('empty')} /></View></Card>
    <Label muted style={{ textAlign: 'center', fontSize: 10 }}>留白 0.3.0 · 给今天留一点余地</Label>
  </View></ScrollView><Confirm visible={!!confirm} title={confirm === 'demo' ? '重新载入示例日程？' : '清空并重新开始？'} description="当前所有任务和调整记录都将被替换。请确认已经导出需要保留的数据。" action={confirm === 'demo' ? '载入示例' : '确认清空'} onClose={() => setConfirm(null)} onConfirm={() => { reset(confirm === 'demo'); setStart(clock(defaultSettings.dayStart)); setEnd(preferenceTime(defaultSettings.dayEnd)); setBuffer(String(defaultSettings.buffer)); setError(''); setConfirm(null); }} /><InboxSuggestionDialog taskId={previewTask} preview onClose={() => setPreviewTask(null)} /></>;
}
