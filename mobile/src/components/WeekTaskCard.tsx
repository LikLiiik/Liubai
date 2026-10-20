import React from 'react';
import { PanResponder, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { Task } from '../types';
import { clock } from '../utils';
import { Icon, Label } from './ui';

type Props = {
  task: Task;
  style?: StyleProp<ViewStyle>;
  small: boolean;
  tray?: boolean;
  availableHeight?: number;
  displayStart?: number;
  continuation?: boolean;
  unlocked: boolean;
  dragging: boolean;
  onOpen: () => void;
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
  private responder: ReturnType<typeof PanResponder.create>;

  constructor(props: Props) {
    super(props);
    this.responder = PanResponder.create({
    onStartShouldSetPanResponderCapture: () => Platform.OS === 'web' && !this.props.task.completed
      && (!this.props.task.fixed || this.props.unlocked),
    onMoveShouldSetPanResponderCapture: (_, gesture) => this.armed && Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5,
    onPanResponderGrant: (_, gesture) => {
      this.moving = false;
      this.props.onBegin(gesture.x0, gesture.y0);
    },
    onPanResponderMove: (_, gesture) => {
      if (Math.abs(gesture.dx) + Math.abs(gesture.dy) > 5) this.moving = true;
      this.props.onMove(gesture.moveX, gesture.moveY);
    },
    onPanResponderRelease: () => {
      if (this.moving) this.props.onDrop();
      else { this.props.onCancel(); this.props.onOpen(); }
      this.armed = false;
      this.setState({ highlight: false });
    },
    onPanResponderTerminate: () => {
      this.props.onCancel();
      this.armed = false;
      this.setState({ highlight: false });
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    });
  }

  render() {
  const { task, small, tray, unlocked, dragging, style, availableHeight, displayStart, continuation } = this.props;
  const { highlight } = this.state;
  const locked = task.fixed && !unlocked;
  const palette = task.completed ? ['#F2F3F5', '#C9CED4', '#939AA4']
    : unlocked ? ['#FFF5E5', '#DBB16C', '#9B7134']
    : task.category === 'health' ? ['#EAF3ED', '#AAC6B1', '#52785E']
    : task.category === 'life' ? ['#FAF1E5', '#DAC09B', '#9C7950']
    : ['#EEE9FA', '#BCAADF', '#6D55A3'];
  const short = !tray && (availableHeight ?? task.duration * 64 / 60) < 52;
  const textLines = tray ? 2 : Math.max(1, Math.min(4, Math.floor(((availableHeight ?? 90) - (short ? 3 : 24)) / (small ? 12 : 16))));
  return <View {...this.responder.panHandlers} style={style}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${locked ? '固定事项（已锁定）' : '任务'}：${task.title}${task.start !== null ? `，${clock(task.start)}` : '，待安排'}`}
      testID={`week-task-${task.id}`}
      onPress={this.props.onOpen}
      onLongPress={() => {
        if (task.completed) return;
        if (locked) { this.props.onUnlock(); return; }
        this.armed = true;
        this.setState({ highlight: true });
      }}
      onPressOut={() => { if (!this.props.dragging) { this.armed = false; this.setState({ highlight: false }); } }}
      delayLongPress={300}
      style={{ flex: 1, borderRadius: tray ? 9 : 6, paddingHorizontal: small ? 3 : 6, paddingVertical: short ? 0 : small ? 3 : 5,
        backgroundColor: palette[0], borderColor: highlight || unlocked ? palette[2] : palette[1],
        borderWidth: 1, borderLeftWidth: tray ? 1 : 3, opacity: dragging ? 0.4 : task.completed ? 0.7 : 1,
        overflow: 'hidden', ...(Platform.OS === 'web' ? { cursor: task.completed ? 'pointer' : locked ? 'pointer' : 'grab', userSelect: 'none', touchAction: 'none' } as ViewStyle : {}) }}>
      <View pointerEvents="none" style={{ flex: 1 }}>
        {!short && <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', marginBottom: 3 }}>
          {task.fixed && <Icon name={unlocked ? 'unlock' : 'lock'} size={small ? 9 : 10} color={palette[2]} />}
          {task.completed && <Icon name="check" size={10} color={palette[2]} />}
          <Label numberOfLines={1} style={{ fontSize: small ? 8 : 9, lineHeight: 13, color: palette[2], flex: 1 }}>
            {tray ? `${task.duration} 分钟` : `${continuation ? '续 · ' : ''}${clock(displayStart ?? task.start!)}`}
          </Label>
        </View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 2 }}>
          {short && task.fixed && <Icon name={unlocked ? 'unlock' : 'lock'} size={small ? 8 : 10} color={palette[2]} />}
          <Label numberOfLines={textLines} style={{ flex: 1, fontSize: small ? 9 : 11, lineHeight: small ? 12 : 16, color: palette[2], fontWeight: '500', textDecorationLine: task.completed ? 'line-through' : 'none' }}>{short && continuation ? '续 · ' : ''}{task.title}</Label>
        </View>
        {tray && task.date && <Label style={{ fontSize: 9, color: palette[2], lineHeight: 15 }}>{task.date.slice(5).replace('-', '/')} · 待安排</Label>}
      </View>
    </Pressable>
  </View>;
  }
}
