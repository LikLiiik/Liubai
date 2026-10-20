// Metro selects storage.native.ts on Android/iOS; this implementation is for web previews.
import { GUIDE_STORAGE_KEY } from './guide';
export const storage = {
  get: async (): Promise<string | null> => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('liubai.app.v1');
  },
  set: async (value: string): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('liubai.app.v1', value);
  },
};

export const guideStorage = {
  get: async (): Promise<string | null> => typeof localStorage === 'undefined' ? null : localStorage.getItem(GUIDE_STORAGE_KEY),
  set: async (value: string): Promise<void> => {
    if (typeof localStorage === 'undefined') throw new Error('Local storage unavailable');
    localStorage.setItem(GUIDE_STORAGE_KEY, value);
  },
};
