import { useEffect } from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './app/navigation/RootNavigator';
import { Db } from './src/db/client';
import { prepareCutoutModel } from './src/features/photos/devicePorts';
import { DbProvider } from './src/features/DbProvider';
import { paperTheme } from './src/theme/paperTheme';

export default function App({ db }: { db?: Db }) {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  // Fetch the segmentation model early so the first photo does not wait on it.
  useEffect(prepareCutoutModel, []);
  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme(mode)}>
        <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
        <DbProvider db={db}>
          <RootNavigator />
        </DbProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
