import React from 'react';
import { View } from 'react-native';
import { GUIDE_REVISION } from '../guide';
import { useGuide } from '../guideStore';
import { colors as c } from '../theme';
import { Badge, Button, Card, Icon, Label } from './ui';

export function GuideCard() {
  const guide = useGuide(), complete = guide.progress.completedRevision >= GUIDE_REVISION;
  return <Card style={{ marginBottom: 20 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}><Icon name="book-open" color={c.purple} size={18} /><Label style={{ fontWeight: '600', fontSize: 14 }}>新手指引</Label>
      {guide.ready && <Badge title={complete ? '已完成' : guide.progress.completedRevision > 0 ? '内容有更新' : '未完成'} tone={complete ? 'green' : 'neutral'} />}
    </View>
    <Label muted style={{ marginTop: 9, fontSize: 11 }}>核心操作与手机权限，随时回来查看。</Label>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 }}>
      <Button title={!guide.ready ? '正在读取…' : complete ? '重看新手教程' : '继续新手教程'} variant="secondary" small disabled={!guide.ready} onPress={() => guide.open()} />
      <Button title="通知与后台设置" variant="ghost" small disabled={!guide.ready} onPress={() => guide.open('permissions')} />
    </View>
    {guide.saveError && <View style={{ marginTop: 10 }}><Label accessibilityRole="alert" style={{ fontSize: 11, color: c.orange }}>教程进度暂未保存。</Label><Button title="重试保存进度" variant="ghost" small onPress={guide.retry} /></View>}
  </Card>;
}
