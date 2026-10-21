import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { usePlanning } from '../store';
import { colors as c } from '../theme';
import { clock, durationText } from '../utils';
import { addDays, layoutDay, moveTaskTo, outsidePreferredHours, overlapConsentKey, positionFromPoint, validDate, weekDates, type TaskPosition } from '../week';
import type { Task } from '../types';
import { calendarSegments, nonPreferredRanges, type CalendarSegment } from '../time';
import { Button, Chip, Confirm, Dialog, FieldTitle, Icon, Label } from '../components/ui';
import { TaskEditor } from '../components/TaskEditor';
import { WeekTaskCard } from '../components/WeekTaskCard';
import { WeekTaskDetails } from '../components/WeekTaskDetails';
import { isQuick } from '../quick';

const GUTTER = 44;
const HEADER = 53;
const startMinute = 0;
const endMinute = 1440;
const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
type Rect = { x: number; y: number; width: number; height: number };
type DragSession = { task: Task; grabOffset: number; x: number; y: number; allowedFixed: boolean; rollover: boolean };
type DragPreview = { task: Task; position: TaskPosition | null; error: string | null; hasOverlap: boolean };
type MoveRequest = { task: Task; position: TaskPosition; allowFixed: boolean; confirmFixed: boolean; conflicts: Task[]; consentKey: string };

