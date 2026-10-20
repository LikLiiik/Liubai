import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, type ScrollViewProps } from 'react-native';
import { keyboardScrollDelta } from '../keyboard';

export function KeyboardFrame({ children }: { children: React.ReactNode }) {
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>{children}</KeyboardAvoidingView>;
}

export function KeyboardFormScrollView({ onFocus, onBlur, onLayout, onContentSizeChange, onScroll, scrollEnabled = true, ...props }: ScrollViewProps) {
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const focused = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput>>(undefined);
  const offset = useRef(0);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  const reveal = useCallback(() => {
    const revision = ++generation.current;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const field = focused.current;
      const metrics = Keyboard.metrics();
      if (!scrollEnabled || !field || field !== TextInput.State.currentlyFocusedInput() || !metrics) return;
      scroll.current?.measureInWindow((_x, top, _width, height) => {
        field.measureInWindow((_fieldX, fieldTop, _fieldWidth, fieldHeight) => {
          // Focus can change or the form can unmount while native measures it.
          if (revision !== generation.current || field !== TextInput.State.currentlyFocusedInput() || !Keyboard.isVisible()) return;
          const delta = keyboardScrollDelta({ top: fieldTop, height: fieldHeight }, { top, height }, metrics.screenY);
          if (Math.abs(delta) > 1) scroll.current?.scrollTo({ y: Math.max(0, offset.current + delta), animated: false });
        });
      });
    });
  }, [scrollEnabled]);
  useEffect(() => {
    const invalidate = () => { generation.current++; };
    const show = Keyboard.addListener('keyboardDidShow', reveal);
    const change = Keyboard.addListener('keyboardWillChangeFrame', reveal);
    const hide = Keyboard.addListener('keyboardDidHide', invalidate);
    return () => {
      invalidate();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      show.remove(); change.remove(); hide.remove();
    };
  }, [reveal]);
  return <ScrollView {...props} ref={scroll} scrollEnabled={scrollEnabled} scrollsChildToFocus keyboardShouldPersistTaps="handled"
    scrollEventThrottle={16}
    onFocus={event => { focused.current = TextInput.State.currentlyFocusedInput(); reveal(); onFocus?.(event); }}
    onBlur={event => { focused.current = undefined; generation.current++; onBlur?.(event); }}
    onLayout={event => { reveal(); onLayout?.(event); }}
    onContentSizeChange={(width, height) => { reveal(); onContentSizeChange?.(width, height); }}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }} />;
}
