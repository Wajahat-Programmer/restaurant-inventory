import { NavigatorScreenParams } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

export type TabParamList = {
  Stock: undefined;
  Purchases: undefined;
  Suppliers: undefined;
  Count: undefined;
};

export type StockActionKind = 'issue' | 'waste' | 'adjust';

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  ItemForm: { itemId?: number } | undefined;
  ItemDetail: { itemId: number };
  ItemPhoto: { itemId: number };
  StockAction: { itemId: number; kind: StockActionKind };
  PurchaseForm: undefined;
  SupplierForm: { supplierId?: number } | undefined;
  SupplierDetail: { supplierId: number };
};

export type RootProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;
