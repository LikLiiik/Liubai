import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import type { Task } from '../types';
import { updateWeekPinch, type WeekMetrics, type WeekPinch } from '../weekZoom';
import { useWeekPinch } from './useWeekPinch';
import { WeekTaskCard } from './WeekTaskCard';
import { Badge, Button, Label } from './ui';
import { colors as c } from '../theme';

const INITIAL = { dayWidth: 64, hourHeight: 40 };
const EXAMPLE: Task = { id: 'guide-zoom-task', title: '整理项目资料', notes: '归档笔记与参考资料，列出下一步。', duration: 60, start: 840,
  date: '2026-10-21', category: 'work', priority: 'normal', important: true, fixed: false, completed: false, deadline: null, postponed: 0 };

export function WeekZoomGuideLesson({ onPinchingChange }: { onPinchingChange: (value: boolean) => void }) {
  const [size, setSize] = useState(INITIAL), [task, setTask] = useState(EXAMPLE), [width, setWidth] = useState(280);
  const board = useRef<React.ComponentRef<typeof View>>(null), session = useRef<WeekPinch | null>(null);
  const bound = (next: WeekMetrics) => ({ dayWidth: Math.max(44, Math.min(width - 18, next.dayWidth)), hourHeight: Math.max(24, Math.min(200, next.hourHeight)) });
  const pinch = useWeekPinch(board, {
    onBegin: points => { session.current = { points, metrics: size, offset: { x: 0, y: 0 }, viewport: { width, height: 230, minDayWidth: 44, gutter: 0, header: 0 } }; },
    onMove: points => { if (session.current) setSize(bound(updateWeekPinch(session.current, points))); },
    onEnd: () => { session.current = null; },
    onWheel: (_, factor, axis) => setSize(bound({ dayWidth: size.dayWidth * (axis === 'y' ? 1 : factor), hourHeight: size.hourHeight * (axis === 'x' ? 1 : factor) })),
  });
  useEffect(() => { onPinchingChange(pinch.pinching); return () => onPinchingChange(false); }, [pinch.pinching, onPinchingChange]);
  return <View style={{ marginTop: 18, gap: 10 }}>
    <Badge title="缩放演示 · 不改变日程" tone="neutral" />
    <Label muted style={{ fontSize: 11 }}>双指横向、纵向分合，观察卡片内容和星标。</Label>
    <View ref={board} collapsable={false} {...pinch.handlers} onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ height: 230, backgroundColor: c.bg, borderRadius: 12, padding: 8, overflow: 'hidden' }}>
      <WeekTaskCard task={task} small={size.dayWidth < 84} unlocked={false} dragging={false}
        availableWidth={size.dayWidth} availableHeight={size.hourHeight} interactionBlocked={pinch.pinching} gestureBlocked={pinch.isBlocked}
        style={{ width: size.dayWidth, height: size.hourHeight }} onToggleImportant={() => setTask(value => ({ ...value, important: !value.important }))}
        onBegin={() => {}} onMove={() => {}} onDrop={() => {}} onCancel={() => {}} onOpen={() => {}} onUnlock={() => {}} />
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button title="演示：横向放大" small variant="secondary" onPress={() => setSize(bound({ ...size, dayWidth: size.dayWidth * 1.5 }))} />
      <Button title="演示：纵向放大" small variant="secondary" onPress={() => setSize(bound({ ...size, hourHeight: size.hourHeight * 1.5 }))} />
      <Button title="还原缩放示例" small variant="ghost" onPress={() => { setSize(INITIAL); setTask(EXAMPLE); }} />
    </View>
  </View>;
}
