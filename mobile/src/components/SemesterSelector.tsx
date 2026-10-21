import React from 'react';
import { View } from 'react-native';
import type { SchoolRequest } from '../hitsz';
import { AcademicYearField } from './DateField';
import { Chip, FieldTitle, Label } from './ui';

export const COURSE_TERMS = [{ value: '1', title: '秋季学期' }, { value: '2', title: '春季学期' }, { value: '3', title: '夏季学期' }] as const;
export function SemesterSelector({ value, onChange, currentYear }: { value: SchoolRequest; onChange: (next: SchoolRequest) => void; currentYear?: number }) {
  return <View>
    <FieldTitle>学年</FieldTitle><AcademicYearField value={value.year} onChangeText={year => onChange({ ...value, year })} currentYear={currentYear} />
    <FieldTitle>学期</FieldTitle><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{COURSE_TERMS.map(term => <Chip key={term.value} title={term.title} selected={value.term === term.value} onPress={() => onChange({ ...value, term: term.value })} />)}</View>
    <Label muted accessibilityLiveRegion="polite" style={{ fontSize: 12, marginTop: 14 }}>已选择：{value.year} · {COURSE_TERMS.find(term => term.value === value.term)?.title}</Label>
  </View>;
}
