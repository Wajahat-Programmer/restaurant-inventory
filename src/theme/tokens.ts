export type ThemeMode = 'light' | 'dark';

export interface Colors {
  primary: string;
  onPrimary: string;
  accent: string;
  onAccent: string;
  background: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  outline: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
}

export const colors: Record<ThemeMode, Colors> = {
  light: {
    primary: '#1B5E3B',
    onPrimary: '#FFFFFF',
    accent: '#E09F1F',
    onAccent: '#1C1B1A',
    background: '#FAF8F5',
    surface: '#FFFFFF',
    textPrimary: '#1C1B1A',
    textSecondary: '#5F5B57',
    outline: '#D9D4CE',
    success: '#2E7D32',
    warning: '#9A5B00',
    danger: '#C62828',
    info: '#1565C0',
  },
  dark: {
    primary: '#6FCF97',
    onPrimary: '#0B2A1A',
    accent: '#F2C14E',
    onAccent: '#1C1B1A',
    background: '#121412',
    surface: '#1C1F1D',
    textPrimary: '#ECEDEA',
    textSecondary: '#A8ACA8',
    outline: '#3A3F3B',
    success: '#81C784',
    warning: '#FFB74D',
    danger: '#EF9A9A',
    info: '#90CAF9',
  },
};

/** 8 dp grid. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Type scale from the design system (12/14/16/20/24/32). */
export const fontSize = { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 32 } as const;

/** Minimum touch target (dp) for busy or wet hands. */
export const MIN_TOUCH_TARGET = 48;
