import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { formatPKR, parseRupees } from '../../src/domain/money';
import { periodRange } from '../../src/domain/periods';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, Line, PeriodNav, PeriodState, todayISO, useColors } from '../../src/features/ui';
import { addManualCash, getCashBook } from '../../src/services/cashService';
import { spacing } from '../../src/theme/tokens';

const SOURCE_LABEL: Record<string, string> = {
  sale: 'Sale',
  expense: 'Expense',
  purchase: 'Purchase',
  supplier_payment: 'Supplier payment',
  manual: 'Manual entry',
};

export default function CashBookScreen() {
  const c = useColors();
  const write = useWrite();
  const [period, setPeriod] = useState<PeriodState>({ kind: 'week', anchor: todayISO() });
  const { from, to } = periodRange(period.kind, period.anchor);
  const { data: book, error: loadError } = useQuery(db => getCashBook(db, from, to), [from, to]);

  const [direction, setDirection] = useState<'IN' | 'OUT'>('IN');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setError(null);
    const paisa = parseRupees(amount);
    if (paisa === null || paisa === 0) {
      setError('Amount must be more than 0, like 500 or 99.50');
      return;
    }
    const res = await write(db => addManualCash(db, { date: todayISO(), direction, amountPaisa: paisa, note }));
    if (res.ok) {
      setAmount('');
      setNote('');
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <PeriodNav value={period} onChange={setPeriod} testID="cash-period" />
      <Card>
        <Card.Content>
          <Line testID="cash-opening" label="Opening balance" value={formatPKR(book?.openingPaisa ?? 0)} />
          <Line testID="cash-in" label="Money in" tone="good" value={formatPKR(book?.totalInPaisa ?? 0)} />
          <Line testID="cash-out" label="Money out" tone="bad" value={formatPKR(book?.totalOutPaisa ?? 0)} />
          <Line testID="cash-closing" label="Closing balance" strong value={formatPKR(book?.closingPaisa ?? 0)} />
        </Card.Content>
      </Card>
      <ErrorText message={loadError} />

      <Text variant="titleSmall">Add money in or out (deposit, withdrawal)</Text>
      <SegmentedButtons
        value={direction}
        onValueChange={v => setDirection(v as 'IN' | 'OUT')}
        buttons={[
          { value: 'IN', label: '＋ Money in', testID: 'cash-dir-in' },
          { value: 'OUT', label: '－ Money out', testID: 'cash-dir-out' },
        ]}
      />
      <TextInput mode="outlined" testID="field-cash-amount" label="Amount (Rs)" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      <TextInput mode="outlined" testID="field-cash-note" label="Note (required)" value={note} onChangeText={setNote} />
      <ErrorText message={error} />
      <Btn testID="save-cash" mode="contained-tonal" onPress={add}>
        Add entry
      </Btn>

      <Text variant="titleSmall">Entries</Text>
      {book && book.entries.length === 0 && <Text style={{ color: c.textSecondary }}>No entries in this period.</Text>}
      {(book?.entries ?? []).map(e => (
        <View key={e.id} style={styles.entry} testID={`cash-entry-${e.id}`}>
          <View style={styles.flex}>
            <Text>{`${SOURCE_LABEL[e.source] ?? e.source}${e.isReversal ? ' (reversal)' : ''}`}</Text>
            <Text style={{ color: c.textSecondary }}>{`${e.date} · ${e.method}${e.note ? ` · ${e.note}` : ''}`}</Text>
          </View>
          <Text style={[styles.num, { color: e.direction === 'IN' ? c.success : c.danger }]}>
            {`${e.direction === 'IN' ? '＋' : '－'} ${formatPKR(e.amountPaisa)}`}
          </Text>
        </View>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  flex: { flex: 1 },
  num: { fontVariant: ['tabular-nums'] },
});
