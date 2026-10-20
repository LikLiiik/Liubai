import React from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlanningProvider } from '../store';
import { Shell } from '../components/Shell';
import { ReminderObserver } from '../components/ReminderObserver';
import { GuideProvider } from '../guideStore';
import { CompletionAdvanceDialog } from '../components/CompletionAdvanceDialog';

export default function Layout() {
  return <SafeAreaProvider><PlanningProvider><GuideProvider><StatusBar style="dark" /><Shell><Slot /><ReminderObserver /><CompletionAdvanceDialog /></Shell></GuideProvider></PlanningProvider></SafeAreaProvider>;
}
