import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { openURL } from 'expo-linking';
import { androidBuild, appVersion } from '../appVersion';
import { compareRelease, fetchPublishedRelease, isReleaseDownloadUrl, type PublishedRelease, UpdateError } from '../updates';
import { colors as c } from '../theme';
import { Badge, Button, Card, Icon, Label } from './ui';

type CheckState = { kind: 'idle' | 'checking' } | { kind: 'ready'; release: PublishedRelease } | { kind: 'error'; message: string };

export function UpdateCard() {
  const [state, setState] = useState<CheckState>({ kind: 'idle' });
  const [opening, setOpening] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  async function check() {
    if (request.current || opening) return;
    const controller = new AbortController(); request.current = controller;
    setState({ kind: 'checking' }); setDownloadError('');
    try {
      const release = await fetchPublishedRelease({ signal: controller.signal });
      compareRelease(release, appVersion, androidBuild);
      if (!controller.signal.aborted) setState({ kind: 'ready', release });
    } catch (error) {
      if (!controller.signal.aborted) setState({ kind: 'error', message: error instanceof UpdateError ? error.message : '检查失败，请稍后重试。' });
    } finally { if (request.current === controller) request.current = null; }
  }
  async function download(release: PublishedRelease) {
    if (opening || !isReleaseDownloadUrl(release.downloadUrl)) return;
    setOpening(true); setDownloadError('');
    try { await openURL(release.downloadUrl); }
    catch { if (mounted.current) setDownloadError('无法打开下载链接，请稍后重试。'); }
    finally { if (mounted.current) setOpening(false); }
  }
  const release = state.kind === 'ready' ? state.release : null;
  const status = release ? compareRelease(release, appVersion, androidBuild) : null;
  const canDownload = !!release && (Platform.OS === 'web' || Platform.OS === 'android' && status === 'available');
  return <Card style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Icon name="refresh-cw" color={c.purple} size={18} /><Label style={{ fontSize: 14, fontWeight: '600' }}>应用更新</Label></View>
    <Label muted style={{ fontSize: 11, marginTop: 10 }}>{Platform.OS === 'web' ? '当前预览版本' : '当前版本'} {appVersion}{Platform.OS === 'android' && androidBuild ? ` (${androidBuild})` : ''}</Label>
    {release && <View style={{ marginTop: 14, alignItems: 'flex-start', gap: 9 }}>
      <Badge title={Platform.OS !== 'android' ? `最新安卓版本 ${release.version}` : status === 'available' ? `发现新版本 ${release.version}` : status === 'current' ? '已是最新版本' : '当前版本高于已发布版本'} tone={status === 'available' ? 'purple' : 'neutral'} />
      <Label muted style={{ fontSize: 11 }}>Android {release.version} · {(release.sizeBytes / 1024 / 1024).toFixed(1)} MB</Label>
      {release.notes && <Label style={{ fontSize: 12, lineHeight: 20 }}>{release.notes}</Label>}
    </View>}
    {state.kind === 'error' && <Label accessibilityRole="alert" style={{ fontSize: 12, color: c.red, marginTop: 13 }}>{state.message}</Label>}
    {downloadError && <Label accessibilityRole="alert" style={{ fontSize: 12, color: c.red, marginTop: 13 }}>{downloadError}</Label>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 }}>
      <Button title={state.kind === 'checking' ? '正在检查…' : state.kind === 'error' ? '重新检查' : '检查更新'} icon="refresh-cw" variant="secondary" small disabled={state.kind === 'checking' || opening} onPress={check} />
      {canDownload && release && <Button title={opening ? '正在打开…' : Platform.OS === 'web' ? '下载安卓安装包' : '下载更新'} icon="download" small disabled={opening} onPress={() => download(release)} />}
    </View>
    {canDownload && <Label muted style={{ fontSize: 11, marginTop: 11 }}>通过浏览器下载，完成后按系统提示安装。</Label>}
    {Platform.OS === 'ios' && <Label muted style={{ fontSize: 11, marginTop: 11 }}>当前提供 Android 安装包。</Label>}
  </Card>;
}