export default function Week() {
  const { data, today, now, applyPlan, notify, toggleImportant } = usePlanning();
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate = typeof params.date === 'string' && validDate(params.date) ? params.date : today;
  const { width } = useWindowDimensions();
  const compact = width < 600;
  const [anchor, setAnchor] = useState(initialDate);
  const [expanded, setExpanded] = useState(false);
  const [showTray, setShowTray] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [boardSize, setBoardSize] = useState({ width: 0, height: 350 });
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [unlockRequest, setUnlockRequest] = useState<Task | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [editor, setEditor] = useState<{ task?: Task } | null>(null);
  const board = useRef<React.ComponentRef<typeof View>>(null);
  const horizontal = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const vertical = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const viewport = useRef<Rect | null>(null);
  const offsets = useRef({ x: 0, y: 0 });
  const session = useRef<DragSession | null>(null);
  const latestPreview = useRef<DragPreview | null>(null);
  const scrollLayout = useRef<{ week: string; scale: number } | null>(null);
  const dragGeneration = useRef(0);
  const dates = useMemo(() => weekDates(anchor), [anchor]);
  const inWeek = useCallback((date: string | null) => !!date && date >= dates[0] && date <= dates[6], [dates]);
  const segments = useMemo(() => data.tasks.flatMap(calendarSegments).filter(segment => inWeek(segment.date)), [data.tasks, inWeek]);
  const weekTasks = useMemo(() => data.tasks.filter(task => inWeek(task.date) || segments.some(segment => segment.task.id === task.id)), [data.tasks, inWeek, segments]);
  const scheduled = weekTasks.filter(task => task.start !== null);
  const pending = data.tasks.filter(task => !task.completed && (!task.date || inWeek(task.date) && task.start === null));
  const selectedTask = data.tasks.find(task => task.id === selected);
  const unlockedTask = data.tasks.find(task => task.id === unlocked);
  // Keep roughly ten hours in view, with a readable minimum on shorter screens.
  const hourHeight = Math.max(56, Math.min(84, (boardSize.height - HEADER - 2) / 10));
  const pixelsPerMinute = (expanded ? Math.max(84, hourHeight * 1.25) : hourHeight) / 60;
  const contentHeight = (endMinute - startMinute) * pixelsPerMinute;
  const availableWidth = (boardSize.width || Math.max(320, width - (width >= 1000 ? 278 : 32))) - 2;
  const dayWidth = Math.max(expanded ? 104 : 28, (availableWidth - GUTTER) / 7);
  const gridWidth = GUTTER + dayWidth * 7;
  const hours = Array.from({ length: (endMinute - startMinute) / 60 + 1 }, (_, index) => startMinute + index * 60);
  const dragging = !!drag;
  const totalMinutes = scheduled.reduce((sum, task) => sum + task.duration, 0);

  function measureBoard() {
    board.current?.measureInWindow((x, y, measuredWidth, height) => {
      viewport.current = { x, y, width: measuredWidth, height };
    });
  }

  const updatePreview = useCallback((x: number, y: number) => {
    const active = session.current;
    const bounds = viewport.current;
    if (!active || !bounds) return;
    active.x = x; active.y = y;
    const inside = x >= bounds.x + GUTTER && x < bounds.x + bounds.width
      && y >= bounds.y + HEADER && y < bounds.y + bounds.height;
    const position = inside ? positionFromPoint({
      x: x - bounds.x + offsets.current.x - GUTTER,
      y: y - bounds.y - HEADER + offsets.current.y,
      dayWidth, dates, startMinute, endMinute, pixelsPerMinute: pixelsPerMinute, grabOffset: active.grabOffset, rollover: active.rollover,
    }) : null;
    const validation = position ? moveTaskTo(data.tasks, active.task.id, position, data.settings, today, active.allowedFixed, false, false, now) : null;
    const preview = { task: active.task, position, error: validation && !validation.ok && !validation.confirmation ? validation.error : null,
      hasOverlap: !!validation && !validation.ok && validation.confirmation === 'overlap' };
    latestPreview.current = preview;
    setDrag(preview);
  }, [data.tasks, data.settings, today, now, dayWidth, dates, pixelsPerMinute]);

  const cancelDrag = useCallback(() => {
    if (session.current?.task.fixed) setUnlocked(null);
    dragGeneration.current += 1;
    session.current = null;
    latestPreview.current = null;
    setDrag(null);
  }, []);

  function beginDrag(task: Task, x: number, y: number, segment?: CalendarSegment) {
    if (task.completed || task.fixed && unlocked !== task.id) return;
    const generation = ++dragGeneration.current;
    board.current?.measureInWindow((left, top, measuredWidth, height) => {
      if (generation !== dragGeneration.current) return;
      viewport.current = { x: left, y: top, width: measuredWidth, height };
      const grabOffset = segment
        ? segment.offset * pixelsPerMinute + Math.max(0, Math.min((isQuick(task) ? 36 : segment.duration * pixelsPerMinute) - 2,
          y - top - HEADER + offsets.current.y - segment.start * pixelsPerMinute)) : 12;
      session.current = { task, grabOffset, x, y, allowedFixed: task.fixed && unlocked === task.id, rollover: !!segment?.offset };
      updatePreview(x, y);
    });
  }

  function commitMove(task: Task, position: TaskPosition, allowFixed: boolean, allowOutsidePreferences = false, allowOverlap = false): string | null {
    const result = moveTaskTo(data.tasks, task.id, position, data.settings, today, allowFixed, allowOutsidePreferences, allowOverlap, now);
    if (!result.ok) return result.error;
    if (!result.change) { notify('仍在原来的位置，没有修改日程。'); return null; }
    if (!applyPlan({ sourceTasks: data.tasks, sourceSettings: data.settings, tasks: result.tasks, changes: [result.change], warnings: result.warnings,
      valid: true, deferred: 0, finish: position.start + task.duration, extension: 0 }, `周览调整：${task.title}`)) return '日程已变更，请重新选择位置。';
    notify(`已移到 ${position.date.slice(5).replace('-', '/')} ${clock(position.start)}${task.fixed ? '，已重新锁定' : ''}。${result.warnings.length ? result.warnings.join('；') : '可在回顾中撤销。'}`);
    return null;
  }

  function requestMove(task: Task, position: TaskPosition, allowFixed: boolean, confirmFixed = false): string | null {
    // Preview exceptions without applying them; consent belongs to this exact manual placement.
    const result = moveTaskTo(data.tasks, task.id, position, data.settings, today, allowFixed, true, true, now);
    if (!result.ok) return result.error;
    if (result.change && (confirmFixed || result.conflicts.length || !isQuick(task) && outsidePreferredHours(position.start, task.duration, data.settings))) {
      setMoveRequest({ task, position, allowFixed, confirmFixed, conflicts: result.conflicts,
        consentKey: overlapConsentKey(result.tasks.find(item => item.id === task.id)!, result.conflicts) });
      return null;
    }
    return commitMove(task, position, allowFixed);
  }

  function confirmMove() {
    if (!moveRequest) return;
    const { task, position, allowFixed } = moveRequest;
    const current = moveTaskTo(data.tasks, task.id, position, data.settings, today, allowFixed, true, true, now);
    if (!current.ok) { notify(current.error); setMoveRequest(null); setUnlocked(null); return; }
    const updated = current.tasks.find(item => item.id === task.id)!;
    const consentKey = overlapConsentKey(updated, current.conflicts);
    if (current.change && consentKey !== moveRequest.consentKey) {
      setMoveRequest({ ...moveRequest, task: data.tasks.find(item => item.id === task.id)!, conflicts: current.conflicts, consentKey });
      notify('日程已变化，请重新确认这次安排。'); return;
    }
    const error = commitMove(task, position, allowFixed, true, moveRequest.conflicts.length > 0);
    if (error) notify(error);
    setMoveRequest(null); setUnlocked(null);
  }

  function drop() {
    const active = session.current;
    const preview = latestPreview.current;
    if (active?.task.fixed) setUnlocked(null);
    cancelDrag();
    if (!active || !preview?.position) { notify('已取消移动，任务保留原位置。'); return; }
    const error = requestMove(active.task, preview.position, active.allowedFixed);
    if (error) notify(error);
  }

  // Scroll near the grid edges so a long drag can reach hidden hours and columns.
  useEffect(() => {
    if (!dragging) return;
    const timer = setInterval(() => {
      const active = session.current;
      const bounds = viewport.current;
      if (!active || !bounds) return;
      let dx = 0, dy = 0;
      const x = active.x - bounds.x, y = active.y - bounds.y - HEADER;
      if (x < GUTTER + 25 && x >= 0) dx = -12;
      if (x > bounds.width - 25 && x < bounds.width + 20) dx = 12;
      if (y < 35 && y > -15) dy = -12;
      if (y > bounds.height - HEADER - 35 && y < bounds.height - HEADER + 15) dy = 12;
      const nextX = Math.max(0, Math.min(Math.max(0, gridWidth - bounds.width), offsets.current.x + dx));
      const nextY = Math.max(0, Math.min(Math.max(0, contentHeight + 40 - (bounds.height - HEADER)), offsets.current.y + dy));
      if (nextX === offsets.current.x && nextY === offsets.current.y) return;
      offsets.current = { x: nextX, y: nextY };
      horizontal.current?.scrollTo({ x: nextX, animated: false });
      vertical.current?.scrollTo({ y: nextY, animated: false });
      updatePreview(active.x, active.y);
    }, 40);
    return () => clearInterval(timer);
  }, [dragging, gridWidth, contentHeight, updatePreview]);

  function requestUnlock(task: Task) {
    setSelected(null);
    setUnlockRequest(task);
  }

  function changeWeek(amount: number) {
    setAnchor(addDays(dates[0], amount * 7));
    setUnlocked(null);
    cancelDrag();
  }

  function detailSave(position: TaskPosition): string | null {
    if (!selectedTask) return '这项任务已经不存在。';
    const error = requestMove(selectedTask, position, selectedTask.fixed, selectedTask.fixed);
    if (!error) setSelected(null);
    return error;
  }

  function initializeScroll() {
    if (!boardSize.width || !vertical.current) return;
    const previous = scrollLayout.current;
    if (previous?.week === dates[0] && previous.scale === pixelsPerMinute) return;
    // Resizing changes the scale, so preserve the time at the top instead of its pixel offset.
    const firstMinute = previous?.week === dates[0] ? offsets.current.y / previous.scale
      : Math.max(0, Math.min(data.settings.dayStart, ...scheduled.map(task => task.start!)) - 60);
    const y = Math.max(0, Math.min(contentHeight + 40 - (boardSize.height - HEADER - 2), firstMinute * pixelsPerMinute));
    scrollLayout.current = { week: dates[0], scale: pixelsPerMinute };
    offsets.current.y = y;
    vertical.current.scrollTo({ y, animated: false });
    measureBoard();
  }

  return <View style={{ flex: 1, minHeight: 0, padding: compact ? 8 : 16, paddingBottom: 4 }}>
    <View style={{ height: 42, flexDirection: 'row', alignItems: 'center', gap: compact ? 5 : 12, marginBottom: 8 }}>
      <Label style={{ fontSize: 17, fontWeight: '700', marginRight: compact ? 2 : 8 }}>周览</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="上一周" disabled={dragging} onPress={() => changeWeek(-1)} style={{ padding: compact ? 4 : 8 }}><Icon name="chevron-left" size={18} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="回到本周" disabled={dragging} onPress={() => { setAnchor(today); setUnlocked(null); }} style={{ paddingVertical: 7, paddingHorizontal: 2 }}>
          <Label style={{ fontSize: compact ? 12 : 14, fontWeight: '500' }}>{!compact ? `${dates[0].slice(0, 4)} / ` : ''}{Number(dates[0].slice(5, 7))}.{Number(dates[0].slice(8))} – {Number(dates[6].slice(5, 7))}.{Number(dates[6].slice(8))}</Label>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="下一周" disabled={dragging} onPress={() => changeWeek(1)} style={{ padding: compact ? 4 : 8 }}><Icon name="chevron-right" size={18} /></Pressable>
      </View>
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" accessibilityLabel={showTray ? '收起待安排任务' : '展开待安排任务'} disabled={dragging} onPress={() => setShowTray(!showTray)} style={{ height: 34, minWidth: 38, paddingHorizontal: 6, borderRadius: 9, backgroundColor: showTray ? c.lavender : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Icon name="inbox" size={17} color={showTray ? c.purple : c.muted} /><Label muted style={{ fontSize: 10 }}>{pending.length}</Label>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="添加任务" disabled={dragging} onPress={() => setEditor({})} style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c.purple, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={19} color="#fff" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="周览显示选项" disabled={dragging} onPress={() => setShowOptions(true)} style={{ width: 30, height: 34, alignItems: 'center', justifyContent: 'center' }}><Icon name="sliders" size={17} /></Pressable>
    </View>

    {showTray && pending.length > 0 && <View style={{ marginBottom: 8 }}>
      <ScrollView horizontal scrollEnabled={!dragging} showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {pending.map(task => <WeekTaskCard key={task.id} task={task} small={false} tray unlocked={unlocked === task.id} dragging={drag?.task.id === task.id}
          style={{ width: compact ? 160 : 195, height: task.date ? 76 : 61 }} onOpen={() => setSelected(task.id)} onUnlock={() => requestUnlock(task)}
          onToggleImportant={() => toggleImportant(task.id)} onBegin={(x, y) => beginDrag(task, x, y)} onMove={updatePreview} onDrop={drop} onCancel={cancelDrag} />)}
      </ScrollView>
    </View>}

    <View ref={board} testID="week-board" onLayout={event => { setBoardSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }); measureBoard(); }}
      style={{ flex: 1, minHeight: 160, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: c.border, overflow: 'hidden' }}>
      <ScrollView ref={horizontal} horizontal scrollEnabled={!dragging} nestedScrollEnabled scrollEventThrottle={16}
        onScroll={event => { offsets.current.x = event.nativeEvent.contentOffset.x; }} showsHorizontalScrollIndicator={expanded}
        contentContainerStyle={{ width: gridWidth, height: boardSize.height }}>
        <View style={{ width: gridWidth, height: boardSize.height }}>
          <View style={{ height: HEADER, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E5E3ED', backgroundColor: '#FCFBFE' }}>
            <View style={{ width: GUTTER, alignItems: 'center', justifyContent: 'center' }}><Label muted style={{ fontSize: 8 }}>时间</Label></View>
            {dates.map((date, index) => <View key={date} style={{ width: dayWidth, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: c.border, backgroundColor: date === today ? '#F1EDFA' : 'transparent' }}>
              <Label style={{ fontSize: 10, color: date === today ? c.purple : c.muted }}>{DAYS[index]}</Label>
              <Label style={{ fontSize: 14, lineHeight: 22, fontWeight: '600', color: date === today ? c.purpleDark : c.text }}>{Number(date.slice(8))}<Label style={{ fontSize: 8, color: c.purple }}>{date === today ? ' · 今' : ''}</Label></Label>
            </View>)}
          </View>
          <ScrollView key={dates[0]} ref={vertical} testID="week-time-scroll" scrollEnabled={!dragging} nestedScrollEnabled scrollEventThrottle={16}
            onScroll={event => { offsets.current.y = event.nativeEvent.contentOffset.y; }} onContentSizeChange={initializeScroll} style={{ flex: 1 }}>
            <View testID="week-time-grid" style={{ height: contentHeight + 40, width: gridWidth }}>
              {dates.map((date, index) => <View pointerEvents="none" key={date} style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER + index * dayWidth, width: dayWidth, borderLeftWidth: 1, borderLeftColor: '#EEEDF3', backgroundColor: date === today ? '#FCFAFF' : index >= 5 ? '#FCFCFD' : '#fff' }} />)}
              {nonPreferredRanges(data.settings).map(range => <View key={range.start} pointerEvents="none" style={{ position: 'absolute', left: GUTTER, right: 0, top: range.start * pixelsPerMinute, height: (range.end - range.start) * pixelsPerMinute, backgroundColor: 'rgba(100,95,115,0.045)' }} />)}
              {hours.map(minute => <View pointerEvents="none" key={minute} style={{ position: 'absolute', left: 0, right: 0, top: (minute - startMinute) * pixelsPerMinute }}>
                <View style={{ position: 'absolute', left: GUTTER, right: 0, height: 1, backgroundColor: '#ECEAF2' }} />
                {minute < endMinute && <View style={{ position: 'absolute', left: GUTTER, right: 0, top: 30 * pixelsPerMinute, height: 1, backgroundColor: '#F5F4F8' }} />}
                <Label style={{ position: 'absolute', left: 4, top: minute === startMinute ? 1 : -7, fontSize: 9, lineHeight: 14, color: c.faint }}>{clock(minute)}</Label>
              </View>)}
              {dates.flatMap((date, dayIndex) => layoutDay(segments.filter(segment => segment.date === date).map(segment => ({ ...segment.task, date, start: segment.start, duration: segment.duration })), 36 / pixelsPerMinute).map(({ task: piece, lane, lanes }) => {
                const segment = segments.find(item => item.task.id === piece.id && item.date === date)!;
                const task = segment.task;
                const cardHeight = isQuick(task) ? 36 : Math.max(12, segment.duration * pixelsPerMinute - 3);
                return <WeekTaskCard key={`${task.id}-${date}`} task={task} overlapping={lanes > 1} displayStart={segment.start} continuation={segment.offset > 0} small={dayWidth / lanes < 90} availableHeight={cardHeight} unlocked={unlocked === task.id} dragging={drag?.task.id === task.id}
                style={{ position: 'absolute', top: (segment.start - startMinute) * pixelsPerMinute + 2,
                  left: GUTTER + dayIndex * dayWidth + lane * (dayWidth - 4) / lanes + 2,
                  width: (dayWidth - 4) / lanes - 1, height: cardHeight, zIndex: drag?.task.id === task.id ? 2 : 1 }}
                onToggleImportant={() => toggleImportant(task.id)} onOpen={() => setSelected(task.id)} onUnlock={() => requestUnlock(task)} onBegin={(x, y) => beginDrag(task, x, y, segment)} onMove={updatePreview} onDrop={drop} onCancel={cancelDrag} />;
              }))}
              {dates.includes(today) && now >= startMinute && now < endMinute && <View pointerEvents="none" style={{ position: 'absolute', top: (now - startMinute) * pixelsPerMinute, left: GUTTER + dates.indexOf(today) * dayWidth, width: dayWidth, height: 1, backgroundColor: '#B292D6', zIndex: 3 }}><View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#A383C8', marginTop: -2 }} /></View>}
              {drag?.position && calendarSegments({ ...drag.task, ...drag.position }).filter(segment => inWeek(segment.date)).map(segment => <View key={segment.date} pointerEvents="none" testID="week-drag-preview" style={{ position: 'absolute', top: (segment.start - startMinute) * pixelsPerMinute,
                left: GUTTER + dates.indexOf(segment.date) * dayWidth + 2, width: dayWidth - 5,
                height: isQuick(drag.task) ? 36 : Math.max(18, segment.duration * pixelsPerMinute - 2), borderWidth: 2, borderStyle: 'dashed',
                borderColor: drag.error ? c.red : c.purple, backgroundColor: drag.error ? 'rgba(251,239,240,0.9)' : 'rgba(231,221,249,0.9)', borderRadius: 7, zIndex: 5, padding: 4 }}>
                <Label numberOfLines={1} style={{ fontSize: 9, lineHeight: 14, fontWeight: '600', color: drag.error ? c.red : c.purpleDark }}>{segment.offset ? '续 · ' : ''}{clock(segment.start)}</Label><Label numberOfLines={3} style={{ fontSize: dayWidth < 90 ? 9 : 11, lineHeight: 14, color: drag.error ? c.red : c.purpleDark }}>{drag.task.title}</Label>
              </View>)}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
      {(drag || unlockedTask) && <View pointerEvents={drag ? 'none' : 'box-none'} style={{ position: 'absolute', bottom: 10, left: GUTTER + 8, right: 10, alignItems: 'center', zIndex: 20 }}>
        <View style={{ maxWidth: 480, borderRadius: 11, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: drag?.error ? '#F9E8EB' : unlockedTask ? '#FFF3DF' : '#EEE7FA', flexDirection: 'row', alignItems: 'center', gap: 8, boxShadow: '0px 3px 16px rgba(40,25,60,0.10)' }}>
          <Icon name={drag?.error ? 'alert-circle' : unlockedTask ? 'unlock' : 'move'} size={14} color={drag?.error ? c.red : unlockedTask ? c.orange : c.purple} />
          <Label numberOfLines={2} accessibilityLiveRegion="polite" style={{ flexShrink: 1, fontSize: 11, lineHeight: 18, color: drag?.error ? c.red : unlockedTask ? c.orange : c.purpleDark }}>
            {drag ? drag.error ?? (drag.position ? `${DAYS[dates.indexOf(drag.position.date)]} ${clock(drag.position.start)}${isQuick(drag.task) ? ' · 提醒' : `–${clock(drag.position.start + drag.task.duration)}`}${drag.hasOverlap ? ' · 时间重叠，放下后需确认' : ''}${!isQuick(drag.task) && outsidePreferredHours(drag.position.start, drag.task.duration, data.settings) ? ' · 非偏好时段，放下后需确认' : ''}` : '拖进网格即可安排，网格外松手取消') : `「${unlockedTask?.title}」已解锁一次拖动`}
          </Label>
          {unlockedTask && !drag && <Button title="取消" variant="ghost" small onPress={() => setUnlocked(null)} />}
        </View>
      </View>}
    </View>
    <View style={{ height: 23, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {([['工作', '#BCAADF'], ['生活', '#DAC09B'], ...(data.tasks.some(isQuick) ? [['小事', '#BCAADF']] : []), ...(data.tasks.some(task => task.category === 'health') ? [['健康', '#AAC6B1']] : [])]).map(([label, color]) => <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: color }} /><Label muted style={{ fontSize: 9 }}>{label}</Label></View>)}
      <Label numberOfLines={1} muted style={{ flex: 1, fontSize: 9, textAlign: 'right' }}>{Platform.OS === 'web' ? '拖动调整 · 固定需解锁' : '长按拖动 · 固定需解锁'}</Label>
    </View>

    <Dialog visible={showOptions} title="周览显示" onClose={() => setShowOptions(false)} footer={<Button title="完成" onPress={() => setShowOptions(false)} />}>
      <Label muted style={{ fontSize: 12 }}>{dates[0].slice(0, 4)} 年 · 本周 {scheduled.length} 项安排 · {durationText(totalMinutes)}</Label>
      <FieldTitle>表格密度</FieldTitle><View style={{ flexDirection: 'row', gap: 9 }}><Chip title="自适应" icon="grid" selected={!expanded} onPress={() => setExpanded(false)} /><Chip title="大卡片" icon="columns" selected={expanded} onPress={() => setExpanded(true)} /></View>
      <Label muted style={{ fontSize: 11, marginTop: 18 }}>时间轴保留 00:00–24:00，上下滑动查看。浅灰区域在偏好时段之外，手动安排到这些时间会先请你确认；自动安排仍按偏好设置执行。</Label>
      <Label muted style={{ fontSize: 11, marginTop: 9 }}>自适应模式按屏幕可用高度调整时间行高，七天列宽随屏幕变化。大卡片适合仔细调整，可上下、左右滚动。拖到边缘时表格会自动滚动，放下后按 15 分钟吸附。</Label>
      <Label muted style={{ fontSize: 11, marginTop: 9 }}>固定事项默认锁定，确认解锁后仅可移动一次。所有有效移动都可以在回顾中撤销。</Label>
      <Label muted style={{ fontSize: 11, marginTop: 9 }}>手动安排可在确认后重叠显示；自动排程始终避开已占用的时间。</Label>
      <Button title="回到本周" variant="secondary" small onPress={() => { setAnchor(today); setUnlocked(null); setShowOptions(false); }} style={{ alignSelf: 'flex-start', marginTop: 18 }} />
    </Dialog>

    {selectedTask && <WeekTaskDetails key={selectedTask.id} task={selectedTask} fallbackDate={dates.includes(today) ? today : dates[0]} fallbackStart={data.settings.dayStart}
      onClose={() => setSelected(null)} onSave={detailSave} onUnlock={() => requestUnlock(selectedTask)} onEdit={() => { setEditor({ task: selectedTask }); setSelected(null); }} />}
    <Confirm visible={!!unlockRequest} title="允许这次移动固定事项？"
      description={`「${unlockRequest?.title ?? ''}」默认锁定。确认后只允许一次拖动；无论移动成功或发生冲突，放下后都会重新锁定，固定属性保持不变。`}
      action="确认，解锁一次拖动" onClose={() => setUnlockRequest(null)} onConfirm={() => { setUnlocked(unlockRequest!.id); setUnlockRequest(null); notify('已解锁一次拖动，放下后会重新锁定。'); }} />
    <Confirm visible={!!moveRequest} title={moveRequest?.conflicts.length ? '同时安排这几件事？' : moveRequest?.confirmFixed ? '确认修改固定事项的时间？' : moveRequest && outsidePreferredHours(moveRequest.position.start, moveRequest.task.duration, data.settings) ? '安排到非偏好时段？' : '确认调整时间？'}
      description={`「${moveRequest?.task.title ?? ''}」将安排到 ${moveRequest?.position.date ?? ''} ${moveRequest ? `${clock(moveRequest.position.start)}–${clock(moveRequest.position.start + moveRequest.task.duration)}` : ''}。${moveRequest?.conflicts.length ? `与${moveRequest.conflicts.map(item => `「${item.title}」`).join('、')}时间重叠。确认后保留这些安排，自动排程仍避开已占用的时段。` : ''}${moveRequest && outsidePreferredHours(moveRequest.position.start, moveRequest.task.duration, data.settings) ? `这超出了你的偏好时段 ${clock(data.settings.dayStart)}–${clock(data.settings.dayEnd)}。确认只对这次手动调整生效，自动安排仍遵循原偏好。` : ''}${moveRequest?.task.fixed ? '保存后仍是固定事项，并保持锁定。' : ''}取消会保留原位置。`}
      action={moveRequest?.conflicts.length ? '确认重叠安排' : moveRequest?.confirmFixed ? '确认移动固定事项' : '仍然安排到这里'} onClose={() => setMoveRequest(null)} onConfirm={confirmMove} />
    <TaskEditor visible={!!editor} task={editor?.task} initialDate={dates.includes(today) ? today : dates[0]} onClose={() => setEditor(null)} />
  </View>;
}
