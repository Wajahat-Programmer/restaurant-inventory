import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';

/** Navigation to any stack screen, from inside a tab (navigate bubbles up). */
export const useRootNav = () => useNavigation<NativeStackNavigationProp<RootStackParamList>>();
