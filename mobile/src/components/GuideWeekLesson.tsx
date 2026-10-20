import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { colors as c } from '../theme';
import type { Task } from '../types';
import { clock } from '../utils';
import { positionFromPoint, type TaskPosition } from '../week';
import { Badge, Button, Label } from './ui';
import { WeekTaskCard } from './WeekTaskCard';

const DATES = ['2026-10-20', '2026-10-21'];
const START = 14 * 60, END = 16 * 60, SCALE = 1.8, GUTTER = 38;
const INITIAL: Task = { id: 'guide-week-task', title: '整理阅读笔记', notes: '', duration: 30, category: 'work', priority: 'normal', important: false,
  fixed: false, completed: false, date: DATES[0], start: 870, deadline: null, postponed: 0 };
type Session = { generation: number; x: number; y: number; grab: number; bounds?: { x: number; y: number; width: number; height: number } };

export function WeekGuideLesson({ onDraggingChange }: { onDraggingChange: (dragging: boolean) => void }) {
  const [task, setTask] = useState(INITIAL);
  const [width, setWidth] = useState(250);
  const [drag, setDrag] = useState<{ position: TaskPosition | null } | null>(null);
  const [moved, setMoved] = useState(false);
  const board = useRef<React.ComponentRef<typeof View>>(null);
  const session = useRef<Session | null>(null), generation = useRef(0);
  const preview = useRef<TaskPosition | null>(null);
  const dayWidth = Math.max(1, (width - GUTTER) / 2);
  useEffect(() => () => { generation.current += 1; session.current = null; onDraggingChange(false); }, [onDraggingChange]);

  function update(x: number, y: number) {
    const active = session.current;
    if (!active) return;
    active.x = x; active.y = y;
    if (!active.bounds) return;
    const position = positionFromPoint({ x: x - active.bounds.x - GUTTER, y: y - active.bounds.y, dayWidth: (active.bounds.width - GUTTER) / 2,
      startMinute: START, endMinute: END, pixelsPerMinute: SCALE, dates: DATES, grabOffset: active.grab });
    const next = position ? { ...position, start: Math.min(END - INITIAL.duration, position.start) } : null;
    preview.current = next; setDrag({ position: next });
  }
  function begin(x: number, y: number) {
    const token = ++generation.current;
    session.current = { generation: token, x, y, grab: 0 };
    preview.current = { date: task.date!, start: task.start! };
    setDrag({ position: preview.current }); onDraggingChange(true);
    board.current?.measureInWindow((left, top, measuredWidth, height) => {
      const active = session.current;
      if (!active || active.generation !== token || generation.current !== token) return;
      active.bounds = { x: left, y: top, width: measuredWidth, height };
      active.grab = Math.max(0, Math.min(INITIAL.duration * SCALE - 1, y - top - (task.start! - START) * SCALE));
      update(active.x, active.y);
    });
  }
  function cancel() {
    generation.current += 1; session.current = null; preview.current = null; setDrag(null); onDraggingChange(false);
  }
  function drop() {
    const next = preview.current;
    if (next) { setTask(previous => ({ ...previous, ...next })); setMoved(next.date !== INITIAL.date || next.start !== INITIAL.start); }
    cancel();
  }
  const shown = drag?.position ?? { date: task.date!, start: task.start! };
  const description = `${shown.date === DATES[0] ? '今天' : '明天'} ${clock(shown.start)}–${clock(shown.start + task.duration)}`;
  return <View style={{ marginTop: 16, padding: 12, backgroundColor: c.bg, borderRadius: 13 }}>
    <View style={{ alignSelf: 'flex-start', marginBottom: 10 }}><Badge title="教学演示 · 不改变日程" tone="neutral" /></View>
    <Label muted style={{ fontSize: 11, marginBottom: 8 }}>长按卡片，上下拖动调整时间，也可移到另一天。</Label>
    <Label accessibilityLiveRegion="polite" style={{ color: c.purpleDark, fontSize: 12, marginBottom: 10 }}>{drag ? drag.position ? `调整中 · ${description}` : '移回表格内放置' : moved ? `已调整 · ${description}` : description}</Label>
    <View style={{ flexDirection: 'row', paddingLeft: GUTTER, marginBottom: 7 }}>{['今天', '明天'].map(day => <Label key={day} muted style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>{day}</Label>)}</View>
    <View ref={board} collapsable={false} testID="guide-week-grid" onLayout={event => setWidth(event.nativeEvent.layout.width)}
      style={{ height: (END - START) * SCALE + 1, borderRadius: 9, backgroundColor: '#fff', overflow: 'hidden' }}>
      {[START, START + 30, START + 60, START + 90, END].map(minute => <View key={minute} pointerEvents="none" style={{ position: 'absolute', top: Math.min((END - START) * SCALE, (minute - START) * SCALE), left: GUTTER, right: 0, borderTopWidth: 1, borderColor: c.border }} />)}
      {[START, START + 60, END].map(minute => <Label key={minute} muted style={{ position: 'absolute', top: Math.min((END - START) * SCALE - 17, Math.max(0, (minute - START) * SCALE - 8)), left: 0, fontSize: 9 }}>{clock(minute)}</Label>)}
      {[0, 1, 2].map(column => <View key={column} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER + column * dayWidth, borderLeftWidth: 1, borderColor: c.border }} />)}
      <WeekTaskCard task={task} small={false} unlocked={false} dragging={!!drag} availableHeight={task.duration * SCALE - 3}
        style={{ position: 'absolute', top: (task.start! - START) * SCALE + 1, left: GUTTER + DATES.indexOf(task.date!) * dayWidth + 3, width: dayWidth - 6, height: task.duration * SCALE - 3 }}
        onToggleImportant={() => setTask(value => ({ ...value, important: !value.important }))}
        onBegin={begin} onMove={update} onDrop={drop} onCancel={cancel} onOpen={() => {}} onUnlock={() => {}} />
      {drag?.position && <View pointerEvents="none" style={{ position: 'absolute', top: (drag.position.start - START) * SCALE + 1, left: GUTTER + DATES.indexOf(drag.position.date) * dayWidth + 3,
        width: dayWidth - 6, height: task.duration * SCALE - 3, borderWidth: 2, borderColor: c.purple, borderRadius: 6, backgroundColor: c.lavender, padding: 4 }}>
        <Label style={{ color: c.purpleDark, fontSize: 10 }}>{clock(drag.position.start)}</Label><Label style={{ color: c.purpleDark, fontSize: 11 }}>{task.title}</Label>
      </View>}
    </View>
    <Button title="还原示例" variant="ghost" small disabled={!!drag || !moved && !task.important} onPress={() => { setTask(INITIAL); setMoved(false); }} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
  </View>;
}
