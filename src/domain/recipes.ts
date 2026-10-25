import { Paisa } from './money';
import { pct } from './finance';

export interface CostLine {
  qtyBase: number;
  /** Cost per base unit in paisa, or null when no stock or purchase gives one. */
  costPerBase: number | null;
}

/** Cost of one portion. `known` is false if any ingredient has no cost yet. */
export function dishCost(lines: CostLine[]): { costPaisa: Paisa; known: boolean } {
  let total = 0;
  let known = true;
  for (const l of lines) {
    if (l.costPerBase === null) {
      known = false;
    } else {
      total += l.qtyBase * l.costPerBase;
    }
  }
  return { costPaisa: Math.round(total), known };
}

export function dishMargin(price: Paisa, cost: Paisa): { marginPaisa: Paisa; marginPct: number | null } {
  return { marginPaisa: price - cost, marginPct: pct(price - cost, price) };
}

export interface NeedLine {
  /** Recipe ingredients per portion. */
  ingredients: { itemId: number; qtyBase: number }[];
  portions: number;
}

/**
 * Total base units of each ingredient needed to sell the given dishes. The same
 * ingredient in several dishes is added up, so availability is checked once.
 */
export function aggregateNeeds(lines: NeedLine[]): Map<number, number> {
  const needs = new Map<number, number>();
  for (const l of lines) {
    for (const ing of l.ingredients) {
      needs.set(ing.itemId, Math.round(((needs.get(ing.itemId) ?? 0) + ing.qtyBase * l.portions) * 1000) / 1000);
    }
  }
  return needs;
}
