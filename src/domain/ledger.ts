import { assertPaisa, Paisa } from './money';

export type MovementType = 'IN' | 'ISSUE' | 'WASTE' | 'ADJUST' | 'COUNT' | 'SALE';

/**
 * One append-only ledger row. qtyBase is signed, in base units (g, ml, pcs).
 *
 * valuePaisa is the signed value of the movement. It is required for IN and
 * for reversals; for everything else it is derived from the running average.
 */
export interface Movement {
  itemId: number;
  type: MovementType;
  qtyBase: number;
  valuePaisa?: Paisa;
  reason?: string;
  /** Set by reverse(): a correction may carry the opposite sign of its type. */
  isReversal?: boolean;
}

/** A movement as posted: valuePaisa is always present. */
export type PostedMovement = Movement & { valuePaisa: Paisa };

/**
 * Cached stock for one item, derived from the ledger. Value is tracked as an
 * exact integer total so the weighted average never accumulates rounding
 * error: average cost = valuePaisa / qtyBase.
 */
export interface StockLevel {
  qtyBase: number;
  valuePaisa: Paisa;
}

export const EMPTY_LEVEL: StockLevel = { qtyBase: 0, valuePaisa: 0 };

const OUTFLOW: ReadonlySet<MovementType> = new Set(['ISSUE', 'WASTE', 'SALE']);

/** Weighted-average cost per base unit (may be fractional paisa). */
export function avgCost(level: StockLevel): number {
  return level.qtyBase > 0 ? level.valuePaisa / level.qtyBase : 0;
}

function validate(m: Movement): void {
  if (!Number.isFinite(m.qtyBase) || m.qtyBase === 0) {
    throw new RangeError('Movement quantity must be a non-zero number');
  }
  if (m.isReversal) {
    if (m.valuePaisa === undefined) {
      throw new RangeError('A reversal must carry the original value');
    }
    assertPaisa(m.valuePaisa);
    return;
  }
  if (m.type === 'IN') {
    if (m.qtyBase < 0) {
      throw new RangeError('IN movements must be positive');
    }
    if (m.valuePaisa === undefined) {
      throw new RangeError('IN movements need a value');
    }
    assertPaisa(m.valuePaisa);
    if (m.valuePaisa < 0) {
      throw new RangeError('Value cannot be negative');
    }
    return;
  }
  if (OUTFLOW.has(m.type) && m.qtyBase > 0) {
    throw new RangeError(`${m.type} movements must be negative`);
  }
  if (m.valuePaisa !== undefined) {
    assertPaisa(m.valuePaisa);
  }
}

/** Value that leaves with `qty` units, at the current average. */
function outflowValue(level: StockLevel, qty: number): Paisa {
  if (qty === level.qtyBase) {
    return level.valuePaisa; // emptying the item clears its value exactly
  }
  return Math.round((level.valuePaisa * qty) / level.qtyBase);
}

/**
 * Applies one movement. Returns the new level and the movement's signed value
 * (store it on the ledger row). Stock and value can never go negative, and an
 * item with zero stock holds zero value.
 */
export function applyMovement(
  level: StockLevel,
  m: Movement,
): { level: StockLevel; valuePaisa: Paisa } {
  validate(m);
  const qty = level.qtyBase + m.qtyBase;
  if (qty < 0) {
    throw new RangeError(
      `Insufficient stock: have ${level.qtyBase}, movement ${m.qtyBase}`,
    );
  }

  let valuePaisa: Paisa;
  if (m.valuePaisa !== undefined) {
    valuePaisa = m.valuePaisa;
  } else if (m.qtyBase < 0) {
    valuePaisa = -outflowValue(level, -m.qtyBase);
  } else {
    valuePaisa = Math.round(avgCost(level) * m.qtyBase);
  }

  const total = level.valuePaisa + valuePaisa;
  if (total < 0 || (qty === 0 && total !== 0)) {
    throw new RangeError(
      'Insufficient stock: this would leave inconsistent stock value ' +
        '(has the stock already been used?)',
    );
  }
  return { level: { qtyBase: qty, valuePaisa: total }, valuePaisa };
}

/** Rebuilds a level from scratch; the cache must always equal this. */
export function replay(movements: readonly PostedMovement[]): StockLevel {
  return movements.reduce<StockLevel>(
    (lvl, m) => applyMovement(lvl, m).level,
    EMPTY_LEVEL,
  );
}

/** Corrections are reversing entries, never edits or deletes. */
export function reverse(m: PostedMovement): PostedMovement {
  return {
    ...m,
    qtyBase: -m.qtyBase,
    valuePaisa: -m.valuePaisa,
    isReversal: true,
    reason: `Reversal${m.reason ? `: ${m.reason}` : ''}`,
  };
}
