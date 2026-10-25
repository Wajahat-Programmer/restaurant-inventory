export type BaseUnit = 'g' | 'ml' | 'pcs';

export const BASE_UNITS: readonly BaseUnit[] = ['g', 'ml', 'pcs'];

/** Quantities keep at most 3 decimals so 0.1 + 0.2 style drift never shows. */
export function roundQty(qty: number): number {
  return Math.round(qty * 1000) / 1000;
}

/** Packs to base units, e.g. 2 crates x 24 pcs = 48 pcs. */
export function toBase(packQty: number, factorToBase: number): number {
  return roundQty(packQty * factorToBase);
}

/**
 * Parses a typed quantity ("2", "1.5") with at most 3 decimals. Null if not
 * valid. Zero is rejected unless `allowZero` (par levels, counts).
 */
export function parseQty(
  text: string,
  opts: { allowZero?: boolean } = {},
): number | null {
  const t = text.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t)) {
    return null;
  }
  const n = Number(t);
  return n > 0 || (opts.allowZero && n === 0) ? n : null;
}

/** Human display: 1500 g -> "1.5 kg", 2000 ml -> "2 L", 12 pcs -> "12 pcs". */
export function formatQty(qtyBase: number, unit: BaseUnit): string {
  const q = roundQty(qtyBase);
  if (unit === 'g' && Math.abs(q) >= 1000) {
    return `${roundQty(q / 1000)} kg`;
  }
  if (unit === 'ml' && Math.abs(q) >= 1000) {
    return `${roundQty(q / 1000)} L`;
  }
  return `${q} ${unit}`;
}
