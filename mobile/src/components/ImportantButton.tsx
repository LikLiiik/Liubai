import React from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { colors as c } from '../theme';
import { Label } from './ui';

export function ImportantButton({ title, important, onPress, size = 34, disabled = false, style }: {
  title: string; important: boolean; onPress: () => void; size?: number; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${important ? '取消重点' : '设为重点'}：${title}`}
    accessibilityState={{ selected: important, disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [{ width: size, height: size, borderRadius: Math.min(9, size / 3), alignItems: 'center', justifyContent: 'center',
      backgroundColor: important ? c.orangeBg : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }, style]}>
    <Label accessible={false} style={{ fontSize: size >= 30 ? 24 : size - 2, lineHeight: size, color: important ? c.orange : c.muted }}>{important ? '★' : '☆'}</Label>
  </Pressable>;
}
