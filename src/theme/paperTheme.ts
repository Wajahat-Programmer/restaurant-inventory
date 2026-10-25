import { MD3DarkTheme, MD3LightTheme, MD3Theme } from 'react-native-paper';
import { colors, ThemeMode } from './tokens';

/** Material 3 theme for Paper, built only from our tokens. */
export function paperTheme(mode: ThemeMode): MD3Theme {
  const c = colors[mode];
  const base = mode === 'dark' ? MD3DarkTheme : MD3LightTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      onPrimary: c.onPrimary,
      primaryContainer: c.surface,
      onPrimaryContainer: c.textPrimary,
      secondary: c.accent,
      onSecondary: c.onAccent,
      secondaryContainer: c.accent,
      onSecondaryContainer: c.onAccent,
      background: c.background,
      onBackground: c.textPrimary,
      surface: c.surface,
      onSurface: c.textPrimary,
      surfaceVariant: c.surface,
      onSurfaceVariant: c.textSecondary,
      outline: c.outline,
      outlineVariant: c.outline,
      error: c.danger,
      onError: c.onPrimary,
      elevation: {
        level0: 'transparent',
        level1: c.surface,
        level2: c.surface,
        level3: c.surface,
        level4: c.surface,
        level5: c.surface,
      },
    },
  };
}
