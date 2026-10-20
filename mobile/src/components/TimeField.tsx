import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors as c, font } from '../theme';
import { changePickerHour, formatTimeInput, pickerHours, pickerMinutes, readTimeInput, readWheelNumber, type TimeInputMode } from '../timePicker';
import { Icon, Label } from './ui';

const ROW = 40;
function WheelNumber({ values, value, label, clockHour, epoch, onChange }: { values: number[]; value: number; label: string; clockHour?: boolean; epoch: number; onChange: (value: number) => void }) {
  const [edit, setEdit] = useState<{ source: number; epoch: number; text: string; invalid?: boolean } | null>(null);
  const current = edit?.source === value && edit.epoch === epoch ? edit : null;
  function complete() {
    if (!current) return;
    const parsed = readWheelNumber(current.text, values, value, clockHour);
    if (parsed === null) { setEdit({ ...current, invalid: true }); return; }
    setEdit(null); onChange(parsed);
  }
  return <View style={{ alignItems: 'center', marginBottom: 6 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <TextInput accessibilityLabel={`填写${label}`} value={current?.text ?? String(clockHour ? value % 24 : value).padStart(2, '0')}
        onChangeText={text => setEdit({ source: value, epoch, text })} onBlur={complete} onSubmitEditing={complete} keyboardType="number-pad" selectTextOnFocus maxLength={2}
        style={{ width: 54, minHeight: 40, padding: 6, borderWidth: 1, borderColor: current?.invalid ? c.red : '#E2DFEA', borderRadius: 8, textAlign: 'center', fontFamily: font, fontSize: 18, color: c.purpleDark, backgroundColor: '#FCFCFD' }} />
      <Label muted style={{ fontSize: 12 }}>{label.endsWith('小时') ? '时' : '分'}</Label>
    </View>
    {current?.invalid && <Label accessibilityRole="alert" style={{ fontSize: 10, color: c.red }}>超出可选范围</Label>}
  </View>;
}
function Wheel({ values, value, label, renderValue, clockHour, onChange }: { values: number[]; value: number; label: string; renderValue?: (value: number) => string; clockHour?: boolean; onChange: (value: number) => void }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moving = useRef(false);
  const change = useRef(onChange);
  const options = useRef(values);
  const [initialOffset] = useState(() => ({ x: 0, y: Math.max(0, values.indexOf(value)) * ROW }));
  const [inputEpoch, setInputEpoch] = useState(0);
  const signature = values.join(',');
  useEffect(() => { change.current = onChange; options.current = values; }, [onChange, values]);
  useEffect(() => {
    moving.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, [signature]);
  useEffect(() => {
    if (!moving.current) {
      ref.current?.scrollTo({ y: Math.max(0, values.indexOf(value)) * ROW, animated: false });
    }
    // Values are represented by signature so changing the sibling wheel does not reset a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, signature]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function choose(next: number) {
    moving.current = false;
    if (timer.current) clearTimeout(timer.current);
    ref.current?.scrollTo({ y: Math.max(0, options.current.indexOf(next)) * ROW, animated: false });
    change.current(next);
    setInputEpoch(epoch => epoch + 1);
  }
  const adjust = (delta: number) => choose(values[Math.max(0, Math.min(values.length - 1, values.indexOf(value) + delta))]);
  return <View style={{ flex: 1, minWidth: 0 }}>
    <WheelNumber epoch={inputEpoch} label={label} values={values} value={value} clockHour={clockHour} onChange={choose} />
    <View style={{ height: ROW * 3, overflow: 'hidden', borderRadius: 10 }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: ROW, height: ROW, left: 0, right: 0, backgroundColor: c.lavender, borderRadius: 9 }} />
      <ScrollView ref={ref} tabIndex={-1} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: values[0], max: values[values.length - 1], now: value, text: renderValue?.(value) ?? String(value) }}
        accessibilityActions={[{ name: 'increment', label: '增加' }, { name: 'decrement', label: '减少' }]}
        onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={{ height: ROW * 3 }} contentContainerStyle={{ paddingVertical: ROW }} contentOffset={initialOffset}
        nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast" bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled" onScrollBeginDrag={() => Keyboard.dismiss()}
        onLayout={() => ref.current?.scrollTo({ y: Math.max(0, values.indexOf(value)) * ROW, animated: false })}
        scrollEventThrottle={16} onScroll={event => {
          moving.current = true;
          const index = Math.max(0, Math.min(values.length - 1, Math.round(event.nativeEvent.contentOffset.y / ROW)));
          const next = values[index];
          change.current(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => choose(next), 180);
        }}>
        {values.map(item => <Pressable key={item} accessibilityRole="button" accessibilityLabel={`${label} ${renderValue?.(item) ?? item}`} tabIndex={-1} onPress={() => { Keyboard.dismiss(); choose(item); }} style={{ height: ROW, alignItems: 'center', justifyContent: 'center' }}>
          <Label style={{ fontSize: 18, fontVariant: ['tabular-nums'], color: item === value ? c.purpleDark : c.muted, fontWeight: item === value ? '600' : '400' }}>{renderValue?.(item) ?? String(item).padStart(2, '0')}</Label>
        </Pressable>)}
      </ScrollView>
    </View>
  </View>;
}

export function TimeWheelPicker({ value, onChange, label, mode = 'clock', min = 0, max = 1439, onDone }: {
  value: number; onChange: (value: number) => void; label: string; mode?: TimeInputMode; min?: number; max?: number; onDone?: () => void;
}) {
  const selected = Math.min(max, Math.max(min, value));
  const hours = Math.floor(selected / 60);
  return <View style={styles.panel}>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <Wheel label={`${label}小时`} values={pickerHours(min, max)} value={hours} clockHour={mode === 'end'} renderValue={hour => mode === 'end' && hour >= 24 ? `次日 ${String(hour - 24).padStart(2, '0')}` : String(hour).padStart(2, '0')}
        onChange={hour => onChange(changePickerHour(selected, hour, min, max))} />
      <Wheel label={`${label}分钟`} values={pickerMinutes(hours, min, max)} value={selected % 60} onChange={minute => onChange(hours * 60 + minute)} />
    </View>
    {onDone && <Pressable accessibilityRole="button" accessibilityLabel={`完成选择${label}`} onPress={onDone} style={{ paddingTop: 12, paddingBottom: 4, alignItems: 'center' }}><Label style={{ color: c.purpleDark, fontSize: 12 }}>完成</Label></Pressable>}
  </View>;
}

export function TimeField({ value, onChangeText, label, mode = 'clock', min = 0, max = 1439, dayStart = 0, fallback = min, disabled = false }: {
  value: string; onChangeText: (value: string) => void; label: string; mode?: TimeInputMode; min?: number; max?: number; dayStart?: number; fallback?: number; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = readTimeInput(value, mode, dayStart);
  const selected = Math.min(max, Math.max(min, parsed ?? fallback));
  function complete() { if (parsed !== null && parsed >= min && parsed <= max) onChangeText(formatTimeInput(parsed, mode)); }
  return <View style={{ minWidth: 0 }}>
    <View style={[styles.field, disabled && { opacity: 0.5 }]}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} onFocus={() => setOpen(false)} onBlur={complete} onSubmitEditing={complete} editable={!disabled} selectTextOnFocus autoCorrect={false}
        placeholder={mode === 'duration' ? '时长' : '时间'} placeholderTextColor={c.faint} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? '收起' : '选择'}${label}`} accessibilityState={{ expanded: open, disabled }} disabled={disabled}
        onPress={() => { Keyboard.dismiss(); complete(); setOpen(current => !current); }} style={styles.toggle}><Icon name={open ? 'chevron-up' : 'clock'} size={18} color={c.purple} /></Pressable>
    </View>
    {open && !disabled && <TimeWheelPicker label={label} value={selected} mode={mode} min={min} max={max} onChange={next => onChangeText(formatTimeInput(next, mode))} onDone={() => setOpen(false)} />}
  </View>;
}
const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2DFEA', borderRadius: 10, backgroundColor: '#FCFCFD', minHeight: 46 },
  input: { flex: 1, minWidth: 0, fontFamily: font, fontSize: 14, color: c.text, padding: 12 },
  toggle: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  panel: { marginTop: 8, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: '#fff', padding: 10 },
});
