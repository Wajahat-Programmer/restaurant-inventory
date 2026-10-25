import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, FAB, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { listExpenses, voidExpense } from '../../src/services/expenseService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function ExpensesScreen({ navigation }: RootProps<'Expenses'>) {
  const c = useColors();
  const write = useWrite();
  const [period, setPeriod] = useState<PeriodState>({ kind: 'month', anchor: todayISO() });
  const [error, setError] = useState<string | null>(null);
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data, loading, error: loadError } = useQuery(db => listExpenses(db, from, to), [from, to]);
  const total = (data ?? []).filter(e => e.status === 'POSTED').reduce((a, e) => a + e.amountPaisa, 0);

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <Body>
        <PeriodNav value={period} onChange={setPeriod} testID="exp-period" />
        <Card>
          <Card.Content>
            <Line testID="expenses-total" label="Total expenses" strong value={formatPKR(total)} />
          </Card.Content>
        </Card>
        <ErrorText message={error ?? loadError} />
        {!loading && (data ?? []).length === 0 && (
          <Text testID="expenses-empty" style={[styles.empty, { color: c.textSecondary }]}>
            No expenses in this period.
          </Text>
        )}
        {(data ?? []).map(e => (
          <Card key={e.id} testID={`expense-${e.id}`}>
            <Card.Content style={styles.gap}>
              <View style={styles.between}>
                <Text variant="titleMedium">{e.category}</Text>
                <Text variant="titleMedium" style={styles.num}>{formatPKR(e.amountPaisa)}</Text>
              </View>
              <Text style={{ color: c.textSecondary }}>
                {`${e.date} · ${e.method}${e.note ? ` · ${e.note}` : ''}${e.status === 'VOID' ? ' · ✖ Void' : ''}`}
              </Text>
              {e.status === 'POSTED' && (
                <Btn
                  testID={`void-expense-${e.id}`}
                  textColor={c.danger}
                  onPress={async () => {
                    setError(null);
                    const res = await write(db => voidExpense(db, e.id, todayISO()));
                    if (!res.ok) {
                      setError(res.error);
                    }
                  }}>
                  Void expense
                </Btn>
              )}
            </Card.Content>
          </Card>
        ))}
      </Body>
      <FAB
        testID="fab-add-expense"
        icon="plus"
        label="Expense"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => navigation.navigate('ExpenseForm')}
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
