import { KeyboardFormScrollView } from '../components/KeyboardForm';
import React, { useMemo, useState } from 'react';
import { Platform, Pressable, Switch, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { clock } from '../utils';
import { expandCourses, parseHitszCourses, previewCourseImport, UNDERGRADUATE_PERIODS, validSemester, validSemesterTerm, type CourseDraft } from '../courses';
import type { SchoolRead } from '../hitsz';
import { SchoolLogin } from '../components/SchoolLogin';
import { AcademicYearField, DateField } from '../components/DateField';
import { Badge, Button, Card, Chip, Confirm, FieldTitle, Icon, Label } from '../components/ui';

export default function CourseImport() {
  const { data, today, applyPlan, saveStatus } = usePlanning();
  const router = useRouter();
  const compact = useWindowDimensions().width < 600;
  const yearNumber = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 8 ? 1 : 0);
  const [year, setYear] = useState(`${yearNumber}-${yearNumber + 1}`);
  const [term, setTerm] = useState(Number(today.slice(5, 7)) >= 8 ? '1' : '2');
  const [monday, setMonday] = useState('');
  const [login, setLogin] = useState(false);
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [mode, setMode] = useState<'merge' | 'sync'>('merge');
  const [confirmed, setConfirmed] = useState(false);
  const [showTimes, setShowTimes] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [importedCounts, setImportedCounts] = useState('');
  const [importedDate, setImportedDate] = useState(today);
  const semester = { year, term, monday };
  const semesterKey = `${year}/${term}`;
  const selected = draft?.courses.filter(course => !excluded.includes(course.key)) ?? [];
  const preview = useMemo(() => {
    const chosen = draft?.courses.filter(course => !excluded.includes(course.key)) ?? [];
    if (!draft || !validSemesterTerm({ year, term }) || chosen.some(course => !course.pending) && !validSemester({ year, term, monday }) || draft.issues.length) return null;
    try {
      return previewCourseImport(data.tasks,
        expandCourses(draft.courses.filter(course => !excluded.includes(course.key)), { year, term, monday }),
        `${year}/${term}`, mode, today);
    } catch { return null; }
  }, [draft, year, term, monday, data.tasks, excluded, mode, today]);
  const canImport = !!preview?.valid && !!preview.changes.length && confirmed && !!selected.length;

  function receive(value: SchoolRead) {
    try {
      const next = parseHitszCourses(value.rows);
      setDraft(next); setYear(value.year); setTerm(value.term); setMonday(value.monday);
      setMode('merge'); setConfirmed(false); setExcluded([]); setDone(false); setError(''); setLogin(false);
    } catch (error) { setError(error instanceof Error ? error.message : '读取失败，请重试。'); }
  }
  function importNow() {
    setConfirmImport(false);
    if (!canImport || !preview) { setError('课表或日程已变更，请重新检查预览。'); return; }
    if (!applyPlan(preview, `导入课表 · ${semesterKey}`, { demo: false })) { setError('日程已变更，请重新检查预览。'); return; }
    setImportedCounts(`新增 ${preview.added} · 更新 ${preview.updated} · 移除 ${preview.removed}`);
    const dates = preview.tasks.filter(task => task.courseImport?.semester === semesterKey).flatMap(task => task.date ? [task.date] : []).sort();
    setImportedDate(dates.find(date => date >= today) ?? dates[0] ?? today);
    setDone(true);
  }
  return <><KeyboardFormScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: compact ? 20 : 38, paddingBottom: 45 }}>
    <View style={{ width: '100%', maxWidth: 900, alignSelf: 'center' }}>
      <Pressable accessibilityRole="link" accessibilityLabel="返回我的" onPress={() => router.navigate('/me')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, minHeight: 32 }}><Icon name="arrow-left" size={16} /><Label muted style={{ fontSize: 12 }}>我的</Label></Pressable>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 23 }}><Label style={{ fontSize: 26, lineHeight: 36, fontWeight: '700' }}>课表导入</Label></View>
      {done ? <Card>
        <Icon name="check-circle" size={28} color={c.green} /><Label style={{ fontSize: 20, fontWeight: '600', marginTop: 12 }}>{saveStatus === 'error' ? '本地保存失败' : saveStatus === 'saving' ? '正在保存课表…' : '课表已导入'}</Label>
        <Label muted style={{ marginTop: 9, fontSize: 12 }}>{importedCounts}</Label>
        <Label muted style={{ marginTop: 8, fontSize: 11 }}>{saveStatus === 'error' ? '请保留页面，并检查设备存储或浏览器权限。' : '时间已识别的课程设为固定事项，其余放入收集箱；可在回顾中撤销本次导入。'}</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 }}>
          {selected.some(course => !course.pending) && <Button title="查看周览" icon="calendar" onPress={() => router.navigate({ pathname: '/week', params: { date: importedDate } })} />}
          {selected.some(course => course.pending) && <Button title="查看收集箱" icon="inbox" onPress={() => router.navigate('/inbox')} />}
          <Button title="查看回顾" variant="secondary" onPress={() => router.navigate('/review')} /><Button title="再次导入" variant="ghost" onPress={() => { setDone(false); setDraft(null); setError(''); setConfirmed(false); }} /></View>
      </Card> : <>
        <Card style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="book-open" color={c.purple} /><Label style={{ fontWeight: '600', flexShrink: 1 }}>哈尔滨工业大学（深圳）</Label><Badge title="本科生" tone="neutral" /></View>
          {!draft ? <>
            <FieldTitle>学年</FieldTitle><AcademicYearField value={year} onChangeText={setYear} />
            <FieldTitle>学期</FieldTitle><View style={{ flexDirection: 'row', gap: 8 }}>{[['1', '秋季'], ['2', '春季'], ['3', '夏季']].map(([value, title]) => <Chip key={value} title={title} selected={term === value} onPress={() => setTerm(value)} />)}</View>
            <Label muted style={{ fontSize: 11, marginTop: 17 }}>{Platform.OS === 'web' ? '教务登录与课表读取在手机端完成。' : '在学校页面完成登录后，进入个人课表并读取。账号密码不在留白中保存。'}</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 }}>
              {Platform.OS !== 'web' && <Button title="登录教务并读取" icon="log-in" disabled={!/^\d{4}-\d{4}$/.test(year)} onPress={() => { setError(''); setLogin(true); }} />}
              {Platform.OS === 'web' && <Label muted style={{ fontSize: 12 }}>请在安卓 APP 中使用教务导入。</Label>}
            </View>
          </> : <>
            <Label muted style={{ marginTop: 12, fontSize: 12 }}>{year} · {term === '1' ? '秋季' : term === '2' ? '春季' : '夏季'} · 读取 {draft.courses.length} 门课程</Label>
            <FieldTitle>第一周周一</FieldTitle><DateField label="第一周周一" value={monday} onChangeText={value => { setMonday(value); setConfirmed(false); }} fallback={`${year.slice(0, 4)}-09-01`} minYear={Number(year.slice(0, 4))} maxYear={Number(year.slice(5))} />
            {!validSemester(semester) && <Label accessibilityRole="alert" style={{ color: c.orange, fontSize: 11, marginTop: 8 }}>请选择本学年内的周一。</Label>}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 }}><Label style={{ flex: 1, fontSize: 12 }}>{selected.some(course => !course.pending) ? '已核对学期日期与本科作息' : '已核对收集箱课程'}</Label><Switch accessibilityLabel={selected.some(course => !course.pending) ? '已核对学期日期与本科作息' : '已核对收集箱课程'} value={confirmed} onValueChange={setConfirmed} /></View>
            <Button title={showTimes ? '收起本科作息' : '查看本科作息'} variant="ghost" small onPress={() => setShowTimes(!showTimes)} style={{ alignSelf: 'flex-start' }} />
            {showTimes && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 8 }}>{UNDERGRADUATE_PERIODS.map(([start, end], index) => <Label key={index} muted style={{ fontSize: 11, width: 170 }}>第 {index + 1} 节　{clock(start)}–{clock(end)}</Label>)}</View>}
          </>}
        </Card>
        {draft && <>
          {!!draft.issues.length && <Card style={{ marginBottom: 18 }}><Label style={{ color: c.red }}>部分数据未能解析，暂不能导入。</Label>{draft.issues.map((issue, index) => <Label key={index} muted style={{ fontSize: 11, marginTop: 6 }}>{issue}</Label>)}</Card>}
          {draft.courses.length === 0 && <Card style={{ marginBottom: 18 }}><Label>该学期暂无可导入课程。</Label></Card>}
          {draft.courses.map(course => <Card key={course.key} style={{ marginBottom: 12, padding: 17 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><Label style={{ fontWeight: '600', fontSize: 14 }}>{course.title}</Label><Label muted style={{ fontSize: 11, marginTop: 4 }}>{course.pending ? '收集箱 · 排课待确认' : `周${'一二三四五六日'[course.weekday - 1]} · 第 ${course.periods.join('、')} 节 · ${course.weeks.join('、')} 周`}</Label>{course.pending && <Label muted style={{ fontSize: 11, marginTop: 4 }}>{course.pending.reason}</Label>}<Label muted style={{ fontSize: 11 }}>{[course.teacher, course.room].filter(Boolean).join(' · ')}</Label></View><Switch accessibilityLabel={`导入课程：${course.title}`} value={!excluded.includes(course.key)} onValueChange={value => setExcluded(previous => value ? previous.filter(key => key !== course.key) : [...previous, course.key])} /></View>
            {!course.pending && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 9 }}><Label muted style={{ flex: 1, fontSize: 11 }}>体育等特殊课程延后 15 分钟</Label><Switch accessibilityLabel={`延后15分钟：${course.title}`} value={course.offset === 15} onValueChange={value => setDraft(previous => previous && ({ ...previous, courses: previous.courses.map(item => item.key === course.key ? { ...item, offset: value ? 15 : 0 } : item) }))} /></View>}
          </Card>)}
          <Card style={{ marginTop: 6 }}>
            <FieldTitle>导入方式</FieldTitle><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Chip title="合并更新" selected={mode === 'merge'} onPress={() => setMode('merge')} /><Chip title="同步本学期" selected={mode === 'sync'} onPress={() => setMode('sync')} /></View>
            <Label muted style={{ fontSize: 11, marginTop: 10 }}>{mode === 'merge' ? '添加新课程、更新已有课程，不删除原有课程。' : '同时移除本学期不再导入的课程，保留手动修改和完成记录。'}</Label>
            {preview && <><Label style={{ marginTop: 17, fontSize: 13 }}>新增 {preview.added} · 更新 {preview.updated} · 移除 {preview.removed} · 重复 {preview.unchanged} · 保留 {preview.protected}</Label>
              {preview.warnings.map((warning, index) => <Label key={index} muted style={{ fontSize: 11, marginTop: 6 }}>{warning}</Label>)}
              {preview.conflicts.slice(0, 8).map(conflict => <Label key={conflict.key} style={{ color: c.orange, fontSize: 11, marginTop: 7 }}>{conflict.message}</Label>)}
              {preview.conflicts.length > 8 && <Label muted style={{ fontSize: 11 }}>另有 {preview.conflicts.length - 8} 项课程安排存在重叠</Label>}
              {!!preview.conflicts.length && <Label muted style={{ fontSize: 11, marginTop: 8 }}>重叠课程可一并导入，今天和周览将保留并列显示。</Label>}
              {preview.valid && !preview.changes.length && <Label muted style={{ fontSize: 12, marginTop: 10 }}>没有需要导入的变更。</Label>}
              <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 }}><Label style={{ fontWeight: '600', fontSize: 12 }}>日程预览</Label>{preview.changes.slice(0, 8).map(change => <Label key={change.taskId} muted style={{ fontSize: 11, marginTop: 6 }}>{change.title} · {change.to}</Label>)}{preview.changes.length > 8 && <Label muted style={{ fontSize: 11, marginTop: 6 }}>共 {preview.changes.length} 项变更</Label>}</View>
            </>}
            {draft.ignored > 0 && <Label muted style={{ fontSize: 11, marginTop: 8 }}>已忽略 {draft.ignored} 条独立备注或重复记录。</Label>}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 }}><Button title="确认导入" icon="check" disabled={!canImport} onPress={() => setConfirmImport(true)} /><Button title="重新读取" variant="ghost" onPress={() => { setDraft(null); setError(''); setConfirmed(false); }} /></View>
          </Card>
        </>}
      </>}
      {!!error && <Label accessibilityRole="alert" style={{ color: c.red, fontSize: 12, marginTop: 15 }}>{error}</Label>}
    </View>
  </KeyboardFormScrollView>
    <SchoolLogin visible={login} request={{ year, term }} onRead={receive} onClose={() => setLogin(false)} />
    <Confirm visible={confirmImport} title="导入本学期课表？" description={`新增 ${preview?.added ?? 0} 项，更新 ${preview?.updated ?? 0} 项，移除 ${preview?.removed ?? 0} 项。${preview?.conflicts.length ? `其中 ${preview.conflicts.length} 项课程安排与其他事件重叠，将按原时间一并导入。` : ''}时间已识别的课程设为固定事项，其余放入收集箱。可在回顾中撤销。`} action="导入课表" onClose={() => setConfirmImport(false)} onConfirm={importNow} />
  </>;
}
