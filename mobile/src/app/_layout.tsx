import React from 'react';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlanningProvider } from '../store';
import { Shell } from '../components/Shell';

export default function Layout() {
  return <SafeAreaProvider><PlanningProvider><StatusBar style="dark" /><Shell><Slot /></Shell></PlanningProvider></SafeAreaProvider>;
}
