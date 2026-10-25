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
import CashBookScreen from '../screens/CashBookScreen';
import CountScreen from '../screens/CountScreen';
import ExpenseFormScreen from '../screens/ExpenseFormScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import HomeScreen from '../screens/HomeScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import ItemFormScreen from '../screens/ItemFormScreen';
import MoreScreen from '../screens/MoreScreen';
import PhotoCaptureScreen from '../screens/PhotoCaptureScreen';
import PurchaseFormScreen from '../screens/PurchaseFormScreen';
import PurchasesScreen from '../screens/PurchasesScreen';
import RecipeFormScreen from '../screens/RecipeFormScreen';
import RecipesScreen from '../screens/RecipesScreen';
import ReportsScreen from '../screens/ReportsScreen';
import SalesEntryScreen from '../screens/SalesEntryScreen';
import SalesScreen from '../screens/SalesScreen';
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
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon('home'), tabBarButtonTestID: 'tab-home' }} />
      <Tab.Screen name="Stock" component={StockScreen} options={{ tabBarIcon: tabIcon('package-variant'), tabBarButtonTestID: 'tab-stock' }} />
      <Tab.Screen name="Purchases" component={PurchasesScreen} options={{ tabBarIcon: tabIcon('cart'), tabBarButtonTestID: 'tab-purchases' }} />
      <Tab.Screen name="Sales" component={SalesScreen} options={{ tabBarIcon: tabIcon('cash-register'), tabBarButtonTestID: 'tab-sales' }} />
      <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: tabIcon('dots-horizontal'), tabBarButtonTestID: 'tab-more' }} />
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
        <Stack.Screen name="Suppliers" component={SuppliersScreen} options={{ title: 'Suppliers' }} />
        <Stack.Screen name="Count" component={CountScreen} options={{ title: 'Stock count' }} />
        <Stack.Screen name="Recipes" component={RecipesScreen} options={{ title: 'Dishes and recipes' }} />
        <Stack.Screen name="RecipeForm" component={RecipeFormScreen} options={{ title: 'Dish' }} />
        <Stack.Screen name="SalesEntry" component={SalesEntryScreen} options={{ title: 'Enter sales' }} />
        <Stack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'Expenses' }} />
        <Stack.Screen name="ExpenseForm" component={ExpenseFormScreen} options={{ title: 'New expense' }} />
        <Stack.Screen name="CashBook" component={CashBookScreen} options={{ title: 'Cash book' }} />
        <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: 'Reports' }} />
        <Stack.Screen name="SupplierForm" component={SupplierFormScreen} options={{ title: 'Supplier' }} />
        <Stack.Screen name="SupplierDetail" component={SupplierDetailScreen} options={{ title: 'Supplier' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
