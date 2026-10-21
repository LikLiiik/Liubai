import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { createGreetingRotation, greetingChoices, greetingPeriod, personalizeGreeting, type Greeting } from './greetings';
import { greetingStorage } from './storage';

const nextGreeting = createGreetingRotation(greetingStorage);

export function useHomeGreeting(nickname: string | undefined, minute: number) {
  const period = greetingPeriod(minute);
  const [selection, setSelection] = useState<{ period: number; greeting: Greeting } | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    const refresh = () => {
      const current = ++request;
      void nextGreeting(period).then(greeting => {
        if (active && current === request) setSelection({ period, greeting });
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; subscription.remove(); };
  }, [period]));
  const greeting = selection?.period === period ? selection.greeting : greetingChoices(period)[0];
  return { title: personalizeGreeting(nickname, greeting.title), message: greeting.message };
}
