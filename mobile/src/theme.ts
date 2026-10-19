import { Platform } from 'react-native';

export const colors = {
  bg: '#F7F8FA', surface: '#FFFFFF', text: '#252636', muted: '#858695', faint: '#A6A7B3', border: '#ECECF1',
  purple: '#7963C9', purpleDark: '#6750B5', lavender: '#F0ECFA', green: '#6B927A', greenBg: '#EDF4EF',
  orange: '#BB8C56', orangeBg: '#FAF1E5', red: '#B45B65', redBg: '#FBEFF0',
};

export const font = Platform.OS === 'web' ? '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif' : undefined;
