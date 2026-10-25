import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  Theme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Icon, useTheme } from 'react-native-paper';
import { useColors } from '../../src/features/ui';
import CountScreen from '../screens/CountScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import ItemFormScreen from '../screens/ItemFormScreen';
import PhotoCaptureScreen from '../screens/PhotoCaptureScreen';
import PurchaseFormScreen from '../screens/PurchaseFormScreen';
import PurchasesScreen from '../screens/PurchasesScreen';
import StockActionScreen from '../screens/StockActionScreen';
import StockScreen from '../screens/StockScreen';
import SupplierDetailScreen from '../screens/SupplierDetailScreen';
import SupplierFormScreen from '../screens/SupplierFormScreen';
import SuppliersScreen from '../screens/SuppliersScreen';
import { RootStackParamList, TabParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const tabIcon = (name: string) =>
  function TabIcon({ color, size }: { color: string; size: number }) {
    return <Icon source={name} color={color} size={size} />;
  };

function Tabs() {
  const c = useColors();
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: c.primary },
        headerTintColor: c.onPrimary,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textSecondary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.outline },
      }}>
      <Tab.Screen
        name="Stock"
        component={StockScreen as never}
        options={{ tabBarIcon: tabIcon('package-variant'), tabBarButtonTestID: 'tab-stock' }}
      />
      <Tab.Screen
        name="Purchases"
        component={PurchasesScreen as never}
        options={{ tabBarIcon: tabIcon('cart'), tabBarButtonTestID: 'tab-purchases' }}
      />
      <Tab.Screen
        name="Suppliers"
        component={SuppliersScreen as never}
        options={{ tabBarIcon: tabIcon('truck'), tabBarButtonTestID: 'tab-suppliers' }}
      />
      <Tab.Screen
        name="Count"
        component={CountScreen}
        options={{ tabBarIcon: tabIcon('clipboard-check'), tabBarButtonTestID: 'tab-count' }}
      />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const c = useColors();
  const base = useTheme().dark ? DarkTheme : DefaultTheme;
  const theme: Theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.surface,
      text: c.textPrimary,
      border: c.outline,
    },
  };
  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: c.primary },
          headerTintColor: c.onPrimary,
        }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="ItemForm" component={ItemFormScreen} options={{ title: 'Item' }} />
        <Stack.Screen name="ItemDetail" component={ItemDetailScreen} options={{ title: 'Item' }} />
        <Stack.Screen name="ItemPhoto" component={PhotoCaptureScreen} options={{ title: 'Photo' }} />
        <Stack.Screen name="StockAction" component={StockActionScreen} options={{ title: 'Stock' }} />
        <Stack.Screen name="PurchaseForm" component={PurchaseFormScreen} options={{ title: 'New purchase' }} />
        <Stack.Screen name="SupplierForm" component={SupplierFormScreen} options={{ title: 'Supplier' }} />
        <Stack.Screen name="SupplierDetail" component={SupplierDetailScreen} options={{ title: 'Supplier' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
