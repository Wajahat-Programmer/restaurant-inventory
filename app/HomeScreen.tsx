import { useReducer } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {
  applyMovement,
  EMPTY_LEVEL,
  Movement,
  StockLevel,
  stockValue,
} from '../src/domain/ledger';
import { formatPKR } from '../src/domain/money';
import {
  colors,
  fontSize,
  MIN_TOUCH_TARGET,
  spacing,
} from '../src/theme/tokens';

/** Demo par level (g) until items carry their own. */
const LOW_STOCK_G = 500;

const RICE_IN: Movement = {
  itemId: 'rice',
  type: 'IN',
  qtyBase: 1000,
  unitCostPaisa: 12,
};
const RICE_ISSUE: Movement = {
  itemId: 'rice',
  type: 'ISSUE',
  qtyBase: -250,
  unitCostPaisa: 0,
};

interface State {
  level: StockLevel;
  error: string | null;
}

function reducer(state: State, m: Movement): State {
  try {
    return { level: applyMovement(state.level, m), error: null };
  } catch (e) {
    return { ...state, error: (e as Error).message };
  }
}

export default function HomeScreen() {
  const c = colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [{ level, error }, post] = useReducer(reducer, {
    level: EMPTY_LEVEL,
    error: null,
  });

  const low = level.qtyBase < LOW_STOCK_G;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.textPrimary }]}>
        Restaurant Inventory
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: c.surface, borderColor: c.outline },
        ]}>
        <Text style={[styles.label, { color: c.textSecondary }]}>
          Rice (base unit: g)
        </Text>
        <Text
          testID="stock-qty"
          style={[styles.number, { color: c.textPrimary }]}>
          {`${level.qtyBase} g`}
        </Text>
        <Text testID="stock-value" style={{ color: c.textSecondary }}>
          {`Value ${formatPKR(stockValue(level))}`}
        </Text>
        {/* Status is never colour alone: always an icon-style glyph + label. */}
        <Text
          testID="stock-status"
          style={{ color: low ? c.warning : c.success }}>
          {low ? '⚠ Low' : '✓ In stock'}
        </Text>
        {error && (
          <Text testID="stock-error" style={{ color: c.danger }}>
            {`✖ ${error}`}
          </Text>
        )}
      </View>

      <Pressable
        testID="btn-stock-in"
        accessibilityRole="button"
        onPress={() => post(RICE_IN)}
        style={[styles.button, { backgroundColor: c.primary }]}>
        <Text style={{ color: c.onPrimary, fontSize: fontSize.md }}>
          Stock in 1000 g
        </Text>
      </Pressable>
      <Pressable
        testID="btn-issue"
        accessibilityRole="button"
        onPress={() => post(RICE_ISSUE)}
        style={[styles.button, { backgroundColor: c.accent }]}>
        <Text style={{ color: c.onAccent, fontSize: fontSize.md }}>
          Issue 250 g to kitchen
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: fontSize.xl, fontWeight: '600' },
  card: {
    padding: spacing.md,
    borderRadius: spacing.sm,
    borderWidth: 1,
    gap: spacing.xs,
  },
  label: { fontSize: fontSize.sm },
  number: {
    fontSize: fontSize.xxl,
    fontVariant: ['tabular-nums'],
  },
  button: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
