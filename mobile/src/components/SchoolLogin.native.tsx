import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { buildSchoolReadScript, HITSZ_ENTRY, HITSZ_HELP, schoolUrlAllowed, type SchoolLoginProps, type SchoolRead } from '../hitsz';
import { colors as c } from '../theme';
import { Button, Label } from './ui';

export function SchoolLogin({ visible, request, onRead, onClose }: SchoolLoginProps) {
  const web = useRef<WebView<object>>(null);
  const pending = useRef<string | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [url, setUrl] = useState(HITSZ_ENTRY);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [back, setBack] = useState(false);
  const insets = useSafeAreaInsets();
  function clearRead() {
    pending.current = null; setReading(false);
    if (watchdog.current) clearTimeout(watchdog.current);
  }
  function close() { clearRead(); setError(''); setLoading(false); onClose(); }
  useEffect(() => {
    if (!visible) { pending.current = null; if (watchdog.current) clearTimeout(watchdog.current); }
    return () => { if (watchdog.current) clearTimeout(watchdog.current); };
  }, [visible]);
  function read() {
    if (new URL(url).hostname !== 'jw.hitsz.edu.cn') { setError('请先进入教务系统的个人课表。校外访问可能需要安校通客户端。'); return; }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    pending.current = id; setReading(true); setError('');
    watchdog.current = setTimeout(() => { clearRead(); setError('读取未完成，请确认教务页面已加载并重试。'); }, 65000);
    web.current?.injectJavaScript(buildSchoolReadScript(request, id));
  }
  return <Modal visible={visible} animationType="slide" onRequestClose={close}>
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Button title="返回" small variant="ghost" onPress={close} />
        <View style={{ flex: 1 }}><Label style={{ fontWeight: '600' }}>哈工大（深圳）教务</Label><Label muted style={{ fontSize: 10 }}>{new URL(url).hostname}</Label></View>
        <Button title="刷新" small variant="ghost" disabled={reading} onPress={() => { setError(''); web.current?.reload(); }} />
      </View>
      <View style={{ paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Button title="网页后退" variant="ghost" small disabled={!back || reading} onPress={() => web.current?.goBack()} />
        <Button title="校外访问说明" variant="ghost" small onPress={() => { void Linking.openURL(HITSZ_HELP).catch(() => setError('无法打开访问说明。')); }} />
      </View>
      {!!error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, paddingHorizontal: 18, paddingBottom: 12 }}>{error}</Label>}
      {loading && <ActivityIndicator color={c.purple} style={{ paddingBottom: 8 }} />}
      {visible && <WebView<object> ref={web} source={{ uri: HITSZ_ENTRY }} style={{ flex: 1 }}
        userAgent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
        originWhitelist={['http://*', 'https://*']} mixedContentMode="never" incognito saveFormDataDisabled
        sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} setSupportMultipleWindows={false}
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false}
        onShouldStartLoadWithRequest={navigation => {
          if (schoolUrlAllowed(navigation.url)) return true;
          setError('该页面不在已适配的学校域名内。请返回教务入口。'); return false;
        }}
        onNavigationStateChange={state => { if (schoolUrlAllowed(state.url)) setUrl(state.url); setBack(state.canGoBack); }}
        onLoadStart={() => setLoading(true)} onLoadEnd={() => setLoading(false)}
        onError={() => { setLoading(false); clearRead(); setError('教务页面加载失败，请检查校园网络或安校通连接。'); }}
        onHttpError={() => { setLoading(false); clearRead(); setError('教务服务暂不可用，请稍后重试。'); }}
        onMessage={event => {
          if (!pending.current || !schoolUrlAllowed(event.nativeEvent.url) || new URL(event.nativeEvent.url).hostname !== 'jw.hitsz.edu.cn') return;
          try {
            if (event.nativeEvent.data.length > 2000000) throw new Error();
            const message = JSON.parse(event.nativeEvent.data);
            if (message.requestId !== pending.current) return;
            clearRead();
            if (message.ok !== true) { setError(typeof message.error === 'string' ? message.error.slice(0, 200) : '读取失败，请重试。'); return; }
            const value = message.data as SchoolRead;
            if (!value || value.year !== request.year || value.term !== request.term || typeof value.monday !== 'string' || !Array.isArray(value.rows)) throw new Error();
            onRead(value);
          } catch { clearRead(); setError('读取结果无法识别，请重新打开个人课表。'); }
        }} />}
      <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: c.border }}>
        <Label muted style={{ fontSize: 11, marginBottom: 9 }}>{request.year} · 第 {request.term} 学期 · 登录后进入个人课表再读取</Label>
        <Button title={reading ? '正在读取…' : '读取课表'} icon="download" disabled={reading || loading} onPress={read} />
      </View>
    </View>
  </Modal>;
}
