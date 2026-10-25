import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { formatPct } from '../../src/domain/finance';
import { formatPKR } from '../../src/domain/money';
import { useQuery, useWrite } from '../../src/features/data';
import {
  buildRecipe,
  EMPTY_RECIPE_LINE,
  previewDish,
  RecipeForm,
} from '../../src/features/recipes/recipeForm';
import { Body, Btn, ErrorText, Line, Select, useColors } from '../../src/features/ui';
import { listItemPacks } from '../../src/services/itemService';
import {
  createRecipe,
  getRecipe,
  ingredientCosts,
  setRecipeActive,
  updateRecipe,
} from '../../src/services/recipeService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

export default function RecipeFormScreen({ navigation, route }: RootProps<'RecipeForm'>) {
  const recipeId = route.params?.recipeId;
  const editing = recipeId !== undefined;
  const c = useColors();
  const write = useWrite();
  const [form, setForm] = useState<RecipeForm>({ name: '', price: '', lines: [{ ...EMPTY_RECIPE_LINE }] });
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery(async db => ({
    items: await listItemPacks(db),
    costs: await ingredientCosts(db),
    existing: editing ? await getRecipe(db, recipeId) : null,
  }), [recipeId]);

  const existing = data?.existing;
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        price: (existing.sellPricePaisa / 100).toFixed(2),
        lines: existing.lines.map(l => ({ itemId: l.itemId, qty: String(l.qtyBase) })),
      });
    }
  }, [existing]);

  const items = data?.items ?? [];
  const unit = (id: number | null) => items.find(i => i.id === id)?.baseUnit ?? 'units';
  const preview = previewDish(form, new Map(data?.costs ?? []));
  const setLine = (i: number, patch: Partial<RecipeForm['lines'][number]>) =>
    setForm(f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  const submit = async () => {
    setError(null);
    const built = buildRecipe(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const res = await write(db =>
      editing ? updateRecipe(db, recipeId, built.input) : createRecipe(db, built.input).then(() => undefined),
    );
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <TextInput mode="outlined" testID="field-recipe-name" label="Dish name" value={form.name} onChangeText={name => setForm(f => ({ ...f, name }))} />
      <TextInput
        mode="outlined"
        testID="field-recipe-price"
        label="Selling price per portion (Rs)"
        keyboardType="decimal-pad"
        value={form.price}
        onChangeText={price => setForm(f => ({ ...f, price }))}
      />

      <Text variant="titleSmall">Ingredients per portion</Text>
      {form.lines.map((l, i) => (
        <Card key={i} testID={`ingredient-${i}`}>
          <Card.Content style={styles.gap}>
            <Select
              testID={`ingredient-${i}-item`}
              label="Choose ingredient"
              value={l.itemId}
              options={items.map(x => ({ value: x.id, label: x.name }))}
              onChange={itemId => setLine(i, { itemId })}
            />
            <TextInput
              mode="outlined"
              testID={`ingredient-${i}-qty`}
              label={`Amount per portion (${unit(l.itemId)})`}
              keyboardType="decimal-pad"
              value={l.qty}
              onChangeText={qty => setLine(i, { qty })}
            />
            {form.lines.length > 1 && (
              <Btn testID={`ingredient-${i}-remove`} onPress={() => setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>
                Remove ingredient
              </Btn>
            )}
          </Card.Content>
        </Card>
      ))}
      <Btn testID="add-ingredient" icon="plus" onPress={() => setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_RECIPE_LINE }] }))}>
        Add ingredient
      </Btn>

      <Card>
        <Card.Content>
          <Line testID="recipe-cost" label="Cost per portion" value={preview.known ? formatPKR(preview.costPaisa) : `${formatPKR(preview.costPaisa)} + unknown`} />
          {!preview.known && <Text style={{ color: c.warning }}>⚠ An ingredient has no stock or purchase price yet, so this cost is too low.</Text>}
          <Line
            testID="recipe-margin"
            label="Margin"
            strong
            tone={preview.marginPaisa !== null && preview.marginPaisa < 0 ? 'bad' : 'good'}
            value={preview.marginPaisa === null ? '—' : `${formatPKR(preview.marginPaisa)} (${formatPct(preview.marginPct)})`}
          />
        </Card.Content>
      </Card>

      <ErrorText message={error} />
      <Btn testID="save-recipe" mode="contained" onPress={submit}>
        {editing ? 'Save changes' : 'Add dish'}
      </Btn>
      {editing && existing && (
        <Btn
          testID="toggle-recipe-active"
          onPress={async () => {
            await write(db => setRecipeActive(db, recipeId, !existing.isActive));
            navigation.goBack();
          }}>
          {existing.isActive ? 'Take off the menu' : 'Put back on the menu'}
        </Btn>
      )}
    </Body>
  );
}

const styles = StyleSheet.create({ gap: { gap: spacing.sm } });
