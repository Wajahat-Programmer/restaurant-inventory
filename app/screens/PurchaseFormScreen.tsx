import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import {
  buildPurchase,
  EMPTY_LINE,
  LineForm,
  PurchaseForm,
} from '../../src/features/purchases/purchaseForm';
import { Body, Btn, ErrorText, Select, todayISO, useColors } from '../../src/features/ui';
import { listItemPacks } from '../../src/services/itemService';
import { listSuppliers, postPurchase } from '../../src/services/purchaseService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function PurchaseFormScreen({ navigation }: RootProps<'PurchaseForm'>) {
  const c = useColors();
  const write = useWrite();
  const { data } = useQuery(async db => ({
    suppliers: await listSuppliers(db),
    items: await listItemPacks(db),
  }));

  const [form, setForm] = useState<PurchaseForm>({
    supplierId: null,
    date: todayISO(),
    lines: [{ ...EMPTY_LINE }],
    paid: '',
    note: '',
  });
  const [error, setError] = useState<string | null>(null);

  const items = data?.items ?? [];
  const built = buildPurchase(form, items);
  const setLine = (i: number, patch: Partial<LineForm>) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const submit = async () => {
    setError(null);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const res = await write(db => postPurchase(db, built.input));
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <Select
        testID="pick-supplier"
        label="Choose supplier"
        value={form.supplierId}
        options={(data?.suppliers ?? []).map(s => ({ value: s.id, label: s.name }))}
        onChange={supplierId => setForm(f => ({ ...f, supplierId }))}
      />
      <TextInput
        mode="outlined"
        testID="field-date"
        label="Date (YYYY-MM-DD)"
        value={form.date}
        onChangeText={date => setForm(f => ({ ...f, date }))}
      />

      {form.lines.map((l, i) => {
        const item = items.find(x => x.id === l.itemId);
        return (
          <Card key={i} testID={`line-${i}`}>
            <Card.Content style={styles.gap}>
              <Select
                testID={`line-${i}-item`}
                label="Choose item"
                value={l.itemId}
                options={items.map(x => ({ value: x.id, label: x.name }))}
                onChange={itemId => setLine(i, { itemId, unit: 'base' })}
              />
              {item && item.packs.length > 0 && (
                <SegmentedButtons
                  value={l.unit}
                  onValueChange={unit => setLine(i, { unit })}
                  buttons={[
                    { value: 'base', label: item.baseUnit, testID: `line-${i}-unit-base` },
                    ...item.packs.map(p => ({
                      value: p.packName,
                      label: p.packName,
                      testID: `line-${i}-unit-${p.packName}`,
                    })),
                  ]}
                />
              )}
              <View style={styles.row}>
                <TextInput
                  mode="outlined"
                  style={styles.flex}
                  testID={`line-${i}-qty`}
                  label={`Qty (${l.unit === 'base' ? item?.baseUnit ?? 'units' : l.unit})`}
                  keyboardType="decimal-pad"
                  value={l.qty}
                  onChangeText={qty => setLine(i, { qty })}
                />
                <TextInput
                  mode="outlined"
                  style={styles.flex}
                  testID={`line-${i}-price`}
                  label={`Rs per ${l.unit === 'base' ? item?.baseUnit ?? 'unit' : l.unit}`}
                  keyboardType="decimal-pad"
                  value={l.price}
                  onChangeText={price => setLine(i, { price })}
                />
              </View>
              {form.lines.length > 1 && (
                <Btn
                  testID={`line-${i}-remove`}
                  onPress={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>
                  Remove line
                </Btn>
              )}
            </Card.Content>
          </Card>
        );
      })}
      <Btn
        testID="add-line"
        icon="plus"
        onPress={() => setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }))}>
        Add another item
      </Btn>

      <Text variant="titleMedium" testID="purchase-total">
        {`Total ${built.ok ? formatPKR(built.totalPaisa) : '—'}`}
      </Text>
      <TextInput
        mode="outlined"
        testID="field-paid"
        label="Paid now (Rs). Blank = paid in full, 0 = on credit"
        keyboardType="decimal-pad"
        value={form.paid}
        onChangeText={paid => setForm(f => ({ ...f, paid }))}
      />
      {built.ok && (
        <Text testID="purchase-due" style={{ color: c.textSecondary }}>
          {built.paidPaisa === built.totalPaisa
            ? '✓ Paid in full'
            : `Owed to supplier: ${formatPKR(built.totalPaisa - built.paidPaisa)}`}
        </Text>
      )}
      <TextInput
        mode="outlined"
        testID="field-purchase-note"
        label="Note (optional)"
        value={form.note}
        onChangeText={note => setForm(f => ({ ...f, note }))}
      />
      <ErrorText message={error} />
      <Btn testID="save-purchase" mode="contained" onPress={submit}>
        Save purchase (stock in)
      </Btn>
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
