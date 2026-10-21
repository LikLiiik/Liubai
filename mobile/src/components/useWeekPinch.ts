import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PanResponder, Platform, type View } from 'react-native';
import type React from 'react';
import { createWeekPinchController, type ZoomPoint } from '../weekZoom';

type Pair = [ZoomPoint, ZoomPoint];
type Config = { onBegin: (points: Pair) => void; onMove: (points: Pair) => void; onEnd: () => void;
  onWheel: (point: ZoomPoint, factor: number, axis: 'both' | 'x' | 'y') => void };
// The same two-finger lifecycle feeds native responders and browser touch events.
// One finger left after a pinch stays blocked until every finger has lifted.
export function useWeekPinch(board: RefObject<React.ComponentRef<typeof View> | null>, config: Config) {
  const latest = useRef(config);
  const [pinching, setPinching] = useState(false);
  useLayoutEffect(() => { latest.current = config; });
  const lifecycle = useMemo(() => createWeekPinchController({ begin: () => {}, move: () => {}, end: () => {}, block: setPinching,
    frame: run => requestAnimationFrame(run), cancelFrame: id => cancelAnimationFrame(id), now: Date.now }), []);
  useLayoutEffect(() => { lifecycle.setCallbacks({ begin: config.onBegin, move: config.onMove, end: config.onEnd }); });
  const responder = useMemo(() => {
    const points = (touches: readonly { pageX: number; pageY: number }[]) => touches.map(touch => ({ x: touch.pageX, y: touch.pageY }));
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: event => event.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: event => event.nativeEvent.touches.length >= 2,
      onPanResponderGrant: event => lifecycle.start(points(event.nativeEvent.touches)),
      onPanResponderStart: event => { if (event.nativeEvent.touches.length > 2) lifecycle.finish(event.nativeEvent.touches.length, true); },
      onPanResponderMove: event => lifecycle.move(points(event.nativeEvent.touches)),
      onPanResponderEnd: event => lifecycle.finish(event.nativeEvent.touches.length),
      onPanResponderRelease: () => lifecycle.finish(0),
      onPanResponderTerminate: () => lifecycle.finish(0),
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    });
  }, [lifecycle]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = board.current as unknown as HTMLElement | null;
    if (!node?.addEventListener) return;
    const points = (event: TouchEvent) => Array.from(event.touches, touch => ({ x: touch.clientX, y: touch.clientY }));
    const start = (event: TouchEvent) => {
      if (event.touches.length < 2) return;
      event.preventDefault(); event.stopPropagation(); lifecycle.start(points(event));
    };
    const move = (event: TouchEvent) => {
      if (!lifecycle.engaged()) return;
      event.preventDefault(); event.stopPropagation(); lifecycle.move(points(event));
    };
    const end = (event: TouchEvent) => {
      if (!lifecycle.engaged()) return;
      event.preventDefault(); event.stopPropagation(); lifecycle.finish(event.touches.length);
    };
    const click = (event: MouseEvent) => {
      if (lifecycle.isBlocked()) { event.preventDefault(); event.stopPropagation(); }
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || lifecycle.engaged()) return;
      event.preventDefault(); event.stopPropagation();
      latest.current.onWheel({ x: event.clientX, y: event.clientY }, Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) / 300),
        event.altKey ? 'x' : event.shiftKey ? 'y' : 'both');
      lifecycle.suppressClick();
    };
    const options = { capture: true, passive: false };
    node.addEventListener('touchstart', start, options); node.addEventListener('touchmove', move, options);
    node.addEventListener('touchend', end, options); node.addEventListener('touchcancel', end, options);
    node.addEventListener('click', click, true); node.addEventListener('wheel', wheel, options);
    return () => {
      node.removeEventListener('touchstart', start, true); node.removeEventListener('touchmove', move, true);
      node.removeEventListener('touchend', end, true); node.removeEventListener('touchcancel', end, true);
      node.removeEventListener('click', click, true); node.removeEventListener('wheel', wheel, true);
    };
  }, [board, lifecycle]);
  useEffect(() => () => lifecycle.dispose(), [lifecycle]);
  return { pinching, handlers: Platform.OS === 'web' ? {} : responder.panHandlers,
    isBlocked: lifecycle.isBlocked, cancel: () => lifecycle.finish(0, true) };
}
