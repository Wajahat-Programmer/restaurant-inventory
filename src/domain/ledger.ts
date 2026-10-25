import { assertPaisa, Paisa } from './money';

export type MovementType = 'IN' | 'ISSUE' | 'WASTE' | 'ADJUST' | 'COUNT' | 'SALE';

/** One append-only ledger row. qtyBase is signed, in base units (g, ml, pcs). */
export interface Movement {
  itemId: string;
  type: MovementType;
  qtyBase: number;
  /** Cost per base unit. Required for IN; ignored for outflows. */
  unitCostPaisa: Paisa;
  reason?: string;
  /** Set by reverse(): a correction may carry the opposite sign of its type. */
  isReversal?: boolean;
}

/** Cached stock for one item, derived from the ledger. */
export interface StockLevel {
  qtyBase: number;
  avgCostPaisa: Paisa;
}

export const EMPTY_LEVEL: StockLevel = { qtyBase: 0, avgCostPaisa: 0 };

const OUTFLOW: ReadonlySet<MovementType> = new Set(['ISSUE', 'WASTE', 'SALE']);

function validate(m: Movement): void {
  if (!Number.isFinite(m.qtyBase) || m.qtyBase === 0) {
    throw new RangeError('Movement quantity must be a non-zero number');
  }
  if (!m.isReversal && m.type === 'IN' && m.qtyBase < 0) {
    throw new RangeError('IN movements must be positive');
  }
  if (!m.isReversal && OUTFLOW.has(m.type) && m.qtyBase > 0) {
    throw new RangeError(`${m.type} movements must be negative`);
  }
  if (m.type === 'IN' && !m.isReversal) {
    assertPaisa(m.unitCostPaisa);
    if (m.unitCostPaisa < 0) {
      throw new RangeError('Unit cost cannot be negative');
    }
  }
}

/**
 * Applies one movement to a stock level. Weighted-average cost is recomputed
 * on IN only; every other type keeps the average. Stock can never go negative.
 */
export function applyMovement(level: StockLevel, m: Movement): StockLevel {
  validate(m);
  const qty = level.qtyBase + m.qtyBase;
  if (qty < 0) {
    throw new RangeError(
      `Insufficient stock: have ${level.qtyBase}, movement ${m.qtyBase}`,
    );
  }
  if (m.type !== 'IN' || m.isReversal) {
    return { qtyBase: qty, avgCostPaisa: level.avgCostPaisa };
  }
  const total = level.qtyBase * level.avgCostPaisa + m.qtyBase * m.unitCostPaisa;
  return { qtyBase: qty, avgCostPaisa: Math.round(total / qty) };
}

/** Value of a level in integer paisa. */
export function stockValue(level: StockLevel): Paisa {
  return Math.round(level.qtyBase * level.avgCostPaisa);
}

/** Rebuilds a level from scratch; the cache must always equal this. */
export function replay(movements: readonly Movement[]): StockLevel {
  return movements.reduce(applyMovement, EMPTY_LEVEL);
}

/** Corrections are reversing entries, never edits or deletes. */
export function reverse(m: Movement): Movement {
  return {
    ...m,
    qtyBase: -m.qtyBase,
    isReversal: true,
    reason: `Reversal${m.reason ? `: ${m.reason}` : ''}`,
  };
}
