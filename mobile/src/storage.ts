// Metro selects storage.native.ts on Android/iOS; this implementation is for web previews.
export const storage = {
  get: async (): Promise<string | null> => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem('liubai.app.v1');
  },
  set: async (value: string): Promise<void> => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('liubai.app.v1', value);
  },
};
