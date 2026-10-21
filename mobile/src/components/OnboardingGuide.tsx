import React, { useState } from 'react';
import { View } from 'react-native';
import { useGuide } from '../guideStore';
import { GUIDE_STEPS } from '../guide';
import { colors as c } from '../theme';
import { Badge, Button, Dialog, Icon, Label } from './ui';
import { GuidePermissions } from './GuidePermissions';
import { useRouter } from 'expo-router';
import { CategoryGuideLesson, CompletionGuideLesson, CompletionRescheduleGuideLesson, CourseImportGuideLesson, EndNotificationGuideLesson, NicknameGuideLesson, QuickGuideLesson, RescueGuideLesson, TimeGuideLesson, WeekGuideLesson, WeekZoomGuideLesson } from './GuideLessons';

export function OnboardingGuide({ blocked = false }: { blocked?: boolean }) {
  const guide = useGuide();
  const router = useRouter();
  const [lessonDragging, setLessonDragging] = useState(false);
  const [lessonPinching, setLessonPinching] = useState(false);
  function finish() {
    const firstCompletion = guide.progress.completedRevision === 0;
    guide.finish();
    if (firstCompletion) router.navigate('/');
  }
  const index = Math.max(0, GUIDE_STEPS.findIndex(step => step.id === guide.progress.stepId));
  const step = GUIDE_STEPS[index], visible = guide.ready && guide.visible && !blocked;
  return <Dialog visible={visible} title={step.title} subtitle={step.summary} onClose={guide.dismiss} scrollEnabled={!lessonDragging && !lessonPinching}
    footer={<View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
      <Button title="稍后再看" small variant="ghost" onPress={guide.dismiss} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {index > 0 && <Button title="上一步" small variant="secondary" onPress={() => guide.visit(GUIDE_STEPS[index - 1].id)} />}
        <Button title={index === GUIDE_STEPS.length - 1 ? '完成教程' : index === 0 ? '开始了解' : '下一步'} small icon={index === GUIDE_STEPS.length - 1 ? 'check' : 'arrow-right'} onPress={() => index === GUIDE_STEPS.length - 1 ? finish() : guide.visit(GUIDE_STEPS[index + 1].id)} />
      </View>
    </View>}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
      <View style={{ width: 39, height: 39, borderRadius: 12, backgroundColor: c.lavender, alignItems: 'center', justifyContent: 'center' }}><Icon name={step.icon} color={c.purple} size={20} /></View>
      <View style={{ flex: 1 }}><Label muted style={{ fontSize: 10 }}>新手指引 · {index + 1}/{GUIDE_STEPS.length}</Label><View style={{ flexDirection: 'row', gap: 4, marginTop: 6 }}>{GUIDE_STEPS.map((item, position) => <View key={item.id} style={{ flex: 1, height: 3, borderRadius: 3, backgroundColor: position <= index ? c.purple : c.border }} />)}</View></View>
    </View>
    <View style={{ gap: 14 }}>{step.tips.map((tip, number) => <View key={tip} style={{ flexDirection: 'row', gap: 10 }}>
      <Label style={{ color: c.purple, fontSize: 12, width: 16 }}>{number + 1}.</Label><Label style={{ flex: 1, fontSize: 13, lineHeight: 23 }}>{tip}</Label>
    </View>)}</View>
    {step.id === 'welcome' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 }}><Badge title="记下来" tone="purple" /><Badge title="安排好" tone="green" /><Badge title="随时调整" tone="orange" /></View>}
    {visible && step.id === 'tasks' && <TimeGuideLesson />}
    {visible && step.id === 'quick' && <QuickGuideLesson />}
    {visible && step.id === 'completion' && <><CompletionGuideLesson /><CompletionRescheduleGuideLesson /><EndNotificationGuideLesson /></>}
    {visible && step.id === 'week' && <><WeekGuideLesson onDraggingChange={setLessonDragging} /><WeekZoomGuideLesson onPinchingChange={setLessonPinching} /></>}
    {visible && step.id === 'rescue' && <RescueGuideLesson />}
    {visible && step.id === 'explore' && <CategoryGuideLesson />}
    {visible && step.id === 'preferences' && <><NicknameGuideLesson /><CourseImportGuideLesson /></>}
    {visible && step.id === 'permissions' && <GuidePermissions />}
    {guide.saveError && <View style={{ marginTop: 16, padding: 12, backgroundColor: c.orangeBg, borderRadius: 9 }}><Label accessibilityRole="alert" style={{ fontSize: 11, color: c.orange }}>教程进度暂未保存，可以继续使用。</Label><Button title="重试保存进度" variant="ghost" small onPress={guide.retry} /></View>}
  </Dialog>;
}
