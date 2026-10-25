import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FAB, Searchbar, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery } from '../../src/features/data';
import { ItemPhoto } from '../../src/features/photos/ItemPhoto';
import { ErrorText, StatusBadge, useColors } from '../../src/features/ui';
import { listItems } from '../../src/services/itemService';
import { MIN_TOUCH_TARGET, spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function StockScreen({ navigation }: RootProps<'Tabs'>) {
  const c = useColors();
  const [search, setSearch] = useState('');
  const { data, error, loading } = useQuery(db => listItems(db, { search }), [search]);

  const totalValue = (data ?? []).reduce((a, i) => a + i.valuePaisa, 0);
  const attention = (data ?? []).filter(i => i.status !== 'OK').length;

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <View style={styles.header}>
        <Searchbar
          testID="search"
          placeholder="Search items or barcode"
          value={search}
          onChangeText={setSearch}
        />
        <Text testID="stock-total" style={{ color: c.textSecondary }}>
          {`${data?.length ?? 0} items · Stock value ${formatPKR(totalValue)}`}
          {attention > 0 ? ` · ⚠ ${attention} need attention` : ''}
        </Text>
        <ErrorText message={error} />
      </View>

      <FlashList
        data={data ?? []}
        keyExtractor={i => String(i.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text testID="stock-empty" style={[styles.empty, { color: c.textSecondary }]}>
              {search
                ? 'No items match your search.'
                : 'No items yet. Tap + to add your first item.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`item-${item.name}`}
            accessibilityRole="button"
            onPress={() => navigation.getParent()?.navigate('ItemDetail', { itemId: item.id })}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.outline }]}>
            <ItemPhoto path={item.thumbPath} size={56} testID={`thumb-${item.name}`} />
            <View style={styles.cardMain}>
              <Text variant="titleMedium">{item.name}</Text>
              <Text style={{ color: c.textSecondary }}>
                {item.categoryName ?? 'No category'}
              </Text>
            </View>
            <View style={styles.cardSide}>
              <Text variant="titleMedium" style={styles.num}>
                {formatQty(item.qtyBase, item.baseUnit)}
              </Text>
              <Text style={[styles.num, { color: c.textSecondary }]}>
                {formatPKR(item.valuePaisa)}
              </Text>
              <StatusBadge status={item.status} />
            </View>
          </Pressable>
        )}
      />

      <FAB
        testID="fab-add-item"
        icon="plus"
        label="Item"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => navigation.getParent()?.navigate('ItemForm')}
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
    justifyContent: 'space-between',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: spacing.sm,
    borderWidth: 1,
  },
  cardMain: { flex: 1, gap: spacing.xs },
  cardSide: { alignItems: 'flex-end', gap: spacing.xs },
  num: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
