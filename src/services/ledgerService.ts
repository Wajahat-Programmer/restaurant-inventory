import { eq } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import {
  applyMovement,
  EMPTY_LEVEL,
  Movement,
  PostedMovement,
  reverse,
  StockLevel,
} from '../domain/ledger';
import { ValidationError } from './errors';

export interface Ref {
  refType: 'purchase' | 'count' | 'sale' | 'manual';
  refId?: number;
}

export async function getLevel(
  q: Queryable,
  itemId: number,
): Promise<StockLevel> {
  const [row] = await q
    .select()
    .from(schema.stockLevels)
    .where(eq(schema.stockLevels.itemId, itemId));
  return row
    ? { qtyBase: row.qtyBase, valuePaisa: row.valuePaisa }
    : EMPTY_LEVEL;
}

function asUserError(e: unknown): never {
  if (e instanceof RangeError) {
    throw new ValidationError(e.message);
  }
  throw e;
}

/**
 * The only way stock changes. Must run inside a transaction: it appends the
 * ledger row and updates the stock_levels cache together.
 */
export async function postMovement(
  tx: Queryable,
  m: Movement,
  ref: Ref,
): Promise<{ id: number; level: StockLevel; valuePaisa: number }> {
  const [item] = await tx
    .select({ id: schema.items.id, isActive: schema.items.isActive })
    .from(schema.items)
    .where(eq(schema.items.id, m.itemId));
  if (!item) {
    throw new ValidationError('Item not found');
  }

  const before = await getLevel(tx, m.itemId);
  let applied;
  try {
    applied = applyMovement(before, m);
  } catch (e) {
    return asUserError(e);
  }

  const [row] = await tx
    .insert(schema.stockMovements)
    .values({
      itemId: m.itemId,
      type: m.type,
      qtyBase: m.qtyBase,
      valuePaisa: applied.valuePaisa,
      refType: ref.refType,
      refId: ref.refId ?? null,
      reason: m.reason ?? null,
      isReversal: m.isReversal ?? false,
    })
    .returning({ id: schema.stockMovements.id });

  await tx
    .insert(schema.stockLevels)
    .values({ itemId: m.itemId, ...applied.level })
    .onConflictDoUpdate({
      target: schema.stockLevels.itemId,
      set: applied.level,
    });

  return { id: row.id, level: applied.level, valuePaisa: applied.valuePaisa };
}

/** Writes the reversing entry for an earlier ledger row. */
export async function reverseMovement(
  tx: Queryable,
  movementId: number,
  ref: Ref,
): Promise<void> {
  const [orig] = await tx
    .select()
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.id, movementId));
  if (!orig) {
    throw new ValidationError('Ledger entry not found');
  }
  const posted: PostedMovement = {
    itemId: orig.itemId,
    type: orig.type,
    qtyBase: orig.qtyBase,
    valuePaisa: orig.valuePaisa,
    reason: orig.reason ?? undefined,
  };
  await postMovement(tx, reverse(posted), ref);
}
