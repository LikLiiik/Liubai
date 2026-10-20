import React from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlanningProvider } from '../store';
import { Shell } from '../components/Shell';
import { ReminderObserver } from '../components/ReminderObserver';

export default function Layout() {
  return <SafeAreaProvider><PlanningProvider><StatusBar style="dark" /><Shell><Slot /><ReminderObserver /></Shell></PlanningProvider></SafeAreaProvider>;
}
