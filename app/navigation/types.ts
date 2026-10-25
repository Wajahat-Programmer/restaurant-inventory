import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Home: undefined;
  Stock: undefined;
  Purchases: undefined;
  Sales: undefined;
  More: undefined;
};

export type StockActionKind = 'issue' | 'waste' | 'adjust';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  ItemForm: { itemId?: number } | undefined;
  ItemDetail: { itemId: number };
  ItemPhoto: { itemId: number };
  StockAction: { itemId: number; kind: StockActionKind };
  PurchaseForm: undefined;
  Suppliers: undefined;
  Count: undefined;
  Recipes: undefined;
  RecipeForm: { recipeId?: number } | undefined;
  SalesEntry: { date?: string } | undefined;
  Expenses: undefined;
  ExpenseForm: undefined;
  CashBook: undefined;
  Reports: undefined;
  SupplierForm: { supplierId?: number } | undefined;
  SupplierDetail: { supplierId: number };
};

export type RootProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
