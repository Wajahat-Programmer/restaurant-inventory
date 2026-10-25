import { eq } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { countVariance } from '../domain/stockStatus';
import { must, ValidationError } from './errors';
import { postMovement } from './ledgerService';

export const WASTE_REASONS = ['spoiled', 'expired', 'burnt', 'staff meal'] as const;
export type WasteReason = (typeof WASTE_REASONS)[number];

function positive(qty: number): number {
  if (!(qty > 0) || !Number.isFinite(qty)) {
    throw new ValidationError('Quantity must be more than 0');
  }
  return qty;
}

/** Issue stock to the kitchen. */
export async function issueToKitchen(
  db: Db,
  args: { itemId: number; qtyBase: number; note?: string },
): Promise<void> {
  await inTransaction(db, async tx => {
    await postMovement(
      tx,
      {
        itemId: args.itemId,
        type: 'ISSUE',
        qtyBase: -positive(args.qtyBase),
        reason: args.note?.trim() || 'Issued to kitchen',
      },
      { refType: 'manual' },
    );
  });
}

/** Wastage always carries a reason code. */
export async function recordWaste(
  db: Db,
  args: { itemId: number; qtyBase: number; reason: WasteReason; note?: string },
): Promise<void> {
  if (!WASTE_REASONS.includes(args.reason)) {
    throw new ValidationError('Choose a wastage reason');
  }
  const note = args.note?.trim();
  await inTransaction(db, async tx => {
    await postMovement(
      tx,
      {
        itemId: args.itemId,
        type: 'WASTE',
        qtyBase: -positive(args.qtyBase),
        reason: note ? `${args.reason}: ${note}` : args.reason,
      },
      { refType: 'manual' },
    );
  });
}

/** Manual correction, up or down. A note is mandatory. */
export async function adjustStock(
  db: Db,
  args: { itemId: number; deltaBase: number; note: string },
): Promise<void> {
  const note = args.note.trim();
  if (!note) {
    throw new ValidationError('A note is required for an adjustment');
  }
  if (!args.deltaBase || !Number.isFinite(args.deltaBase)) {
    throw new ValidationError('Adjustment cannot be 0');
  }
  await inTransaction(db, async tx => {
    await postMovement(
      tx,
      { itemId: args.itemId, type: 'ADJUST', qtyBase: args.deltaBase, reason: note },
      { refType: 'manual' },
    );
  });
}

export interface CountLineRow {
  lineId: number;
  itemId: number;
  itemName: string;
  baseUnit: 'g' | 'ml' | 'pcs';
  systemQty: number;
  countedQty: number | null;
  variance: number | null;
}

/** Starts a count with a snapshot of every active item. */
export async function startCount(db: Db, date: string): Promise<number> {
  return inTransaction(db, async tx => {
    const open = await tx
      .select({ id: schema.stockCounts.id })
      .from(schema.stockCounts)
      .where(eq(schema.stockCounts.status, 'OPEN'));
    if (open.length) {
      throw new ValidationError('Finish or post the open count first');
    }
    const [c] = await tx
      .insert(schema.stockCounts)
      .values({ date })
      .returning({ id: schema.stockCounts.id });
    const rows = await tx
      .select({ id: schema.items.id, qty: schema.stockLevels.qtyBase })
      .from(schema.items)
      .leftJoin(schema.stockLevels, eq(schema.stockLevels.itemId, schema.items.id))
      .where(eq(schema.items.isActive, true));
    if (!rows.length) {
      throw new ValidationError('Add items before counting');
    }
    await tx
      .insert(schema.countLines)
      .values(rows.map(r => ({ countId: c.id, itemId: r.id, systemQty: r.qty ?? 0 })));
    return c.id;
  });
}

