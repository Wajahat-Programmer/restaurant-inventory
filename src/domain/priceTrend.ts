import { formatPKR } from './money';
import { BaseUnit } from './units';

export interface PricePoint {
  /** Business date of the purchase, YYYY-MM-DD. */
  date: string;
  /** Tie-breaker for two purchases on one day: the later row wins. */
  id: number;
  /** Paisa per base unit (g, ml or piece). */
  pricePerBase: number;
}

export interface PriceRise {
  latest: number;
  usual: number;
  /** How much dearer than usual, as a fraction (0.12 = 12% more). */
  rise: number;
  date: string;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Has the last price paid jumped above what this item usually costs? "Usually"
 * is the median of up to the 5 purchases before it (one odd bargain or one odd
 * spike does not move a median). Only a fresh jump counts: the last purchase
 * must be within `freshDays` of today, so an old rise stops nagging.
 */
export function priceRise(
  points: PricePoint[],
  today: string,
  opts: { minRise?: number; freshDays?: number } = {},
): PriceRise | null {
  const minRise = opts.minRise ?? 0.1;
  const freshDays = opts.freshDays ?? 14;
  const ordered = [...points].sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1));
  if (ordered.length < 2) {
    return null;
  }
  const last = ordered[ordered.length - 1];
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000;
  if (age > freshDays) {
    return null;
  }
  const usual = median(ordered.slice(-6, -1).map(p => p.pricePerBase));
  if (usual <= 0) {
    return null;
  }
  const rise = last.pricePerBase / usual - 1;
  return rise >= minRise ? { latest: last.pricePerBase, usual, rise, date: last.date } : null;
}

/** "Rs 580.00 per kg" for a price kept as paisa per gram (or per litre, or each). */
export function pricePerLabel(pricePerBase: number, unit: BaseUnit): string {
  const big = unit !== 'pcs';
  return `${formatPKR(Math.round(pricePerBase * (big ? 1000 : 1)))} per ${unit === 'g' ? 'kg' : unit === 'ml' ? 'litre' : 'piece'}`;
}
