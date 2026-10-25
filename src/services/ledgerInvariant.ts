import { asc, eq } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import { PostedMovement, replay } from '../domain/ledger';

export interface Mismatch {
  itemId: number;
  cached: { qtyBase: number; valuePaisa: number };
  replayed: { qtyBase: number; valuePaisa: number };
}

/**
 * Rebuilds every item's stock from the append-only ledger and compares it with
 * the stock_levels cache. An empty list means they agree. Used by tests and
 * available as a health check.
 */
export async function findCacheMismatches(q: Queryable): Promise<Mismatch[]> {
  const bad: Mismatch[] = [];
  for (const lvl of await q.select().from(schema.stockLevels)) {
    const rows = await q
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.itemId, lvl.itemId))
      .orderBy(asc(schema.stockMovements.id));
    const movements: PostedMovement[] = rows.map(r => ({
      itemId: r.itemId,
      type: r.type,
      qtyBase: r.qtyBase,
      valuePaisa: r.valuePaisa,
      isReversal: r.isReversal,
    }));
    const replayed = replay(movements);
    const cached = { qtyBase: lvl.qtyBase, valuePaisa: lvl.valuePaisa };
    if (cached.qtyBase !== replayed.qtyBase || cached.valuePaisa !== replayed.valuePaisa) {
      bad.push({ itemId: lvl.itemId, cached, replayed });
    }
  }
  return bad;
}
