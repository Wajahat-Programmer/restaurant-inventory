import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import HomeScreen from './app/HomeScreen';
import { colors } from './src/theme/tokens';

export default function App() {
  const mode = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={mode === 'dark' ? 'light-content' : 'dark-content'} />
      <SafeAreaView
        style={[styles.root, { backgroundColor: colors[mode].background }]}>
        <HomeScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
