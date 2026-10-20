import Storage from 'expo-sqlite/kv-store';
import { GUIDE_STORAGE_KEY } from './guide';

export const storage = {
  get: () => Storage.getItem('liubai.app.v1'),
  set: (value: string) => Storage.setItem('liubai.app.v1', value),
};

export const guideStorage = {
  get: () => Storage.getItem(GUIDE_STORAGE_KEY),
  set: (value: string) => Storage.setItem(GUIDE_STORAGE_KEY, value),
};
