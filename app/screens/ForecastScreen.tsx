import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Card, Checkbox, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery } from '../../src/features/data';
import { buildShoppingList, toOrder } from '../../src/features/forecast/shoppingList';
import { Body, Btn, ErrorText, Line, todayISO, useColors } from '../../src/features/ui';
import { alerts, financialOutlook, itemForecasts } from '../../src/services/forecastService';
import { spacing } from '../../src/theme/tokens';

export default function ForecastScreen() {
  const c = useColors();
  const today = todayISO();
  const { data, error } = useQuery(async db => ({
    alerts: await alerts(db, today),
    rows: await itemForecasts(db, today),
    outlook: await financialOutlook(db, today),
  }), [today]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const rows = data?.rows ?? [];
  const order = toOrder(rows);
  const included = new Set(order.filter(r => !excluded.has(r.itemId)).map(r => r.itemId));
  const message = buildShoppingList(
    order.map(r => ({ itemId: r.itemId, name: r.name, baseUnit: r.baseUnit, qty: r.reorder.qty })),
    included,
    today,
  );
  const toggle = (id: number) =>
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  return (
    <Body>
      <ErrorText message={error} />

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Needs attention</Text>
          {(data?.alerts ?? []).length === 0 && (
            <Text testID="no-alerts" style={{ color: c.success }}>
              ✓ Nothing needs attention.
            </Text>
          )}
          {(data?.alerts ?? []).map((a, i) => (
            <Text key={i} testID={`alert-${a.kind}`}>
              {a.message}
            </Text>
          ))}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Suggested order</Text>
          <Text style={{ color: c.textSecondary }}>
            Based on expected use until the next delivery, plus a safety margin. Untick what you do not want, then share. Nothing is ordered for you.
          </Text>
          {order.length === 0 && (
            <Text testID="no-order" style={{ color: c.textSecondary }}>
              Nothing to order right now.
            </Text>
          )}
          {order.map(r => (
            <View key={r.itemId} style={styles.row}>
              <Checkbox
                testID={`order-${r.name}`}
                status={included.has(r.itemId) ? 'checked' : 'unchecked'}
                onPress={() => toggle(r.itemId)}
              />
              <Text style={styles.flex}>{r.name}</Text>
              <Text style={styles.num}>{formatQty(r.reorder.qty, r.baseUnit)}</Text>
            </View>
          ))}
          {order.length > 0 && (
            <Btn testID="share-list" mode="contained" icon="share-variant" disabled={!message} onPress={() => Share.share({ message })}>
              Share shopping list
            </Btn>
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Money outlook</Text>
          {data?.outlook.revenue.next7 ? (
            <Line
              testID="outlook-revenue"
              label="Sales, next 7 days"
              value={`${formatPKR(data.outlook.revenue.next7.low)} – ${formatPKR(data.outlook.revenue.next7.high)}`}
            />
          ) : (
            <Text testID="outlook-hidden" style={{ color: c.textSecondary }}>
              {`Sales forecast hidden: ${data?.outlook.revenue.forecast.reason ?? 'no sales yet'}`}
            </Text>
          )}
          {data?.outlook.monthlyExpenses ? (
            <Line
              testID="outlook-expenses"
              label="Expenses per month"
              value={`${formatPKR(data.outlook.monthlyExpenses.low)} – ${formatPKR(data.outlook.monthlyExpenses.high)}`}
            />
          ) : (
            <Text style={{ color: c.textSecondary }}>Expense outlook appears after a full month of expenses.</Text>
          )}
        </Card.Content>
      </Card>

      <Text variant="titleMedium">Item by item</Text>
      {rows.map(r => (
        <Card key={r.itemId} testID={`forecast-${r.name}`}>
          <Card.Content style={styles.gap}>
            <View style={styles.between}>
              <Text variant="titleMedium">{r.name}</Text>
              <Text style={styles.num}>{`on hand ${formatQty(r.onHand, r.baseUnit)}`}</Text>
            </View>
            {r.forecast.shown ? (
              <>
                <Text style={styles.num}>{`Use next 7 days: about ${formatQty(r.next7 ?? 0, r.baseUnit)}`}</Text>
                <Text style={[styles.num, { color: r.daysLeft !== null && r.daysLeft <= 3 ? c.warning : c.textSecondary }]}>
                  {r.daysLeft === null ? '✓ Lasts longer than the forecast' : `${r.daysLeft <= 3 ? '⚠ ' : ''}Runs out in about ${r.daysLeft} days`}
                </Text>
              </>
            ) : (
              <Text style={{ color: c.textSecondary }}>{`Forecast hidden: ${r.forecast.reason}`}</Text>
            )}
          </Card.Content>
        </Card>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  num: { fontVariant: ['tabular-nums'] },
});
