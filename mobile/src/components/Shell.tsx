import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors as c } from '../theme';
import { usePlanning } from '../store';
import { Button, Card, Icon, Label, type IconName } from './ui';
import { KeyboardFrame } from './KeyboardForm';

const links = [
  { path: '/' as const, title: '今天', icon: 'sun' as IconName },
  { path: '/week' as const, title: '周览', icon: 'calendar' as IconName },
  { path: '/explore' as const, title: '探索', icon: 'compass' as IconName },
  { path: '/me' as const, title: '我的', icon: 'user' as IconName },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const path = usePathname();
  const router = useRouter();
  const inset = useSafeAreaInsets();
  const { data, loading, loadError, reload, saveStatus, toast } = usePlanning();
  const exploreChild = path === '/inbox' ? '收集箱' : path === '/review' ? '回顾' : null;
  const activePath = exploreChild ? '/explore' : path === '/settings' || path === '/course-import' ? '/me' : path;
  const current = links.find(link => link.path === activePath) ?? links[0];
  const inboxCount = data.tasks.filter(task => !task.completed && task.date === null).length;
  if (loading || loadError) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
    {loading ? <><ActivityIndicator color={c.purple} /><Label muted style={{ marginTop: 16 }}>给今天留一点余地…</Label></>
      : <Card style={{ maxWidth: 440, gap: 18 }}><Icon name="alert-circle" color={c.orange} size={28} /><Label>{loadError}</Label><Button title="重新读取" onPress={reload} /></Card>}
  </View>;

  return <KeyboardFrame><View style={{ flex: 1, backgroundColor: c.bg, paddingTop: inset.top }}>
    <View style={{ flex: 1, flexDirection: 'row' }}>
      {wide && <View style={styles.sidebar}>
        <View style={{ flexDirection: 'row', gap: 11, alignItems: 'center', marginBottom: 48, paddingLeft: 12 }}>
          <BrandMark /><View><Label style={{ fontWeight: '700', fontSize: 23, letterSpacing: 3, lineHeight: 30 }}>留白</Label><Label muted style={{ fontSize: 9, letterSpacing: 2, lineHeight: 15 }}>LIUBAI PLANNER</Label></View>
        </View>
        <Label muted style={{ fontSize: 10, letterSpacing: 1.6, marginLeft: 16, marginBottom: 12 }}>我的空间</Label>
        {links.filter(link => link.path !== '/me').map(link => <Pressable accessibilityRole="link" accessibilityLabel={link.title} accessibilityState={{ selected: current.path === link.path }} key={link.path} onPress={() => router.navigate(link.path)}
          style={[styles.nav, { backgroundColor: current.path === link.path ? c.lavender : 'transparent' }]}>
          <Icon name={link.icon} color={current.path === link.path ? c.purple : c.muted} size={19} />
          <Label style={{ color: current.path === link.path ? c.purpleDark : c.muted, fontWeight: current.path === link.path ? '600' : '400', flex: 1, fontSize: 13 }}>{link.title}</Label>
          {link.path === '/explore' && inboxCount > 0 && <View style={{ backgroundColor: '#EEEFF3', paddingHorizontal: 6, borderRadius: 5 }}><Label muted style={{ fontSize: 10 }}>{inboxCount}</Label></View>}
        </Pressable>)}
        <View style={{ flex: 1 }} />
        <View style={{ backgroundColor: '#F8F7FB', padding: 17, borderRadius: 13, margin: 6, marginBottom: 24 }}>
          <Icon name="feather" size={20} color={c.purple} /><Label style={{ fontSize: 12, marginTop: 10, lineHeight: 22, color: '#79718D' }}>留一点空白，{`\n`}让变化也有位置。</Label>
        </View>
        <Pressable accessibilityRole="link" accessibilityLabel="我的" accessibilityState={{ selected: current.path === '/me' }} onPress={() => router.navigate('/me')} style={[styles.nav, current.path === '/me' && { backgroundColor: c.lavender }]}><Icon name="user" size={19} color={current.path === '/me' ? c.purple : c.muted} /><Label style={{ fontSize: 13, color: current.path === '/me' ? c.purpleDark : c.muted, fontWeight: current.path === '/me' ? '600' : '400' }}>我的</Label></Pressable>
        <View style={{ borderTopWidth: 1, borderTopColor: c.border, marginTop: 14, paddingTop: 22, paddingHorizontal: 13, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: saveStatus === 'error' ? c.red : saveStatus === 'saving' ? c.orange : c.green }} />
          <Label muted style={{ fontSize: 10 }}>{saveStatus === 'error' ? '本地保存失败' : saveStatus === 'saving' ? '正在保存…' : '已保存在此设备'}</Label>
        </View>
      </View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        {path !== '/week' && <View style={[styles.topbar, { paddingHorizontal: wide ? 40 : 22 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            {exploreChild ? <><Pressable accessibilityRole="link" accessibilityLabel="返回探索" onPress={() => router.navigate('/explore')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}><Icon name="arrow-left" size={15} color={c.purple} /><Label style={{ fontSize: 11, color: c.purple }}>探索</Label></Pressable><Icon name="chevron-right" size={12} color={c.faint} /><Label style={{ fontSize: 11 }}>{exploreChild}</Label></>
              : <>{!wide && <BrandMark small />}<Label muted style={{ fontSize: 11 }}>{wide ? '我的空间' : '留白'}</Label><Icon name="chevron-right" size={12} color={c.faint} /><Label style={{ fontSize: 11 }}>{current.title}</Label></>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Icon name={data.demo ? 'eye' : 'hard-drive'} size={13} color={c.green} /><Label muted style={{ fontSize: 10 }}>{data.demo ? '示例体验' : '本地模式'}{!wide && saveStatus === 'error' ? ' · 保存失败' : ''}</Label></View>
        </View>}
        <View style={{ flex: 1 }}>{children}</View>
        {!wide && <View style={{ backgroundColor: '#fff', flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, paddingBottom: Math.max(inset.bottom, 8), paddingTop: 10 }}>
          {links.map(link => <Pressable key={link.path} accessibilityRole="link" accessibilityLabel={link.title} accessibilityState={{ selected: current.path === link.path }} onPress={() => router.navigate(link.path)} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 3 }}>
            <Icon name={link.icon} size={20} color={current.path === link.path ? c.purple : c.faint} /><Label style={{ fontSize: 10, lineHeight: 18, color: current.path === link.path ? c.purple : c.muted }}>{link.title}</Label>
          </Pressable>)}
        </View>}
      </View>
    </View>
    {toast && <View pointerEvents="none" style={{ position: 'absolute', left: wide ? 240 : 16, right: 16, bottom: wide ? 30 : 95, alignItems: 'center', zIndex: 100 }}>
      <View accessibilityRole="alert" style={{ backgroundColor: '#343043', paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, maxWidth: 560, flexDirection: 'row', gap: 9, alignItems: 'center', boxShadow: '0px 6px 24px rgba(0,0,0,0.12)' }}><Icon name="info" size={16} color="#D7CCF6" /><Label style={{ color: '#fff', fontSize: 12, flexShrink: 1 }}>{toast}</Label></View>
    </View>}
  </View></KeyboardFrame>;
}

export function BrandMark({ small }: { small?: boolean }) {
  return <View style={{ width: small ? 26 : 40, height: small ? 26 : 40, backgroundColor: c.purple, borderRadius: small ? 8 : 12, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: small ? 13 : 20, height: small ? 14 : 22, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#fff', borderBottomLeftRadius: 2 }}>
      <View style={{ width: small ? 6 : 9, height: small ? 7 : 11, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: '#fff', position: 'absolute', left: small ? 4 : 6, top: small ? 1 : 2 }} />
      <View style={{ width: 4, height: 4, borderRadius: 3, backgroundColor: '#D5C8F8', position: 'absolute', right: -1, top: 0 }} />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  sidebar: { width: 218, backgroundColor: '#fff', padding: 18, paddingTop: 35, borderRightWidth: 1, borderRightColor: c.border },
  nav: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 11, alignItems: 'center', marginBottom: 6 },
  topbar: { height: 65, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: 'rgba(255,255,255,0.65)' },
});
