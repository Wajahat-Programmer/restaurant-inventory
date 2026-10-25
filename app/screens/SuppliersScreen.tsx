import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { FAB, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { useQuery } from '../../src/features/data';
import { ErrorText, useColors } from '../../src/features/ui';
import { listSuppliers } from '../../src/services/purchaseService';
import { MIN_TOUCH_TARGET, spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function SuppliersScreen({ navigation }: RootProps<'Suppliers'>) {
  const c = useColors();
  const { data, loading, error } = useQuery(db => listSuppliers(db));
  const owed = (data ?? []).reduce((a, s) => a + Math.max(s.duePaisa, 0), 0);

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Text testID="suppliers-owed" style={{ color: c.textSecondary }}>
          {`${data?.length ?? 0} suppliers · Total owed ${formatPKR(owed)}`}
        </Text>
        <ErrorText message={error} />
      </View>
      <FlashList
        data={data ?? []}
        keyExtractor={s => String(s.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text testID="suppliers-empty" style={[styles.empty, { color: c.textSecondary }]}>
              No suppliers yet. Tap + to add one.
            </Text>
          )
        }
        renderItem={({ item: s }) => (
          <Pressable
            testID={`supplier-${s.name}`}
            accessibilityRole="button"
            onPress={() => navigation.navigate('SupplierDetail', { supplierId: s.id })}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.outline }]}>
            <View style={styles.main}>
              <Text variant="titleMedium">{s.name}</Text>
              <Text style={{ color: c.textSecondary }}>{s.phone ?? 'No phone'}</Text>
            </View>
            <Text style={[styles.num, { color: s.duePaisa > 0 ? c.warning : c.success }]}>
              {s.duePaisa > 0 ? `⚠ Owe ${formatPKR(s.duePaisa)}` : '✓ Settled'}
            </Text>
          </Pressable>
        )}
      />
      <FAB
        testID="fab-add-supplier"
        icon="plus"
        label="Supplier"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => navigation.navigate('SupplierForm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl * 3 },
  empty: { textAlign: 'center', marginTop: spacing.xl },
  card: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: spacing.sm,
    borderWidth: 1,
  },
  main: { flex: 1, gap: spacing.xs },
  num: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