export async function setCounted(
  db: Db,
  lineId: number,
  countedQty: number | null,
): Promise<void> {
  if (countedQty !== null && (!(countedQty >= 0) || !Number.isFinite(countedQty))) {
    throw new ValidationError('Counted quantity cannot be negative');
  }
  const [line] = await db
    .select({ id: schema.countLines.id, status: schema.stockCounts.status })
    .from(schema.countLines)
    .innerJoin(schema.stockCounts, eq(schema.stockCounts.id, schema.countLines.countId))
    .where(eq(schema.countLines.id, lineId));
  if (!line || line.status !== 'OPEN') {
    throw new ValidationError('This count line is not open');
  }
  await db.update(schema.countLines).set({ countedQty }).where(eq(schema.countLines.id, lineId));
}

export async function getCount(
  db: Queryable,
  countId: number,
): Promise<{ id: number; date: string; status: 'OPEN' | 'POSTED'; lines: CountLineRow[] }> {
  const [c] = await db
    .select()
    .from(schema.stockCounts)
    .where(eq(schema.stockCounts.id, countId));
  must(c, 'Count not found');
  const lines = await db
    .select({
      lineId: schema.countLines.id,
      itemId: schema.countLines.itemId,
      itemName: schema.items.name,
      baseUnit: schema.items.baseUnit,
      systemQty: schema.countLines.systemQty,
      countedQty: schema.countLines.countedQty,
    })
    .from(schema.countLines)
    .innerJoin(schema.items, eq(schema.items.id, schema.countLines.itemId))
    .where(eq(schema.countLines.countId, countId))
    .orderBy(schema.items.name);
  return {
    id: c.id,
    date: c.date,
    status: c.status,
    lines: lines.map(l => ({
      ...l,
      variance:
        l.countedQty === null ? null : countVariance(l.systemQty, l.countedQty),
    })),
  };
}

export async function openCountId(db: Queryable): Promise<number | null> {
  const [c] = await db
    .select({ id: schema.stockCounts.id })
    .from(schema.stockCounts)
    .where(eq(schema.stockCounts.status, 'OPEN'));
  return c?.id ?? null;
}

/**
 * Posts COUNT adjustments for every counted line whose live stock differs from
 * what was counted. Uncounted lines are left alone.
 */
export async function postCount(
  db: Db,
  countId: number,
  /** Counts typed but not yet saved; applied in the same transaction. */
  entries: { lineId: number; countedQty: number | null }[] = [],
): Promise<number> {
  for (const e of entries) {
    if (e.countedQty !== null && (!(e.countedQty >= 0) || !Number.isFinite(e.countedQty))) {
      throw new ValidationError('Counted quantity cannot be negative');
    }
  }
  return inTransaction(db, async tx => {
    const before = await getCount(tx, countId);
    if (before.status !== 'OPEN') {
      throw new ValidationError('This count is already posted');
    }
    for (const e of entries) {
      if (!before.lines.some(l => l.lineId === e.lineId)) {
        throw new ValidationError('That line is not part of this count');
      }
      await tx
        .update(schema.countLines)
        .set({ countedQty: e.countedQty })
        .where(eq(schema.countLines.id, e.lineId));
    }
    const count = await getCount(tx, countId);
    if (!count.lines.some(l => l.countedQty !== null)) {
      throw new ValidationError('Count at least one item before posting');
    }
    let adjusted = 0;
    for (const l of count.lines) {
      if (l.countedQty === null) {
        continue;
      }
      const [lvl] = await tx
        .select({ qty: schema.stockLevels.qtyBase })
        .from(schema.stockLevels)
        .where(eq(schema.stockLevels.itemId, l.itemId));
      const delta = countVariance(lvl?.qty ?? 0, l.countedQty);
      if (delta !== 0) {
        await postMovement(
          tx,
          {
            itemId: l.itemId,
            type: 'COUNT',
            qtyBase: delta,
            reason: `Stock count #${countId}`,
          },
          { refType: 'count', refId: countId },
        );
        adjusted++;
      }
    }
    await tx
      .update(schema.stockCounts)
      .set({ status: 'POSTED' })
      .where(eq(schema.stockCounts.id, countId));
    return adjusted;
  });
}
