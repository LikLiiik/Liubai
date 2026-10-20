import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, type ScrollViewProps } from 'react-native';

export function KeyboardFrame({ children }: { children: React.ReactNode }) {
  return <KeyboardAvoidingView enabled={Platform.OS !== 'web'} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
    {children}
  </KeyboardAvoidingView>;
}

export function KeyboardFormScrollView(props: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}
