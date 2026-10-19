import React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { dateKey } from '../utils';
import { Badge, Icon, Label } from '../components/ui';

export default function Explore() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data, today } = usePlanning();
  const compact = width < 600;
  const inboxCount = data.tasks.filter(task => !task.completed && task.date === null).length;
  const completedToday = data.tasks.filter(task => task.completed && task.completedAt && dateKey(new Date(task.completedAt)) === today).length;
  const entries = [
    { path: '/inbox' as const, title: '收集箱', icon: 'inbox' as const, description: '随手记下想法，准备好再安排。', detail: inboxCount ? `${inboxCount} 件事待安排` : '给想法留个位置', color: c.purple, background: c.lavender, tone: 'purple' as const },
    { path: '/review' as const, title: '回顾', icon: 'bar-chart-2' as const, description: '看看完成的事，找回每一次调整。', detail: `今天完成 ${completedToday} 件事`, color: c.green, background: c.greenBg, tone: 'green' as const },
  ];

  return <ScrollView contentContainerStyle={{ padding: compact ? 20 : 38, paddingBottom: 45 }}>
    <View style={{ maxWidth: 900, width: '100%', alignSelf: 'center' }}>
      <Label style={{ fontSize: 28, lineHeight: 38, fontWeight: '700' }}>探索</Label>
      <Label muted style={{ fontSize: 11, marginTop: 6, marginBottom: 27 }}>收好想做的事，也看见走过的路。</Label>
      <View style={{ flexDirection: compact ? 'column' : 'row', gap: 16 }}>
        {entries.map(entry => <Pressable key={entry.path} accessibilityRole="link" accessibilityLabel={entry.title} onPress={() => router.navigate(entry.path)}
          style={({ pressed }) => ({ flex: compact ? undefined : 1, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: compact ? 22 : 27, backgroundColor: pressed ? entry.background : c.surface })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
            <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: entry.background, alignItems: 'center', justifyContent: 'center' }}><Icon name={entry.icon} size={23} color={entry.color} /></View>
            <Icon name="arrow-up-right" size={20} color={c.faint} />
          </View>
          <Label style={{ fontSize: 20, lineHeight: 28, fontWeight: '600' }}>{entry.title}</Label>
          <Label muted style={{ fontSize: 12, marginTop: 8, marginBottom: 24 }}>{entry.description}</Label>
          <View style={{ alignSelf: 'flex-start' }}><Badge title={entry.detail} tone={entry.tone} /></View>
        </Pressable>)}
      </View>
    </View>
  </ScrollView>;
}
