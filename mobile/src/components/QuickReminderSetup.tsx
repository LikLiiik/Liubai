import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { enableNotifications, getNotificationAccess } from '../notifications';
import { usePlanning } from '../store';
import type { NotificationAccess } from '../types';
import { colors as c } from '../theme';
import { Button, Icon, Label } from './ui';

export function QuickReminderSetup() {
  const { data, updateSettings } = usePlanning();
  const [access, setAccess] = useState<NotificationAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const awaitingSettings = useRef(false), pending = useRef(false);
  const latestSettings = useRef(data.settings);
  useEffect(() => { latestSettings.current = data.settings; }, [data.settings]);
  useEffect(() => {
    let active = true;
    const inspect = () => getNotificationAccess().then(value => {
      if (!active) return;
      setAccess(value);
      if (awaitingSettings.current && value.status === 'granted') updateSettings({ ...latestSettings.current, notificationsEnabled: true });
      awaitingSettings.current = false;
    }).catch(() => {});
    void inspect();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void inspect(); });
    return () => { active = false; listener.remove(); };
  }, [updateSettings]);
  const enabled = data.settings.notificationsEnabled && access?.status === 'granted';
  const needsSettings = access?.status === 'denied' && !access.canAskAgain;
  async function enable() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true); setError('');
    try {
      if (needsSettings) { awaitingSettings.current = true; await Linking.openSettings(); return; }
      const granted = await enableNotifications();
      setAccess(await getNotificationAccess());
      if (granted) updateSettings({ ...latestSettings.current, notificationsEnabled: true });
      else setError('通知权限未开启，可稍后在“我的”中设置。');
    } catch { setError('暂时无法开启提醒，请在“我的”中重试。'); }
    finally { pending.current = false; setBusy(false); }
  }
  return <View style={{ marginTop: 18, padding: 12, backgroundColor: c.bg, borderRadius: 10, gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name="bell" size={14} color={c.purple} />
      <Label muted style={{ fontSize: 12, flex: 1 }}>{Platform.OS === 'web' ? '手机通知需在安装后开启。' : enabled ? '将在设定时刻发送通知。' : '开启日程提醒后，才能收到小事通知。'}</Label></View>
    {Platform.OS !== 'web' && !enabled && <Button title={busy ? '正在处理…' : needsSettings ? '打开通知设置' : '开启提醒'} variant="secondary" small disabled={busy} onPress={() => void enable()} style={{ alignSelf: 'flex-start' }} />}
    {!!error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 11 }}>{error}</Label>}
  </View>;
}
