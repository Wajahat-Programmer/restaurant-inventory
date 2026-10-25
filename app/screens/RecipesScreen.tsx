import { FlashList } from '@shopify/flash-list';
import { Pressable, StyleSheet, View } from 'react-native';
import { FAB, Text } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { useQuery } from '../../src/features/data';
import { ErrorText, useColors } from '../../src/features/ui';
import { listRecipes } from '../../src/services/recipeService';
import { MIN_TOUCH_TARGET, spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function RecipesScreen({ navigation }: RootProps<'Recipes'>) {
  const c = useColors();
  const { data, loading, error } = useQuery(db => listRecipes(db, { includeInactive: true }));

  return (
    <View style={[styles.fill, { backgroundColor: c.background }]}>
      <ErrorText message={error} />
      <FlashList
        data={data ?? []}
        keyExtractor={r => String(r.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? null : (
            <Text testID="recipes-empty" style={[styles.empty, { color: c.textSecondary }]}>
              No dishes yet. Tap + to add a dish and what goes into it.
            </Text>
          )
        }
        renderItem={({ item: r }) => (
          <Pressable
            testID={`recipe-${r.name}`}
            accessibilityRole="button"
            onPress={() => navigation.navigate('RecipeForm', { recipeId: r.id })}
            style={[styles.card, { backgroundColor: c.surface, borderColor: c.outline }]}>
            <View style={styles.main}>
              <Text variant="titleMedium">{r.name}</Text>
              <Text style={{ color: c.textSecondary }}>
                {`${r.lines.length} ingredient${r.lines.length === 1 ? '' : 's'}${r.isActive ? '' : ' · ✖ Off the menu'}`}
              </Text>
            </View>
            <View style={styles.side}>
              <Text style={styles.num}>{formatPKR(r.sellPricePaisa)}</Text>
              <Text style={[styles.num, { color: c.textSecondary }]}>
                {r.costKnown ? `cost ${formatPKR(r.costPaisa)}` : '⚠ cost unknown'}
              </Text>
              <Text style={[styles.num, { color: r.marginPaisa < 0 ? c.danger : c.success }]}>
                {r.costKnown ? `${r.marginPaisa < 0 ? '✖' : '✓'} margin ${formatPct(r.marginPct)}` : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />
      <FAB
        testID="fab-add-recipe"
        icon="plus"
        label="Dish"
        style={[styles.fab, { backgroundColor: c.accent }]}
        color={c.onAccent}
        onPress={() => navigation.navigate('RecipeForm')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { padding: spacing.md, paddingBottom: spacing.xl * 3 },
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
  main: { flex: 1, gap: spacing.xs },
  side: { alignItems: 'flex-end', gap: spacing.xs },
  num: { fontVariant: ['tabular-nums'] },
  fab: { position: 'absolute', right: spacing.md, bottom: spacing.md },
});
