import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { DISH_CLASS_ADVICE, DISH_CLASS_LABEL } from '../../src/domain/menu';
import { formatPKR } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { useQuery } from '../../src/features/data';
import { Body, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { dishPerformance, TARGET_MARGIN_PCT } from '../../src/services/reportService';
import { spacing } from '../../src/theme/tokens';

export default function DishPerformanceScreen() {
  const c = useColors();
  const [period, setPeriod] = useState<PeriodState>({ kind: 'month', anchor: todayISO() });
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data, error } = useQuery(q => dishPerformance(q, from, to), [from, to]);
  const rows = data ?? [];

  return (
    <Body>
      <PeriodNav value={period} onChange={setPeriod} testID="dish-period" />
      <ErrorText message={error} />
      <Text style={{ color: c.textSecondary }}>
        {`Sales and profit per dish. A Star sells well and earns well; a Plowhorse sells well but earns little; a Puzzle earns well but sells slowly; a Dog does neither. Price tips aim for a ${TARGET_MARGIN_PCT}% profit on the price.`}
      </Text>
      {data && rows.length === 0 && (
        <Text testID="no-dishes" style={{ color: c.textSecondary }}>
          No dishes yet. Add dishes under Dishes and recipes.
        </Text>
      )}
      {rows.map(r => (
        <Card key={r.recipeId} testID={`dish-${r.name}`}>
          <Card.Content style={styles.gap}>
            <View style={styles.between}>
              <Text variant="titleMedium">{r.name}</Text>
              <Text testID={`dish-class-${r.name}`}>{r.dishClass ? DISH_CLASS_LABEL[r.dishClass] : 'Not sold'}</Text>
            </View>
            <Line label="Portions sold" value={String(r.qty)} />
            {r.qty > 0 && <Line label="Sales" value={formatPKR(r.revenuePaisa)} />}
            <Line
              label={r.qty > 0 ? 'Profit per portion' : 'Profit per portion (at today cost)'}
              value={`${formatPKR(r.unitMarginPaisa)} (${formatPct(r.marginPct)})`}
            />
            {r.dishClass && <Text style={{ color: c.textSecondary }}>{DISH_CLASS_ADVICE[r.dishClass]}</Text>}
            {r.qty === 0 && <Text style={{ color: c.textSecondary }}>No sales in this period.</Text>}
            {r.suggestedPricePaisa !== null && (
              <Text testID={`dish-tip-${r.name}`} style={{ color: c.warning }}>
                {`⚠ Price tip: ${formatPKR(r.suggestedPricePaisa)} would give ${TARGET_MARGIN_PCT}% profit (now ${formatPKR(r.sellPricePaisa)})`}
              </Text>
            )}
          </Card.Content>
        </Card>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
});
