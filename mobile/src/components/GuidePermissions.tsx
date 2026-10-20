import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Switch, View } from 'react-native';
import { openSettings } from 'expo-linking';
import { enableNotifications, getNotificationAccess } from '../notifications';
import { usePlanning } from '../store';
import { setupGuideReminders } from '../guidePermissions';
import type { NotificationAccess } from '../types';
import { colors as c } from '../theme';
import { Badge, Button, Label } from './ui';

export function GuidePermissions() {
  const { data, updateSettings } = usePlanning();
  const [tasks, setTasks] = useState(data.settings.notificationsEnabled ?? true);
  const [inbox, setInbox] = useState(data.settings.inboxRemindersEnabled ?? true);
  const [access, setAccess] = useState<NotificationAccess | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const alive = useRef(true), pending = useRef(false), awaitingSettings = useRef(false), generation = useRef(0);
  const latest = useRef({ settings: data.settings, tasks, inbox });
  useEffect(() => { latest.current = { settings: data.settings, tasks, inbox }; }, [data.settings, tasks, inbox]);
  const applyChoices = useCallback(() => {
    const current = latest.current;
    updateSettings({ ...current.settings, notificationsEnabled: current.tasks, inboxRemindersEnabled: current.inbox });
    setMessage(current.tasks || current.inbox ? '所选提醒已开启。' : '已关闭这两类提醒。');
    setError('');
  }, [updateSettings]);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    try {
      const next = await getNotificationAccess();
      if (!alive.current || request !== generation.current) return;
      setAccess(next); setError('');
      if (awaitingSettings.current && next.status === 'granted') { awaitingSettings.current = false; applyChoices(); }
    } catch { if (alive.current && request === generation.current) setError('无法读取通知权限，请重试。'); }
  }, [applyChoices]);
  useEffect(() => {
    alive.current = true; void Promise.resolve().then(refresh);
    const listener = Platform.OS !== 'web' ? AppState.addEventListener('change', state => { if (state === 'active') void refresh(); }) : null;
    return () => { alive.current = false; listener?.remove(); };
  }, [refresh]);
  async function settings() {
    if (pending.current || Platform.OS === 'web') return;
    pending.current = true; setBusy(true); setError('');
    try { awaitingSettings.current = false; await openSettings(); }
    catch { awaitingSettings.current = false; if (alive.current) setError('无法打开系统设置，请手动进入手机设置中的留白。'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  async function enable() {
    if (pending.current || Platform.OS === 'web') return;
    if (!access && (tasks || inbox)) { await refresh(); return; }
    pending.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = await setupGuideReminders(latest.current, {
        inspect: getNotificationAccess, request: enableNotifications,
        settings: async () => { awaitingSettings.current = true; await openSettings(); },
      });
      if (!alive.current) return;
      if (result.access && (result.action !== 'settings' || awaitingSettings.current)) setAccess(result.access);
      if (result.action === 'enabled' || result.action === 'disabled') applyChoices();
      else if (result.action === 'settings') { if (awaitingSettings.current) setMessage('返回应用后会重新检查通知权限。'); }
      else setMessage('通知尚未开启，可以稍后再设置。');
    } catch { awaitingSettings.current = false; if (alive.current) setError('暂时无法开启通知，请重试或前往系统设置。'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  const unsupported = Platform.OS === 'web';
  const status = unsupported ? '请在手机端设置权限' : !access ? error ? '通知权限暂不可用' : '正在读取通知权限…' : access.status === 'granted' ? '系统已允许通知' : access.status === 'denied' ? '系统尚未允许通知' : '尚未开启通知权限';
  const button = !tasks && !inbox ? '保存为关闭' : !access ? '重新读取权限' : access.status === 'granted' ? '保存提醒选择' : !access.canAskAgain ? '前往设置允许通知' : '允许通知并开启所选提醒';
  return <View style={{ marginTop: 20, borderRadius: 14, padding: 17, borderWidth: 1, borderColor: c.border, gap: 13 }}>
    <View style={{ alignSelf: 'flex-start' }}><Badge title={status} tone={access?.status === 'granted' ? 'green' : 'neutral'} /></View>
    {([['日程开始提醒', '在任务开始时提醒', tasks, setTasks], ['收集箱空闲提醒', '有较长空档时推荐待办', inbox, setInbox]] as const).map(([title, detail, value, change]) => <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1 }}><Label style={{ fontSize: 13, fontWeight: '600' }}>{title}</Label><Label muted style={{ fontSize: 11 }}>{detail}</Label></View>
      <Switch accessibilityLabel={`教程：${title}`} value={value} disabled={unsupported || busy} onValueChange={change} trackColor={{ false: '#E3E1E9', true: '#C6B7EC' }} thumbColor={value ? c.purple : '#fff'} />
    </View>)}
    {unsupported ? <Label muted style={{ fontSize: 12 }}>网页不申请手机权限，安装手机版后可在这里开启通知。</Label>
      : <Button title={busy ? '正在处理…' : button} icon="bell" small disabled={busy} onPress={enable} style={{ alignSelf: 'flex-start' }} />}
    {message && <Label accessibilityLiveRegion="polite" style={{ fontSize: 12, color: c.green }}>{message}</Label>}
    {error && <Label accessibilityRole="alert" style={{ fontSize: 12, color: c.red }}>{error}</Label>}
    {data.demo && <Label muted style={{ fontSize: 11 }}>示例模式不发送通知，开始记录真实任务后生效。</Label>}
    {Platform.OS === 'android' && <View style={{ borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}>
      <Label style={{ fontSize: 12, fontWeight: '600' }}>锁屏后收不到提醒？</Label>
      <Label muted style={{ fontSize: 11, marginTop: 4 }}>在系统设置中检查留白的通知、后台运行和电池管理选项。各品牌手机的名称可能不同，按需调整。</Label>
      <Button title="打开应用设置" variant="ghost" small onPress={() => settings()} disabled={busy} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
    </View>}
  </View>;
}
