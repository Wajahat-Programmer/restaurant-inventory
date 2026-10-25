import { isValidDate } from '../../domain/periods';
import { aggregateNeeds } from '../../domain/recipes';
import { BaseUnit, formatQty } from '../../domain/units';
import { RecipeRow } from '../../services/recipeService';
import { SalesInput } from '../../services/salesService';

export interface SalesFormLine {
  recipeId: number | null;
  /** Portions, typed. */
  qty: string;
}

export interface SalesForm {
  date: string;
  lines: SalesFormLine[];
}

export const EMPTY_SALES_LINE: SalesFormLine = { recipeId: null, qty: '' };

export type BuiltSales = { ok: true; input: SalesInput; revenuePaisa: number } | { ok: false; error: string };

/** Turns the typed form into a service input, or says what to fix. */
export function buildSales(f: SalesForm, recipes: Pick<RecipeRow, 'id' | 'sellPricePaisa'>[]): BuiltSales {
  if (!isValidDate(f.date)) {
    return { ok: false, error: 'Date must be a real date like 2026-10-25' };
  }
  const lines: SalesInput['lines'] = [];
  let revenuePaisa = 0;
  for (const [i, l] of f.lines.entries()) {
    const r = recipes.find(x => x.id === l.recipeId);
    if (!r) {
      return { ok: false, error: `Line ${i + 1}: choose a dish` };
    }
    if (!/^[1-9]\d{0,5}$/.test(l.qty.trim())) {
      return { ok: false, error: `Line ${i + 1}: portions must be a whole number like 12` };
    }
    const qty = Number(l.qty);
    lines.push({ recipeId: r.id, qty });
    revenuePaisa += qty * r.sellPricePaisa;
  }
  if (!lines.length) {
    return { ok: false, error: 'Add at least one dish' };
  }
  return { ok: true, input: { date: f.date, lines }, revenuePaisa };
}

/**
 * Ingredients that would run out, so the form can warn before saving. This
 * only advises: the service re-checks inside the transaction.
 */
export function stockWarnings(
  input: SalesInput,
  recipes: Pick<RecipeRow, 'id' | 'lines'>[],
  stock: Map<number, { name: string; unit: BaseUnit; qtyBase: number }>,
): string[] {
  const needs = aggregateNeeds(
    input.lines.map(l => ({
      portions: l.qty,
      ingredients: recipes.find(r => r.id === l.recipeId)?.lines ?? [],
    })),
  );
  const out: string[] = [];
  for (const [itemId, need] of needs) {
    const s = stock.get(itemId);
    if (s && s.qtyBase < need) {
      out.push(`${s.name}: need ${formatQty(need, s.unit)}, have ${formatQty(s.qtyBase, s.unit)}`);
    }
  }
  return out;
}
