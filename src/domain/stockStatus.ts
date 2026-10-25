export type StockStatus = 'OUT' | 'LOW' | 'OK';

/**
 * OUT at zero; LOW at or below the reorder point (only when one is set).
 * Par level is a target to refill to, not an alert threshold.
 */
export function stockStatus(qtyBase: number, reorderPoint: number): StockStatus {
  if (qtyBase <= 0) {
    return 'OUT';
  }
  return reorderPoint > 0 && qtyBase <= reorderPoint ? 'LOW' : 'OK';
}

/** Label always pairs a glyph with text; status is never colour alone. */
export const STATUS_LABEL: Record<StockStatus, string> = {
  OUT: '✖ Out',
  LOW: '⚠ Low',
  OK: '✓ In stock',
};

/** Count variance: positive = found more than the system thought. */
export function countVariance(systemQty: number, countedQty: number): number {
  return Math.round((countedQty - systemQty) * 1000) / 1000;
}
