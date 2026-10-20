import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { colors as c, font } from '../theme';
import { changePickerDay, changePickerHour, formatTimeInput, pickerHours, pickerMinutes, readTimeInput, readWheelDraft, type TimeInputMode } from '../timePicker';
import { durationText } from '../utils';
import { Chip, Icon, Label } from './ui';

const ROW = 40;
function WheelNumber({ values, value, label, unit, clockHour, epoch, duration, disabled, onChange, onEditing }: { values: number[]; value: number; label: string; unit: string; clockHour?: boolean; epoch: number; duration: boolean; disabled: boolean; onChange: (value: number) => void; onEditing: (active: boolean) => void }) {
  const [edit, setEdit] = useState<{ source: number; epoch: number; text: string; invalid?: boolean } | null>(null);
  const current = edit?.source === value && edit.epoch === epoch ? edit : null;
  const display = String(clockHour ? value % 24 : value);
  const formatted = duration ? display : display.padStart(2, '0');
  const range = clockHour ? '请选择可用的当天或次日小时' : values.length === 1 ? `仅可填 ${values[0]}` : `可填 ${values[0]}–${values[values.length - 1]}`;
  return <View style={{ alignItems: 'stretch' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <TextInput accessibilityLabel={`填写${label}`} accessibilityHint={range} value={current?.text ?? formatted}
        onChangeText={text => {
          const next = readWheelDraft(text, values, value, clockHour);
          if (!next) { setEdit({ source: value, epoch, text: current?.text ?? formatted, invalid: true }); return; }
          setEdit({ source: next.value ?? value, epoch, text: next.text });
          if (next.value !== null) onChange(next.value);
        }} onFocus={() => onEditing(true)} onBlur={() => { setEdit(null); onEditing(false); }} onSubmitEditing={() => { setEdit(null); onEditing(false); }} keyboardType="number-pad" inputMode="numeric" selectTextOnFocus maxLength={2} editable={!disabled} autoCorrect={false}
        style={{ flex: 1, minWidth: 34, minHeight: 44, padding: 7, borderWidth: 1, borderColor: current?.invalid ? c.red : '#E2DFEA', borderRadius: 8, textAlign: 'center', fontFamily: font, fontSize: 18, color: c.purpleDark, backgroundColor: duration ? '#fff' : '#FCFCFD' }} />
      <Label muted style={{ fontSize: 12 }}>{unit}</Label>
    </View>
    {current?.invalid && <Label accessibilityRole="alert" style={{ fontSize: 10, color: c.red }}>{range}</Label>}
  </View>;
}
function Wheel({ values, value, label, unit, renderValue, clockHour, expanded, duration, disabled, onChange }: { values: number[]; value: number; label: string; unit: string; renderValue?: (value: number) => string; clockHour?: boolean; expanded: boolean; duration: boolean; disabled: boolean; onChange: (value: number) => void }) {
  const ref = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moving = useRef(false);
  const editing = useRef(false);
  const change = useRef(onChange);
  const options = useRef(values);
  const [initialOffset] = useState(() => ({ x: 0, y: Math.max(0, values.indexOf(value)) * ROW }));
  const [inputEpoch, setInputEpoch] = useState(0);
  const alignment = useRef<number | null>(null);
  const lastOffset = useRef(initialOffset.y);
  const align = useCallback((y: number) => {
    if (!ref.current || Math.abs(lastOffset.current - y) < 1) { alignment.current = null; return; }
    alignment.current = y;
    ref.current.scrollTo({ y, animated: false });
  }, []);
  const signature = values.join(',');
  useEffect(() => { change.current = onChange; options.current = values; }, [onChange, values]);
  useEffect(() => {
    moving.current = false;
    if (timer.current) clearTimeout(timer.current);
  }, [signature]);
  useEffect(() => {
    if (!moving.current) {
      const y = Math.max(0, values.indexOf(value)) * ROW;
      align(y);
    }
    // Values are represented by signature so changing the sibling wheel does not reset a gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, signature, expanded, align]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function choose(next: number) {
    moving.current = false;
    if (timer.current) clearTimeout(timer.current);
    const y = Math.max(0, options.current.indexOf(next)) * ROW;
    align(y);
    change.current(next);
    setInputEpoch(epoch => epoch + 1);
  }
  const adjust = (delta: number) => choose(values[Math.max(0, Math.min(values.length - 1, values.indexOf(value) + delta))]);
  function beginScroll() { editing.current = false; alignment.current = null; Keyboard.dismiss(); }
  return <View style={{ flex: 1, minWidth: 0 }}>
    <WheelNumber epoch={inputEpoch} label={label} unit={unit} values={values} value={value} clockHour={clockHour} duration={duration} disabled={disabled} onEditing={active => {
      editing.current = active;
      moving.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (!active) align(Math.max(0, values.indexOf(value)) * ROW);
    }} onChange={next => {
      moving.current = false;
      if (timer.current) clearTimeout(timer.current);
      change.current(next);
    }} />
    {expanded && !disabled && <View style={{ height: ROW * 3, overflow: 'hidden', borderRadius: 10, marginTop: 8 }}>
      <View pointerEvents="none" style={{ position: 'absolute', top: ROW, height: ROW, left: 0, right: 0, backgroundColor: c.lavender, borderRadius: 9 }} />
      <ScrollView ref={ref} tabIndex={-1} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: values[0], max: values[values.length - 1], now: value, text: renderValue?.(value) ?? String(value) }}
        accessibilityActions={[{ name: 'increment', label: '增加' }, { name: 'decrement', label: '减少' }]}
        onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={{ height: ROW * 3 }} contentContainerStyle={{ paddingVertical: ROW }} contentOffset={initialOffset}
        nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={ROW} decelerationRate="fast" bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={beginScroll} onTouchStart={beginScroll} onPointerDown={beginScroll} {...(Platform.OS === 'web' ? { onWheel: beginScroll } : {})}
        onLayout={() => { lastOffset.current = initialOffset.y; align(Math.max(0, values.indexOf(value)) * ROW); }}
        scrollEventThrottle={16} onScroll={event => {
          const y = event.nativeEvent.contentOffset.y;
          lastOffset.current = y;
          if (editing.current) return;
          const aligned = alignment.current;
          if (aligned !== null) {
            if (Math.abs(y - aligned) < 1) alignment.current = null;
            return;
          }
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
    </View>}
  </View>;
}

export function TimeWheelPicker({ value, onChange, label, mode = 'clock', min = 0, max = 1439, onDone, expanded = true, disabled = false, onToggle }: {
  value: number; onChange: (value: number) => void; label: string; mode?: TimeInputMode; min?: number; max?: number; onDone?: () => void;
  expanded?: boolean; disabled?: boolean; onToggle?: () => void;
}) {
  const selected = Math.min(max, Math.max(min, value));
  const hours = Math.floor(selected / 60);
  const duration = mode === 'duration';
  return <View style={[styles.panel, duration && styles.durationPanel, disabled && { opacity: 0.5 }]}>
    {mode === 'end' && <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
      {[0, 1].filter(day => Math.max(min, day * 1440) <= Math.min(max, (day + 1) * 1440 - 1)).map(day =>
        <Chip key={day} title={day ? '次日' : '当天'} selected={Math.floor(selected / 1440) === day}
          onPress={disabled ? undefined : () => { Keyboard.dismiss(); onChange(changePickerDay(selected, day, min, max)); }} />)}
    </View>}
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Wheel label={`${label}小时`} unit={duration ? '小时' : '时'} expanded={expanded} duration={duration} disabled={disabled}
        values={pickerHours(min, max)} value={hours} clockHour={mode === 'end'} renderValue={hour => mode === 'end' && hour >= 24 ? `次日 ${String(hour - 24).padStart(2, '0')}` : duration ? String(hour) : String(hour).padStart(2, '0')}
        onChange={hour => onChange(changePickerHour(selected, hour, min, max))} />
      <Wheel label={`${label}分钟`} unit={duration ? '分钟' : '分'} expanded={expanded} duration={duration} disabled={disabled}
        values={pickerMinutes(hours, min, max)} value={selected % 60} renderValue={duration ? minute => String(minute) : undefined} onChange={minute => onChange(hours * 60 + minute)} />
      {onToggle && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? '收起' : '选择'}${label}`} accessibilityState={{ expanded, disabled }} disabled={disabled}
        onPress={() => { Keyboard.dismiss(); onToggle(); }} style={styles.toggle}><Icon name={expanded ? 'chevron-up' : duration ? 'sliders' : 'clock'} size={18} color={c.purple} /></Pressable>}
    </View>
    {duration && <Label muted style={{ fontSize: 10, marginTop: 6 }}>范围 {durationText(min)}–{durationText(max)}</Label>}
    {onDone && <Pressable accessibilityRole="button" accessibilityLabel={`完成选择${label}`} onPress={onDone} style={{ paddingTop: 12, paddingBottom: 4, alignItems: 'center' }}><Label style={{ color: c.purpleDark, fontSize: 12 }}>完成</Label></Pressable>}
  </View>;
}

export function TimeField({ value, onChangeText, label, mode = 'clock', min = 0, max = 1439, dayStart = 0, fallback = min, disabled = false }: {
  value: string; onChangeText: (value: string) => void; label: string; mode?: TimeInputMode; min?: number; max?: number; dayStart?: number; fallback?: number; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const parsed = readTimeInput(value, mode, dayStart);
  const selected = Math.min(max, Math.max(min, parsed ?? fallback));
  useEffect(() => {
    if (!disabled && (parsed === null || parsed !== selected)) onChangeText(formatTimeInput(selected, mode));
  }, [disabled, mode, onChangeText, parsed, selected]);
  return <TimeWheelPicker label={label} value={selected} mode={mode} min={min} max={max} disabled={disabled} expanded={open}
    onChange={next => onChangeText(formatTimeInput(next, mode))} onToggle={() => setOpen(current => !current)} />;
}
const styles = StyleSheet.create({
  toggle: { width: 32, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  panel: { borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: '#fff', padding: 10 },
  durationPanel: { backgroundColor: '#F8F7FB', borderStyle: 'dashed' },
});
