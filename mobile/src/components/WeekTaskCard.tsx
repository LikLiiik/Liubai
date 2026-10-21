import React from 'react';
import { PanResponder, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Task } from '../types';
import { clock, durationText } from '../utils';
import { Icon, Label } from './ui';
import { isQuick } from '../quick';
import { ImportantButton } from './ImportantButton';
import { weekCardDensity } from '../weekZoom';

type Props = {
  task: Task;
  style?: StyleProp<ViewStyle>;
  small: boolean;
  overlapping?: boolean;
  tray?: boolean;
  availableHeight?: number;
  availableWidth?: number;
  displayStart?: number;
  displayDuration?: number;
  interactionBlocked?: boolean;
  gestureBlocked?: () => boolean;
  continuation?: boolean;
  unlocked: boolean;
  dragging: boolean;
  onOpen: () => void;
  onToggleImportant: () => void;
  onUnlock: () => void;
  onBegin: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onDrop: () => void;
  onCancel: () => void;
};

export class WeekTaskCard extends React.PureComponent<Props, { highlight: boolean }> {
  state = { highlight: false };
  private armed = false;
  private moving = false;
  private suppressPressUntil = 0;
  private responder: ReturnType<typeof PanResponder.create>;
  private blocked = () => !!this.props.interactionBlocked || !!this.props.gestureBlocked?.();

