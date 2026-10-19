import React from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { EmptyState } from '../components/ui';

export default function NotFound() {
  const router = useRouter();
  return <View style={{ flex: 1, justifyContent: 'center' }}><EmptyState title="这里还没有安排" description="这个页面不存在，回到今天继续吧。" action="回到今天" onPress={() => router.replace('/')} /></View>;
}
