import { parseRupees } from '../../domain/money';
import { dishCost, dishMargin } from '../../domain/recipes';
import { parseQty } from '../../domain/units';
import { RecipeInput } from '../../domain/schemas';

export interface RecipeFormLine {
  itemId: number | null;
  /** Base units per portion, typed. */
  qty: string;
}

export interface RecipeForm {
  name: string;
  /** Selling price in rupees, typed. */
  price: string;
  lines: RecipeFormLine[];
}

export const EMPTY_RECIPE_LINE: RecipeFormLine = { itemId: null, qty: '' };

export type BuiltRecipe = { ok: true; input: RecipeInput } | { ok: false; error: string };

export function buildRecipe(f: RecipeForm): BuiltRecipe {
  if (!f.name.trim()) {
    return { ok: false, error: 'Name is required' };
  }
  const price = parseRupees(f.price);
  if (price === null) {
    return { ok: false, error: 'Selling price must be an amount like 350 or 99.50' };
  }
  const lines: RecipeInput['lines'] = [];
  for (const [i, l] of f.lines.entries()) {
    if (l.itemId === null) {
      return { ok: false, error: `Ingredient ${i + 1}: choose an item` };
    }
    const qty = parseQty(l.qty);
    if (qty === null) {
      return { ok: false, error: `Ingredient ${i + 1}: enter an amount per portion like 150 or 0.5` };
    }
    lines.push({ itemId: l.itemId, qtyBase: qty });
  }
  if (!lines.length) {
    return { ok: false, error: 'Add at least one ingredient' };
  }
  if (new Set(lines.map(l => l.itemId)).size !== lines.length) {
    return { ok: false, error: 'An ingredient is listed twice' };
  }
  return { ok: true, input: { name: f.name, sellPricePaisa: price, lines } };
}

/** Live cost and margin while the form is being filled in. */
export function previewDish(
  f: RecipeForm,
  costPerBase: Map<number, number | null>,
): { costPaisa: number; known: boolean; marginPaisa: number | null; marginPct: number | null } {
  const lines = f.lines
    .filter(l => l.itemId !== null && parseQty(l.qty) !== null)
    .map(l => ({ qtyBase: parseQty(l.qty) as number, costPerBase: costPerBase.get(l.itemId as number) ?? null }));
  const cost = dishCost(lines);
  const price = parseRupees(f.price);
  if (price === null) {
    return { costPaisa: cost.costPaisa, known: cost.known, marginPaisa: null, marginPct: null };
  }
  return { costPaisa: cost.costPaisa, known: cost.known, ...dishMargin(price, cost.costPaisa) };
}
