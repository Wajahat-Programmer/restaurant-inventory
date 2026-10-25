import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { Body, useColors } from '../../src/features/ui';
import { MIN_TOUCH_TARGET, spacing } from '../../src/theme/tokens';
import { RootStackParamList } from '../navigation/types';
import { useRootNav } from '../navigation/useRootNav';

const MENU: { key: string; title: string; hint: string; icon: string; to: keyof RootStackParamList }[] = [
  { key: 'reports', title: 'Reports', hint: 'Profit and loss, stock value, supplier spend', icon: 'chart-box-outline', to: 'Reports' },
  { key: 'recipes', title: 'Dishes and recipes', hint: 'What goes into each dish, cost and margin', icon: 'chef-hat', to: 'Recipes' },
  { key: 'expenses', title: 'Expenses', hint: 'Rent, salaries, gas, utilities', icon: 'cash-minus', to: 'Expenses' },
  { key: 'cashbook', title: 'Cash book', hint: 'Money in and out, with balances', icon: 'book-open-variant', to: 'CashBook' },
  { key: 'suppliers', title: 'Suppliers', hint: 'Who you buy from and what you owe', icon: 'truck', to: 'Suppliers' },
  { key: 'count', title: 'Stock count', hint: 'Count the shelves and fix differences', icon: 'clipboard-check', to: 'Count' },
];

export default function MoreScreen() {
  const c = useColors();
  const nav = useRootNav();
  return (
    <Body>
      {MENU.map(m => (
        <Pressable
          key={m.key}
          testID={`menu-${m.key}`}
          accessibilityRole="button"
          onPress={() => nav.navigate(m.to as 'Reports')}
          style={[styles.row, { backgroundColor: c.surface, borderColor: c.outline }]}>
          <Icon source={m.icon} size={28} color={c.primary} />
          <View style={styles.text}>
            <Text variant="titleMedium">{m.title}</Text>
            <Text style={{ color: c.textSecondary }}>{m.hint}</Text>
          </View>
          <Icon source="chevron-right" size={24} color={c.textSecondary} />
        </Pressable>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
  },
  text: { flex: 1, gap: spacing.xs },
});
