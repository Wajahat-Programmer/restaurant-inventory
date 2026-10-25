import { create } from 'zustand';

export type ThemeSetting = 'system' | 'light' | 'dark';

/** The chosen theme, shared by the app shell (which applies it) and Settings (which changes it). */
export const useThemeStore = create<{ mode: ThemeSetting; set: (m: ThemeSetting) => void }>(set => ({
  mode: 'system',
  set: mode => set({ mode }),
}));

export const isThemeSetting = (v: string): v is ThemeSetting => v === 'system' || v === 'light' || v === 'dark';