  constructor(props: Props) {
    super(props);
    this.responder = PanResponder.create({
    onStartShouldSetPanResponderCapture: event => Platform.OS === 'web' && !this.blocked() && event.nativeEvent.touches.length < 2 && !this.props.task.completed
      && (!this.props.task.fixed || this.props.unlocked),
    onMoveShouldSetPanResponderCapture: (event, gesture) => !this.blocked() && event.nativeEvent.touches.length < 2 && this.armed && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderGrant: (_, gesture) => {
      this.moving = false;
      if (this.blocked()) return;
      this.props.onBegin(gesture.x0, gesture.y0);
    },
    onPanResponderMove: (event, gesture) => {
      if (this.blocked() || event.nativeEvent.touches.length >= 2) { this.props.onCancel(); this.armed = false; this.moving = false; return; }
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5) this.moving = true;
      this.props.onMove(gesture.moveX, gesture.moveY);
    },
    onPanResponderRelease: () => {
      this.suppressPressUntil = Date.now() + 180;
      if (this.blocked()) this.props.onCancel();
      else if (this.moving) this.props.onDrop();
      else { this.props.onCancel(); this.props.onOpen(); }
      this.armed = false;
      this.setState({ highlight: false });
    },
    onPanResponderTerminate: () => {
      this.suppressPressUntil = Date.now() + 180;
      this.props.onCancel();
      this.armed = false;
      this.setState({ highlight: false });
    },
    onPanResponderTerminationRequest: event => this.blocked() || event.nativeEvent.touches.length >= 2,
    onShouldBlockNativeResponder: () => true,
    });
  }

  render() {
  const { task, small, tray, unlocked, dragging, style, availableHeight, availableWidth, displayStart, displayDuration, continuation } = this.props;
  const { highlight } = this.state;
  const quick = isQuick(task);
  const locked = task.fixed && !unlocked;
  const palette = task.completed ? ['#F2F3F5', '#C9CED4', '#939AA4']
    : unlocked ? ['#FFF5E5', '#DBB16C', '#9B7134']
    : task.category === 'health' ? ['#EAF3ED', '#AAC6B1', '#52785E']
    : task.category === 'life' ? ['#FAF1E5', '#DAC09B', '#9C7950']
    : ['#EEE9FA', '#BCAADF', '#6D55A3'];
  const density = weekCardDensity(availableWidth ?? (small ? 44 : 150), availableHeight ?? (tray ? 70 : 90), quick);
  const starSize = density.star === 'button' ? 26 : 10;
  const showStar = density.star === 'button';
  const indicator = density.star === 'indicator' && task.important;
  const start = displayStart ?? task.start ?? 0;
  return <View style={style}>
    <View {...this.responder.panHandlers} style={{ flex: 1 }}><Pressable
      accessibilityRole="button"
      accessibilityLabel={`${quick ? '顺手小事' : locked ? '固定事项（已锁定）' : '任务'}：${task.title}${task.start !== null ? `，${clock(start)}` : '，待安排'}${task.important ? '，重点' : ''}`}
      testID={`week-task-${task.id}`}
      onPress={() => { if (!this.blocked() && Date.now() >= this.suppressPressUntil) this.props.onOpen(); }}
      onLongPress={event => {
        if (this.blocked() || event.nativeEvent.touches.length >= 2 || task.completed) return;
        if (locked) { this.props.onUnlock(); return; }
        this.armed = true;
        this.setState({ highlight: true });
      }}
      onPressOut={() => { if (!this.props.dragging) { this.armed = false; this.setState({ highlight: false }); } }}
      delayLongPress={300}
      style={{ flex: 1, borderRadius: quick ? 10 : tray ? 9 : 6, paddingHorizontal: density.tiny ? 1 : small ? 3 : 6, paddingVertical: density.padding,
        backgroundColor: palette[0], borderColor: highlight || unlocked ? palette[2] : palette[1],
        borderWidth: 1, borderStyle: quick ? 'dashed' : 'solid', borderLeftWidth: quick || tray ? 1 : 3,
        borderLeftColor: task.important && density.star === 'hidden' ? '#C58C3E' : palette[1], opacity: dragging ? 0.4 : task.completed ? 0.7 : 1,
        overflow: 'hidden', ...(Platform.OS === 'web' ? { cursor: task.completed ? 'pointer' : locked ? 'pointer' : 'grab', userSelect: 'none', touchAction: 'none' } as ViewStyle : {}) }}>
      <View pointerEvents="none" style={{ flex: 1, paddingRight: showStar ? starSize - 2 : indicator ? 10 : 0 }}>
        {density.time && <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', marginBottom: 3 }}>
          {quick && <Icon name="bell" size={small ? 8 : 10} color={palette[2]} />}
          {task.fixed && <Icon name={unlocked ? 'unlock' : 'lock'} size={small ? 9 : 10} color={palette[2]} />}
          {task.completed && <Icon name="check" size={10} color={palette[2]} />}
          <Label numberOfLines={1} style={{ fontSize: small ? 8 : 9, lineHeight: 13, color: palette[2], flex: 1 }}>
            {tray ? durationText(task.duration) : `${continuation ? '续 · ' : ''}${clock(start)}${density.detailed ? `–${clock(start + (displayDuration ?? task.duration))}` : ''}`}
          </Label>
        </View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2 }}>
          <Label numberOfLines={tray ? 2 : density.titleLines} style={{ flex: 1, fontSize: density.fontSize, lineHeight: density.lineHeight, color: palette[2], fontWeight: '500', textDecorationLine: task.completed ? 'line-through' : 'none' }}>{quick && !density.time && (availableWidth ?? 0) >= 84 ? `${clock(start)} · ` : ''}{!density.time && continuation ? '续 · ' : ''}{task.title}</Label>
        </View>
        {density.metadata && !tray && <Label numberOfLines={1} style={{ fontSize: 10, lineHeight: 16, color: palette[2] }}>{durationText(displayDuration ?? task.duration)}{task.fixed ? ' · 固定' : task.completed ? ' · 已完成' : ''}</Label>}
        {density.notes && !!task.notes.trim() && !tray && <Label numberOfLines={2} style={{ fontSize: 10, lineHeight: 15, opacity: 0.8, color: palette[2] }}>{task.notes.trim()}</Label>}
        {tray && task.date && <Label style={{ fontSize: 9, color: palette[2], lineHeight: 15, paddingRight: starSize }}>{task.date.slice(5).replace('-', '/')} · 待安排</Label>}
      </View>
    </Pressable></View>
    {showStar && <ImportantButton title={task.title} important={task.important} onPress={() => { if (!this.blocked()) this.props.onToggleImportant(); }} size={starSize} disabled={dragging || !!this.props.interactionBlocked}
      style={{ position: 'absolute', top: 1, right: 1 }} />}
    {indicator && <Label pointerEvents="none" accessible={false} style={{ position: 'absolute', right: 2, top: 1, fontSize: 9, lineHeight: 11, color: '#C58C3E' }}>★</Label>}
  </View>;
  }
}
