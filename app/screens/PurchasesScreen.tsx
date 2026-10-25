import { FlashList } from '@shopify/flash-list';
import { StyleSheet, View } from 'react-native';
import { Card, FAB, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { Btn, ErrorText, todayISO, useColors } from '../../src/features/ui';
import { listItemPacks } from '../../src/services/itemService';
import { listPurchases, voidPurchase } from '../../src/services/purchaseService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';
import { useState } from 'react';

const PAYMENT_LABEL = { PAID: '✓ Paid', PARTIAL: '⚠ Part paid', CREDIT: '⚠ On credit' } as const;

export default function PurchasesScreen({ navigation }: RootProps<'Tabs'>) {
  const c = useColors();
  const write = useWrite();
  const [error, setError] = useState<string | null>(null);
  const { data, loading, error: loadError } = useQuery(async db => ({
    purchases: await listPurchases(db),
    units: new Map((await listItemPacks(db)).map(i => [i.id, i.baseUnit])),
  }));

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <ErrorText message={error ?? loadError} />
      <FlashList
        data={data?.purchases ?? []}
        keyExtractor={p => String(p.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text testID="purchases-empty" style={[styles.empty, { color: c.textSecondary }]}>
              No purchases yet. Tap + to record stock coming in.
            </Text>
          )
        }
        renderItem={({ item: p }) => (
          <Card style={styles.card} testID={`purchase-${p.id}`}>
            <Card.Content style={styles.gap}>
              <View style={styles.between}>
                <Text variant="titleMedium">{p.supplierName}</Text>
                <Text variant="titleMedium" style={styles.num}>{formatPKR(p.totalPaisa)}</Text>
              </View>
              <Text style={{ color: c.textSecondary }}>
                {`${p.date} · ${p.status === 'VOID' ? '✖ Void' : PAYMENT_LABEL[p.payment]}`}
              </Text>
              {p.lines.map(l => (
                <Text key={l.itemId} style={styles.num}>
                  {`${l.itemName}: ${formatQty(l.qtyBase, data?.units.get(l.itemId) ?? 'pcs')} · ${formatPKR(l.totalPaisa)}`}
                </Text>
              ))}
              {p.status === 'POSTED' && (
                <Btn
                  testID={`void-${p.id}`}
                  textColor={c.danger}
                  onPress={async () => {
                    setError(null);
                    const res = await write(db => voidPurchase(db, p.id, todayISO()));
                    if (!res.ok) {
                      setError(res.error);
                    }
                  }}>
                  Void purchase
                </Btn>
              )}
            </Card.Content>
          </Card>
        )}
      />
      <FAB
        testID="fab-add-purchase"
        icon="plus"
        label="Purchase"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => navigation.getParent()?.navigate('PurchaseForm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 3 },
  card: { marginBottom: spacing.sm },
  gap: { gap: spacing.xs },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  num: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
