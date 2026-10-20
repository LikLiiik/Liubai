import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, type TextProps } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { colors as c, font } from '../theme';
import { KeyboardFormScrollView, KeyboardFrame } from './KeyboardForm';

export type IconName = React.ComponentProps<typeof Feather>['name'];
export function Icon({ name, size = 18, color = c.muted }: { name: IconName; size?: number; color?: string }) {
  return <Feather name={name} size={size} color={color} />;
}
export function Label({ children, style, muted = false, ...props }: TextProps & { muted?: boolean }) {
  return <Text {...props} style={[{ fontFamily: font, color: muted ? c.muted : c.text, fontSize: 14, lineHeight: 22 }, style]}>{children}</Text>;
}
export function Button({ title, onPress, icon, variant = 'primary', small, disabled, style, testID }: {
  title: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  small?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const foreground = variant === 'primary' ? '#fff' : variant === 'danger' ? c.red : variant === 'secondary' ? c.purpleDark : c.muted;
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }}
    testID={testID} onPress={onPress} disabled={disabled} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}
    style={({ pressed }) => [{ minHeight: small ? 36 : 44, paddingHorizontal: small ? 12 : 18, borderRadius: 11,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: variant === 'primary' ? (hovered ? c.purpleDark : c.purple) : variant === 'secondary' ? c.lavender : variant === 'danger' ? c.redBg : hovered ? '#F0F0F5' : 'transparent',
      opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}>
    {icon && <Icon name={icon} size={small ? 15 : 17} color={foreground} />}
    <Label style={{ color: foreground, fontSize: small ? 12 : 13, fontWeight: '600' }}>{title}</Label>
  </Pressable>;
}
export function Chip({ title, selected, onPress, icon }: { title: string; selected?: boolean; onPress?: () => void; icon?: IconName }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ selected: !!selected }} onPress={onPress}
    style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1,
      borderColor: selected ? '#C5B7EE' : c.border, backgroundColor: selected ? c.lavender : '#fff', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
    {icon && <Icon name={icon} size={14} color={selected ? c.purple : c.muted} />}
    <Label style={{ fontSize: 12, color: selected ? c.purpleDark : c.muted, fontWeight: selected ? '600' : '400' }}>{title}</Label>
  </Pressable>;
}
export function Badge({ title, tone = 'purple', icon }: { title: string; tone?: 'purple' | 'green' | 'orange' | 'neutral'; icon?: IconName }) {
  const tones = { purple: [c.lavender, c.purple], green: [c.greenBg, c.green], orange: [c.orangeBg, c.orange], neutral: ['#F1F2F5', c.muted] };
  return <View style={{ backgroundColor: tones[tone][0], paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    {icon && <Icon name={icon} size={10} color={tones[tone][1]} />}<Label style={{ fontSize: 10, lineHeight: 18, color: tones[tone][1] }}>{title}</Label>
  </View>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 17, padding: 22 }, style]}>{children}</View>;
}
export function FieldTitle({ children }: { children: React.ReactNode }) {
  return <Label style={{ fontSize: 12, fontWeight: '600', marginBottom: 9, marginTop: 20 }}>{children}</Label>;
}
export function Dialog({ visible, title, subtitle, onClose, children, wide = false, footer, scrollEnabled = true }: {
  visible: boolean; title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode; scrollEnabled?: boolean;
}) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardFrame><View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭弹窗" />
      <View accessibilityViewIsModal style={[styles.dialog, { maxWidth: wide ? 760 : 510 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', padding: 24, paddingBottom: 18 }}>
          <View style={{ flex: 1 }}><Label style={{ fontSize: 22, fontWeight: '700', lineHeight: 30 }}>{title}</Label>{subtitle && <Label muted style={{ fontSize: 12, marginTop: 7 }}>{subtitle}</Label>}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭" onPress={onClose} style={{ padding: 6, marginLeft: 10 }}><Icon name="x" size={21} /></Pressable>
        </View>
        <KeyboardFormScrollView scrollEnabled={scrollEnabled} style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}>{children}</KeyboardFormScrollView>
        {footer && <View style={{ padding: 20, borderTopWidth: 1, borderTopColor: c.border }}>{footer}</View>}
      </View>
    </View></KeyboardFrame>
  </Modal>;
}
export function Confirm({ visible, title, description, action, onConfirm, onClose }: { visible: boolean; title: string; description: string; action: string; onConfirm: () => void; onClose: () => void }) {
  return <Dialog visible={visible} title={title} onClose={onClose} footer={<View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
    <Button title="取消" variant="ghost" onPress={onClose} /><Button title={action} onPress={onConfirm} />
  </View>}><Label muted>{description}</Label></Dialog>;
}
export function EmptyState({ title, description, action, onPress }: { title: string; description: string; action?: string; onPress?: () => void }) {
  return <View style={{ alignItems: 'center', paddingVertical: 46, paddingHorizontal: 15, gap: 12 }}>
    <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: c.lavender, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}><Icon name="sun" size={27} color={c.purple} /></View>
    <Label style={{ fontWeight: '600', fontSize: 16 }}>{title}</Label><Label muted style={{ textAlign: 'center', fontSize: 12, maxWidth: 300 }}>{description}</Label>
    {action && onPress && <Button title={action} onPress={onPress} variant="secondary" small style={{ marginTop: 8 }} />}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(28, 25, 45, 0.35)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { backgroundColor: '#fff', borderRadius: 22, width: '100%', maxHeight: '92%', flexShrink: 1, overflow: 'hidden', boxShadow: '0px 20px 80px rgba(25,20,50,0.18)' },
});
