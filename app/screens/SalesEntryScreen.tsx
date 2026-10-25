import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import {
  buildSales,
  EMPTY_SALES_LINE,
  SalesForm,
  stockWarnings,
} from '../../src/features/sales/salesForm';
import { Body, Btn, ErrorText, Select, todayISO, useColors } from '../../src/features/ui';
import { listItems } from '../../src/services/itemService';
import { listRecipes } from '../../src/services/recipeService';
import { postSales } from '../../src/services/salesService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function SalesEntryScreen({ navigation, route }: RootProps<'SalesEntry'>) {
  const c = useColors();
  const write = useWrite();
  const { data } = useQuery(async db => ({
    recipes: await listRecipes(db),
    items: await listItems(db),
  }));
  const [form, setForm] = useState<SalesForm>({
    date: route.params?.date ?? todayISO(),
    lines: [{ ...EMPTY_SALES_LINE }],
  });
  const [error, setError] = useState<string | null>(null);

  const recipes = data?.recipes ?? [];
  const built = buildSales(form, recipes);
  const stock = new Map((data?.items ?? []).map(i => [i.id, { name: i.name, unit: i.baseUnit, qtyBase: i.qtyBase }]));
  const warnings = built.ok ? stockWarnings(built.input, recipes, stock) : [];
  const setLine = (i: number, patch: Partial<SalesForm['lines'][number]>) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const submit = async () => {
    setError(null);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const res = await write(db => postSales(db, built.input));
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <TextInput
        mode="outlined"
        testID="field-sales-date"
        label="Date (YYYY-MM-DD)"
        value={form.date}
        onChangeText={date => setForm(f => ({ ...f, date }))}
      />
      {recipes.length === 0 && (
        <Text testID="no-dishes" style={{ color: c.warning }}>
          ⚠ No dishes yet. Add a dish with its recipe first (More → Dishes and recipes).
        </Text>
      )}
      {form.lines.map((l, i) => (
        <Card key={i} testID={`sale-line-${i}`}>
          <Card.Content style={styles.gap}>
            <Select
              testID={`sale-line-${i}-dish`}
              label="Choose dish"
              value={l.recipeId}
              options={recipes.map(r => ({ value: r.id, label: r.name }))}
              onChange={recipeId => setLine(i, { recipeId })}
            />
            <TextInput
              mode="outlined"
              testID={`sale-line-${i}-qty`}
              label="Portions sold"
              keyboardType="number-pad"
              value={l.qty}
              onChangeText={qty => setLine(i, { qty })}
            />
            {form.lines.length > 1 && (
              <Btn testID={`sale-line-${i}-remove`} onPress={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>
                Remove line
              </Btn>
            )}
          </Card.Content>
        </Card>
      ))}
      <Btn testID="add-sale-line" icon="plus" onPress={() => setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_SALES_LINE }] }))}>
        Add another dish
      </Btn>

      <Text variant="titleMedium" testID="sales-total">
        {`Total sales ${built.ok ? formatPKR(built.revenuePaisa) : '—'}`}
      </Text>
      {warnings.length > 0 && (
        <View testID="stock-warning">
          {warnings.map(w => (
            <Text key={w} style={{ color: c.warning }}>{`⚠ ${w}`}</Text>
          ))}
          <Text style={{ color: c.textSecondary }}>Saving will be refused until the stock is recorded.</Text>
        </View>
      )}
      <ErrorText message={error} />
      <Btn testID="save-sales" mode="contained" onPress={submit}>
        Save sales
      </Btn>
    </Body>
  );
}

const styles = StyleSheet.create({ gap: { gap: spacing.sm } });
