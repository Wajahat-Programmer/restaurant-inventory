import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './app/navigation/RootNavigator';
import { Db } from './src/db/client';
import { AuthProvider } from './src/features/auth/AuthProvider';
import { DbProvider, useDb } from './src/features/DbProvider';
import { prepareCutoutModel } from './src/features/photos/devicePorts';
import { isThemeSetting, useThemeStore } from './src/features/themeStore';
import { getSetting } from './src/services/settingsService';
import { paperTheme } from './src/theme/paperTheme';

/** Everything that needs the database: the chosen theme, the lock and the screens. */
function Shell() {
  const db = useDb();
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const { mode, set } = useThemeStore();

  useEffect(() => {
    getSetting(db, 'theme').then(v => isThemeSetting(v) && set(v));
  }, [db, set]);

  const resolved = mode === 'system' ? system : mode;
  return (
    <PaperProvider theme={paperTheme(resolved)}>
      <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </PaperProvider>
  );
}

export default function App({ db }: { db?: Db }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  // Fetch the segmentation model early so the first photo does not wait on it.
  useEffect(prepareCutoutModel, []);
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme(system)}>
        <DbProvider db={db}>
          <Shell />
        </DbProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
