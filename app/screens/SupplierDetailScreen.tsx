import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { formatPKR, parseRupees } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, todayISO, useColors } from '../../src/features/ui';
import { listPurchases, listSuppliers, recordPayment } from '../../src/services/purchaseService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function SupplierDetailScreen({ navigation, route }: RootProps<'SupplierDetail'>) {
  const { supplierId } = route.params;
  const c = useColors();
  const write = useWrite();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery(async db => ({
    supplier: (await listSuppliers(db)).find(s => s.id === supplierId),
    purchases: await listPurchases(db, { supplierId }),
  }), [supplierId]);

  const supplier = data?.supplier;
  if (!supplier) {
    return <Body><Text>Loading…</Text></Body>;
  }

  const pay = async (paisa: number | null) => {
    setError(null);
    if (paisa === null) {
      setError('Enter an amount like 500 or 99.50');
      return;
    }
    const res = await write(db =>
      recordPayment(db, { supplierId, date: todayISO(), amountPaisa: paisa }),
    );
    if (res.ok) {
      setAmount('');
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="headlineSmall" testID="supplier-name">{supplier.name}</Text>
          <Text>{supplier.phone ?? 'No phone'}</Text>
          <Text
            variant="titleLarge"
            testID="supplier-due"
            style={{ color: supplier.duePaisa > 0 ? c.warning : c.success }}>
            {supplier.duePaisa > 0 ? `⚠ Owe ${formatPKR(supplier.duePaisa)}` : '✓ Settled'}
          </Text>
        </Card.Content>
      </Card>

      {supplier.duePaisa > 0 && (
        <>
          <TextInput
            mode="outlined"
            testID="field-payment"
            label="Pay supplier (Rs)"
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <Btn testID="pay-amount" mode="contained" onPress={() => pay(parseRupees(amount))}>
            Record payment
          </Btn>
          <Btn testID="pay-full" mode="outlined" onPress={() => pay(supplier.duePaisa)}>
            {`Pay all ${formatPKR(supplier.duePaisa)}`}
          </Btn>
        </>
      )}
      <ErrorText message={error} />
      <Btn testID="edit-supplier" onPress={() => navigation.navigate('SupplierForm', { supplierId })}>
        Edit supplier
      </Btn>

      <Text variant="titleMedium">Purchases</Text>
      {data.purchases.length === 0 && <Text style={{ color: c.textSecondary }}>No purchases yet.</Text>}
      {data.purchases.map(p => (
        <Text key={p.id} style={styles.num}>
          {`${p.date} · ${formatPKR(p.totalPaisa)} · ${p.status === 'VOID' ? '✖ Void' : `paid ${formatPKR(p.paidPaisa)}`}`}
        </Text>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  num: { fontVariant: ['tabular-nums'] },
});
