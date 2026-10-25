import { Paisa } from './money';

/** A percentage to one decimal place, or null when there is nothing to divide by. */
export function pct(part: number, whole: number): number | null {
  if (!(whole > 0)) {
    return null;
  }
  return Math.round((part / whole) * 1000) / 10;
}

export function formatPct(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

export interface PnlInput {
  revenue: Paisa;
  /** Ingredient cost of what was sold. */
  cogs: Paisa;
  /** Stock thrown away (WASTE movements). */
  wastage: Paisa;
  /** Net stock write-downs from counts and manual adjustments (a gain is negative). */
  adjustments: Paisa;
  /** Rent, salaries, gas and the rest. */
  expenses: Paisa;
}

export interface Pnl extends PnlInput {
  grossProfit: Paisa;
  netProfit: Paisa;
  /** COGS as a share of revenue. */
  foodCostPct: number | null;
  /** Wastage as a share of everything consumed (COGS + wastage). */
  wastagePct: number | null;
}

/**
 * Purchases are not an expense: stock is an asset until it is sold (COGS) or
 * lost (wastage, adjustments).
 *   gross = revenue - COGS
 *   net   = gross - wastage - adjustments - expenses
 */
export function computePnl(i: PnlInput): Pnl {
  const grossProfit = i.revenue - i.cogs;
  return {
    ...i,
    grossProfit,
    netProfit: grossProfit - i.wastage - i.adjustments - i.expenses,
    foodCostPct: pct(i.cogs, i.revenue),
    wastagePct: pct(i.wastage, i.cogs + i.wastage),
  };
}

/** Cash book balance: money in minus money out. */
export function cashBalance(entries: { direction: 'IN' | 'OUT'; amountPaisa: Paisa }[]): Paisa {
  return entries.reduce((a, e) => a + (e.direction === 'IN' ? e.amountPaisa : -e.amountPaisa), 0);
}
