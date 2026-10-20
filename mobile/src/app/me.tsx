import { KeyboardFormScrollView } from '../components/KeyboardForm';
import React, { useState } from 'react';
import { Platform, ScrollView, Share, useWindowDimensions, View } from 'react-native';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { TimeField } from '../components/TimeField';
import { durationTime, parseDuration } from '../timePicker';
import { clock } from '../utils';
import { enableNotifications } from '../notifications';
import { DEFAULT_FREE_MINUTES, findInboxSuggestion, localMoment } from '../inboxReminders';
import { InboxSuggestionDialog } from '../components/InboxSuggestionDialog';
import { UpdateCard } from '../components/UpdateCard';
import { GuideCard } from '../components/GuideCard';
import { NicknameCard } from '../components/NicknameCard';
import { appVersion } from '../appVersion';
import { useRouter } from 'expo-router';
import { parseTime, parsePreferenceEnd, preferenceTime } from '../time';
import { Badge, Button, Card, Chip, Confirm, FieldTitle, Icon, Label } from '../components/ui';

export default function Me() {
  const router = useRouter();
  const { data, today, now, updateSettings, setNickname, notify, reset, saveStatus } = usePlanning();
  const { width } = useWindowDimensions();
  const [start, setStart] = useState(clock(data.settings.dayStart));
  const [end, setEnd] = useState(preferenceTime(data.settings.dayEnd));
  const [buffer, setBuffer] = useState(durationTime(data.settings.buffer));
  const [freeMinutes, setFreeMinutes] = useState(durationTime(data.settings.inboxReminderMinMinutes ?? DEFAULT_FREE_MINUTES));
  const [freeError, setFreeError] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [permissionPending, setPermissionPending] = useState(false);
  const [previewTask, setPreviewTask] = useState<string | null>(null);
  const availableSuggestion = findInboxSuggestion(data, localMoment(today, now));

  function save() {
    const dayStart = parseTime(start.trim() || clock(data.settings.dayStart));
    const dayEnd = dayStart === null ? null : parsePreferenceEnd(end.trim() || preferenceTime(data.settings.dayEnd), dayStart);
    const minutes = parseDuration(buffer);
    if (dayStart === null || dayEnd === null) { setError('请输入有效时间，结束最晚可到次日凌晨 6 点。'); return; }
    if (minutes === null || !Number.isInteger(minutes) || minutes < 0 || minutes > 60) { setError('切换缓冲应在 0–60 分钟之间。'); return; }
    setStart(clock(dayStart)); setEnd(preferenceTime(dayEnd));
    updateSettings({ ...data.settings, dayStart, dayEnd, buffer: minutes }); setError(''); notify('节奏已保存，后续排程会参考这些偏好。');
  }
  function saveFreeMinutes() {
    const minutes = parseDuration(freeMinutes);
    if (minutes === null || minutes < 30 || minutes > 120) { setFreeError('空闲时长应在 30 分钟至 2 小时之间。'); return; }
    updateSettings({ ...data.settings, inboxReminderMinMinutes: minutes });
    setFreeMinutes(durationTime(minutes)); setFreeError(''); notify('空闲提醒时长已保存。');
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

  return <><KeyboardFormScrollView contentContainerStyle={{ padding: width < 600 ? 20 : 38, paddingBottom: 45 }}><View style={{ maxWidth: 900, width: '100%', alignSelf: 'center' }}>
    <Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '700' }}>我的</Label><Label muted style={{ fontSize: 11, marginTop: 6, marginBottom: 27 }}>你的节奏、提醒和数据，都在这里。</Label>
    <GuideCard />
    <NicknameCard key={data.settings.nickname ?? ''} nickname={data.settings.nickname} onSave={name => { setNickname(name); notify(name ? '昵称已保存。' : '昵称已清除。'); }} />
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', gap: 9, alignItems: 'center' }}><Icon name="sun" size={18} color={c.purple} /><Label style={{ fontWeight: '600', fontSize: 14 }}>日程偏好</Label></View>
      <View style={{ flexDirection: width < 600 ? 'column' : 'row', gap: width < 600 ? 0 : 16 }}><View style={{ flex: width < 600 ? undefined : 1 }}><FieldTitle>从几点开始</FieldTitle><TimeField label="一天开始时间" value={start} onChangeText={setStart} fallback={data.settings.dayStart} /></View><View style={{ flex: width < 600 ? undefined : 1 }}><FieldTitle>希望几点结束</FieldTitle><TimeField label="一天结束时间" value={end} onChangeText={setEnd} mode="end" min={(parseTime(start) ?? data.settings.dayStart) + 1} max={1800} dayStart={parseTime(start) ?? data.settings.dayStart} fallback={data.settings.dayEnd} /></View></View>
      <Label muted style={{ fontSize: 11, marginTop: 10 }}>结束最晚可到次日凌晨 6 点。</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingTop: 12 }}>{['18:00', '22:00', '次日 02:00', '次日 06:00'].map(value => <Chip key={value} title={value} selected={end === value} onPress={() => { setEnd(value); setError(''); }} />)}</ScrollView>
      <FieldTitle>灵活任务之间，留多少时间切换</FieldTitle><TimeField label="任务切换缓冲" value={buffer} onChangeText={setBuffer} mode="duration" max={60} />
      <Label muted style={{ fontSize: 11, marginTop: 15 }}>只影响后续安排，不会自动移动已有日程。选择「保截止时间」时，可在预览中接受最多延后 60 分钟。</Label>
      {error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 13 }}>{error}</Label>}
      <Button title="保存我的节奏" icon="check" onPress={save} style={{ alignSelf: 'flex-start', marginTop: 20 }} />
    </Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="book-open" color={c.purple} /><View style={{ flex: 1 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>课表导入</Label><Label muted style={{ fontSize: 11, marginTop: 5 }}>哈尔滨工业大学（深圳）</Label></View><Button title="导入课表" icon="download" variant="secondary" small onPress={() => router.navigate('/course-import')} /></View></Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 }}><View style={{ flex: 1 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>日程提醒</Label><Label muted style={{ fontSize: 11, marginTop: 8 }}>{Platform.OS === 'web' ? '系统提醒需要在手机端使用，网页预览不发送通知。' : '在任务开始或顺手小事设定的时刻发送通知。示例不发送提醒。'}</Label></View><Button title={permissionPending ? '正在开启…' : data.settings.notificationsEnabled ? '关闭提醒' : '开启提醒'} icon="bell" variant="secondary" small disabled={permissionPending || Platform.OS === 'web'} onPress={toggleNotifications} /></View></Card>
    <Card style={{ marginBottom: 20 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>收集箱空闲提醒</Label>
      <Label muted style={{ fontSize: 11, marginTop: 8 }}>有较长连续空档时，问问要不要做一件待办。</Label>
      <Button title={permissionPending ? '正在开启…' : data.settings.inboxRemindersEnabled ? '关闭空闲提醒' : '开启空闲提醒'} icon="bell" variant="secondary" small disabled={permissionPending || Platform.OS === 'web'} onPress={toggleInboxReminders} style={{ alignSelf: 'flex-start', marginTop: 14 }} />
      <FieldTitle>连续空闲至少</FieldTitle><TimeField label="空闲提醒时长" value={freeMinutes} onChangeText={setFreeMinutes} mode="duration" min={30} max={120} fallback={DEFAULT_FREE_MINUTES} />
      {freeError && <Label accessibilityRole="alert" style={{ fontSize: 12, color: c.red, marginTop: 10 }}>{freeError}</Label>}
      <Button title="保存空闲时长" small variant="secondary" onPress={saveFreeMinutes} style={{ alignSelf: 'flex-start', marginTop: 12 }} />
      <Label muted style={{ fontSize: 11, marginTop: 13 }}>按偏好时段计算，每天最多一次。确认后才安排；暂不安排则暂停该待办 3 天。</Label>
      {Platform.OS === 'web' && <Label muted style={{ fontSize: 11, marginTop: 8 }}>系统通知仅在手机端发送。</Label>}
      <Button title="预览待办提醒" variant="ghost" small disabled={!availableSuggestion} onPress={() => setPreviewTask(availableSuggestion?.taskId ?? null)} style={{ alignSelf: 'flex-start', marginTop: 14 }} />
      {!availableSuggestion && <Label muted style={{ fontSize: 11, marginTop: 8 }}>当前没有可推荐的待办或足够长的空档。</Label>}
    </Card>
    <Card style={{ marginBottom: 20 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name="hard-drive" size={18} color={c.green} /><Label style={{ fontSize: 14, fontWeight: '600' }}>数据留在你这里</Label><Badge title={saveStatus === 'saved' ? '本地保存' : saveStatus === 'saving' ? '保存中' : '保存失败'} tone={saveStatus === 'error' ? 'orange' : 'green'} /></View>
      <Label muted style={{ fontSize: 11, marginTop: 12 }}>当前版本无需账号。{Platform.OS === 'web' ? '数据保存在这个浏览器中，清除站点数据会删除记录。' : '数据保存在这台设备上，卸载应用会删除记录。'}跨设备同步尚未接入。</Label>
      <Button title="导出数据备份" icon="download" variant="secondary" small onPress={exportData} style={{ alignSelf: 'flex-start', marginTop: 17 }} />
    </Card>
    <Card style={{ marginBottom: 25 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>重新开始</Label><Label muted style={{ fontSize: 11, marginTop: 9 }}>清空任务会移除当前日程与调整记录，请先导出需要保留的数据。</Label><Button title="清空，开始我的一天" icon="sunrise" variant="ghost" small onPress={() => setConfirm(true)} style={{ alignSelf: 'flex-start', marginTop: 17 }} /></Card>
    <UpdateCard />
    <Label muted style={{ textAlign: 'center', fontSize: 10 }}>留白 {appVersion} · 给今天留一点余地</Label>
  </View></KeyboardFormScrollView><Confirm visible={confirm} title="清空并重新开始？" description="当前所有任务和调整记录都将被移除，日程偏好和提醒设置会保留。请确认已经导出需要保留的数据。" action="确认清空" onClose={() => setConfirm(false)} onConfirm={() => { reset(); setError(''); setConfirm(false); }} /><InboxSuggestionDialog taskId={previewTask} preview onClose={() => setPreviewTask(null)} /></>;
}
