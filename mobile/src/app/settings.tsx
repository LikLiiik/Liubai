import React from 'react';
import { Redirect } from 'expo-router';

export default function SettingsRedirect() {
  return <Redirect href="/me" />;
}
