import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { Card, Checkbox, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery } from '../../src/features/data';
import { groupBySupplier, orderMessage } from '../../src/domain/ordering';
import { toOrder } from '../../src/features/forecast/shoppingList';
import { Body, Btn, ErrorText, Line, todayISO, useColors } from '../../src/features/ui';
import { alerts, financialOutlook, itemForecasts, supplierPrices } from '../../src/services/forecastService';
import { spacing } from '../../src/theme/tokens';

export default function ForecastScreen() {
  const c = useColors();
  const today = todayISO();
  const { data, error } = useQuery(async db => ({
    alerts: await alerts(db, today),
    rows: await itemForecasts(db, today),
    outlook: await financialOutlook(db, today),
    prices: await supplierPrices(db),
  }), [today]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  const rows = data?.rows ?? [];
  const order = toOrder(rows);
  const included = new Set(order.filter(r => !excluded.has(r.itemId)).map(r => r.itemId));
  const groups = groupBySupplier(
    order.map(r => ({ itemId: r.itemId, name: r.name, baseUnit: r.baseUnit, qty: r.reorder.qty })),
    data?.prices ?? new Map(),
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
            Based on expected use until the next delivery, plus a safety margin, split by who you usually buy from. Untick what you do not want, then share each supplier's list. Nothing is ordered for you.
          </Text>
          {order.length === 0 && (
            <Text testID="no-order" style={{ color: c.textSecondary }}>
              Nothing to order right now.
            </Text>
          )}
        </Card.Content>
      </Card>

      {groups.map(g => {
        const picked = { ...g, lines: g.lines.filter(l => included.has(l.itemId)) };
        const total = picked.lines.reduce((s, l) => s + (l.estimatePaisa ?? 0), 0);
        const unpriced = picked.lines.filter(l => l.estimatePaisa === null).length;
        const message = orderMessage(picked, today);
        return (
          <Card key={g.supplierId ?? 'none'} testID={`supplier-order-${g.supplierName}`}>
            <Card.Content style={styles.gap}>
              <Text variant="titleMedium">{g.supplierName}</Text>
              {g.lines.map(l => (
                <View key={l.itemId}>
                  <View style={styles.row}>
                    <Checkbox
                      testID={`order-${l.name}`}
                      status={included.has(l.itemId) ? 'checked' : 'unchecked'}
                      onPress={() => toggle(l.itemId)}
                    />
                    <Text style={styles.flex}>{l.name}</Text>
                    <Text style={styles.num}>{formatQty(l.qty, l.baseUnit)}</Text>
                    <Text style={[styles.num, styles.cost, { color: c.textSecondary }]}>
                      {l.estimatePaisa === null ? 'no price' : formatPKR(l.estimatePaisa)}
                    </Text>
                  </View>
                  {l.cheaperAt && (
                    <Text testID={`cheaper-${l.name}`} style={[styles.hint, { color: c.warning }]}>
                      {`⚠ ${l.cheaperAt.supplierName} charged ${l.cheaperAt.savePct}% less last time`}
                    </Text>
                  )}
                </View>
              ))}
              <Line
                testID={`estimate-${g.supplierName}`}
                label={unpriced ? 'Estimated cost (at least)' : 'Estimated cost'}
                value={formatPKR(total)}
              />
              <Btn
                testID={`share-${g.supplierName}`}
                mode="contained"
                icon="share-variant"
                disabled={!message}
                onPress={() => Share.share({ message })}>
                {g.supplierId === null ? 'Share this list' : `Share with ${g.supplierName}`}
              </Btn>
            </Card.Content>
          </Card>
        );
      })}

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
  cost: { minWidth: 88, textAlign: 'right' },
  hint: { marginLeft: 48 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  num: { fontVariant: ['tabular-nums'] },
});
