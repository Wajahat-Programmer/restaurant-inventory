import { BaseUnit, formatQty } from '../../domain/units';

export interface SuggestedItem {
  itemId: number;
  name: string;
  baseUnit: BaseUnit;
  /** Suggested order in base units. */
  qty: number;
}

/** Only items with something to order. */
export function toOrder<T extends { reorder: { qty: number } | null }>(rows: T[]): (T & { reorder: { qty: number } })[] {
  return rows.filter((r): r is T & { reorder: { qty: number } } => !!r.reorder && r.reorder.qty > 0);
}

/**
 * Plain text the owner can send to a supplier. Nothing is ordered by the app:
 * choosing what to include and sharing it is the owner's confirmation.
 */
export function buildShoppingList(items: SuggestedItem[], included: Set<number>, date: string): string {
  const lines = items.filter(i => included.has(i.itemId)).map(i => `- ${i.name}: ${formatQty(i.qty, i.baseUnit)}`);
  if (!lines.length) {
    return '';
  }
  return [`Shopping list ${date}`, ...lines].join('\n');
}
