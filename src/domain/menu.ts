import { Paisa } from './money';

export type DishClass = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export const DISH_CLASS_LABEL: Record<DishClass, string> = {
  star: '★ Star',
  plowhorse: '▲ Plowhorse',
  puzzle: '? Puzzle',
  dog: '▼ Dog',
};

export const DISH_CLASS_ADVICE: Record<DishClass, string> = {
  star: 'Sells well and earns well. Keep it, show it first.',
  plowhorse: 'Sells well but earns little. Try a small price rise or cheaper ingredients.',
  puzzle: 'Earns well but sells slowly. Show it more, or ask the staff to suggest it.',
  dog: 'Sells slowly and earns little. Think about dropping it.',
};

export interface DishSales {
  qty: number;
  revenuePaisa: Paisa;
  cogsPaisa: Paisa;
}

/** Profit per portion actually sold, in paisa. */
export const unitMargin = (s: DishSales): number => (s.qty > 0 ? (s.revenuePaisa - s.cogsPaisa) / s.qty : 0);

/**
 * Menu engineering. A dish is popular when it sells at least 70% of an even
 * share of all portions sold; it is profitable when its profit per portion is
 * at least the average profit per portion over everything sold. Dishes with no
 * sales get no class (null): there is nothing to judge them by. With fewer than
 * two dishes sold there is nothing to compare, so nobody gets a class.
 */
export function classifyDishes<T extends DishSales>(dishes: T[]): (T & { dishClass: DishClass | null })[] {
  const sold = dishes.filter(d => d.qty > 0);
  const totalQty = sold.reduce((a, d) => a + d.qty, 0);
  if (sold.length < 2) {
    return dishes.map(d => ({ ...d, dishClass: null }));
  }
  const popularAt = 0.7 * (totalQty / sold.length);
  const avgMargin = sold.reduce((a, d) => a + (d.revenuePaisa - d.cogsPaisa), 0) / totalQty;
  return dishes.map(d => {
    if (d.qty <= 0) {
      return { ...d, dishClass: null };
    }
    const popular = d.qty >= popularAt;
    const profitable = unitMargin(d) >= avgMargin;
    return { ...d, dishClass: popular ? (profitable ? 'star' : 'plowhorse') : profitable ? 'puzzle' : 'dog' };
  });
}

/**
 * The selling price that gives `targetMarginPct` percent profit on the price,
 * rounded up to a whole rupee. Null when the cost is unknown or the target is
 * not between 1 and 95.
 */
export function priceForMargin(costPaisa: Paisa, targetMarginPct: number): Paisa | null {
  if (costPaisa <= 0 || !(targetMarginPct >= 1 && targetMarginPct <= 95)) {
    return null;
  }
  return Math.ceil(costPaisa / (1 - targetMarginPct / 100) / 100 - 1e-9) * 100;
}
