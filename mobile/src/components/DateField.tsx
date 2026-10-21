import React, { useState } from 'react';
import { Keyboard, Pressable, View } from 'react-native';
import { changeDatePart, datePartsKey, MAX_DATE_YEAR, MIN_DATE_YEAR, daysInMonth, numberRange, readDateParts, type DateParts } from '../datePicker';
import { dateKey } from '../utils';
import { colors as c } from '../theme';
import { NumberWheel } from './TimeField';
import { Button, Icon, Label } from './ui';

// Stored dates remain ISO keys; the user edits only independent numeric parts.
export function DateField({ value, onChangeText, label, optional = false, disabled = false, fallback, minYear = MIN_DATE_YEAR, maxYear = MAX_DATE_YEAR }: {
  value: string; onChangeText: (value: string) => void; label: string; optional?: boolean; disabled?: boolean; fallback?: string; minYear?: number; maxYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const [adjustment, setAdjustment] = useState('');
  const parsed = readDateParts(value);
  const base = parsed ?? readDateParts(fallback ?? '') ?? readDateParts(dateKey(new Date()))!;
  const selected = { ...base, year: Math.max(minYear, Math.min(maxYear, base.year)) };
  selected.day = Math.min(selected.day, daysInMonth(selected.year, selected.month));
  const valid = !!parsed && parsed.year >= minYear && parsed.year <= maxYear;
  const showing = !!value || open;
  function change(part: keyof DateParts, number: number) {
    const result = changeDatePart(selected, part, number);
    if (!result) return;
    onChangeText(datePartsKey(result.parts));
    setAdjustment(result.adjusted ? `本月仅有 ${result.parts.day} 天，已调整为 ${result.parts.month} 月 ${result.parts.day} 日。` : '');
  }
  return <View style={{ gap: 7 }}>
    {showing ? <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 9, backgroundColor: '#fff', opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        <View style={{ flex: 1.45 }}><NumberWheel label={`${label}年份`} unit="年" digits={4} values={numberRange(minYear, maxYear)} value={selected.year} expanded={open} disabled={disabled} onChange={year => change('year', year)} /></View>
        <NumberWheel label={`${label}月份`} unit="月" values={numberRange(1, 12)} value={selected.month} expanded={open} disabled={disabled} onChange={month => change('month', month)} />
        <NumberWheel label={`${label}日期`} unit="日" values={numberRange(1, daysInMonth(selected.year, selected.month))} value={selected.day} expanded={open} disabled={disabled} onChange={day => change('day', day)} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${open ? '收起' : '滚动选择'}${label}`} accessibilityState={{ expanded: open }} disabled={disabled}
          onPress={() => { Keyboard.dismiss(); setOpen(previous => !previous); }} style={{ width: 26, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Icon name={open ? 'chevron-up' : 'calendar'} color={c.purple} size={18} /></Pressable>
      </View>
      {open && !valid && <Button title={`确认${label}`} small variant="ghost" onPress={() => { onChangeText(datePartsKey(selected)); setOpen(false); }} style={{ alignSelf: 'center', marginTop: 8 }} />}
    </View> : <Button title={optional ? `设置${label}` : `选择${label}`} icon="calendar" variant="secondary" small disabled={disabled} onPress={() => { setOpen(true); setAdjustment(''); }} style={{ alignSelf: 'flex-start' }} />}
    {!!value && !valid && <Label accessibilityRole="alert" style={{ fontSize: 11, color: c.red }}>日期无效，请重新选择。</Label>}
    {!!adjustment && <Label accessibilityLiveRegion="polite" style={{ fontSize: 11, color: c.orange }}>{adjustment}</Label>}
    {optional && !!value && <Button title={`清除${label}`} variant="ghost" small disabled={disabled} onPress={() => { onChangeText(''); setOpen(false); setAdjustment(''); }} style={{ alignSelf: 'flex-start' }} />}
  </View>;
}

export function AcademicYearField({ value, onChangeText, label = '课表学年' }: { value: string; onChangeText: (value: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const start = Math.max(MIN_DATE_YEAR, Math.min(MAX_DATE_YEAR - 1, Number(value.slice(0, 4)) || new Date().getFullYear()));
  return <View style={{ padding: 10, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: '#fff' }}>
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <NumberWheel label={`${label}起始年份`} unit="年起" digits={4} values={numberRange(MIN_DATE_YEAR, MAX_DATE_YEAR - 1)} value={start} expanded={open} onChange={year => onChangeText(`${year}-${year + 1}`)} />
      <Label muted style={{ fontSize: 12, paddingTop: 14 }}>至 {start + 1} 年</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={`${open ? '收起' : '滚动选择'}${label}`} onPress={() => { Keyboard.dismiss(); setOpen(previous => !previous); }} style={{ minHeight: 44, width: 28, alignItems: 'center', justifyContent: 'center' }}><Icon name={open ? 'chevron-up' : 'calendar'} color={c.purple} size={18} /></Pressable>
    </View>
  </View>;
}
