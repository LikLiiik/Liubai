import Storage from 'expo-sqlite/kv-store';

export const storage = {
  get: () => Storage.getItem('liubai.app.v1'),
  set: (value: string) => Storage.setItem('liubai.app.v1', value),
};
