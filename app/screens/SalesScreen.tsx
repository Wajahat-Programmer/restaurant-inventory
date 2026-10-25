import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, FAB, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { periodRange } from '../../src/domain/periods';
import { listSales, voidSale } from '../../src/services/salesService';
import { spacing } from '../../src/theme/tokens';
import { useRootNav } from '../navigation/useRootNav';

export default function SalesScreen() {
  const nav = useRootNav();
  const c = useColors();
  const write = useWrite();
  const [period, setPeriod] = useState<PeriodState>({ kind: 'day', anchor: todayISO() });
  const [error, setError] = useState<string | null>(null);
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data, loading, error: loadError } = useQuery(db => listSales(db, from, to), [from, to]);

  const live = (data ?? []).filter(s => s.status === 'POSTED');
  const revenue = live.reduce((a, s) => a + s.revenuePaisa, 0);
  const cogs = live.reduce((a, s) => a + s.cogsPaisa, 0);
  const portions = live.reduce((a, s) => a + s.qty, 0);

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <Body>
        <PeriodNav value={period} onChange={setPeriod} testID="sales-period" />
        <Card>
          <Card.Content>
            <Line testID="sales-revenue" label={`Sales (${portions} portions)`} strong value={formatPKR(revenue)} />
            <Line testID="sales-cogs" label="Ingredient cost" value={formatPKR(cogs)} />
            <Line label="Gross profit" tone={revenue - cogs < 0 ? 'bad' : 'good'} value={formatPKR(revenue - cogs)} />
          </Card.Content>
        </Card>
        <ErrorText message={error ?? loadError} />

        {!loading && (data ?? []).length === 0 && (
          <Text testID="sales-empty" style={[styles.empty, { color: c.textSecondary }]}>
            No sales in this period. Tap + to enter the day's sales.
          </Text>
        )}
        {(data ?? []).map(s => (
          <Card key={s.id} testID={`sale-${s.id}`}>
            <Card.Content style={styles.gap}>
              <View style={styles.between}>
                <Text variant="titleMedium">{`${s.dish} × ${s.qty}`}</Text>
                <Text variant="titleMedium" style={styles.num}>
                  {formatPKR(s.revenuePaisa)}
                </Text>
              </View>
              <Text style={{ color: c.textSecondary }}>
                {`${s.date} · cost ${formatPKR(s.cogsPaisa)}${s.status === 'VOID' ? ' · ✖ Void' : ''}`}
              </Text>
              {s.status === 'POSTED' && (
                <Btn
                  testID={`void-sale-${s.id}`}
                  textColor={c.danger}
                  onPress={async () => {
                    setError(null);
                    const res = await write(db => voidSale(db, s.id, todayISO()));
                    if (!res.ok) {
                      setError(res.error);
                    }
                  }}>
                  Void sale
                </Btn>
              )}
            </Card.Content>
          </Card>
        ))}
      </Body>
      <FAB
        testID="fab-add-sales"
        icon="plus"
        label="Sales"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => nav.navigate('SalesEntry', { date: period.anchor })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gap: { gap: spacing.xs },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { textAlign: 'center', marginTop: spacing.lg },
  num: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
