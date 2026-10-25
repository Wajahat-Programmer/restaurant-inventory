import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema, Tx } from '../db/client';
import { avgCost } from '../domain/ledger';
import {
  ItemData,
  ItemInput,
  itemInputSchema,
  openingStockSchema,
} from '../domain/schemas';
import { StockStatus, stockStatus } from '../domain/stockStatus';
import { BaseUnit } from '../domain/units';
import { friendly, must, ValidationError } from './errors';
import { postMovement } from './ledgerService';

const { items, categories, stockLevels, unitConversions } = schema;

export interface ItemRow {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  categoryName: string | null;
  qtyBase: number;
  valuePaisa: number;
  avgCostPerBase: number;
  parLevel: number;
  reorderPoint: number;
  status: StockStatus;
  isActive: boolean;
}

export function parseItem(input: ItemInput): ItemData {
  const r = itemInputSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0].message);
  }
  return r.data;
}

async function categoryId(
  tx: Queryable,
  name: string | undefined,
): Promise<number | null> {
  if (!name) {
    return null;
  }
  await tx.insert(categories).values({ name }).onConflictDoNothing();
  const [c] = await tx.select().from(categories).where(eq(categories.name, name));
  return c.id;
}

async function writePacks(tx: Tx, itemId: number, packs: ItemData['packs']) {
  await tx.delete(unitConversions).where(eq(unitConversions.itemId, itemId));
  if (packs.length) {
    await tx
      .insert(unitConversions)
      .values(packs.map(p => ({ itemId, ...p })));
  }
}

export async function createItem(
  db: Db,
  input: ItemInput,
  opening?: { qtyBase: number; valuePaisa: number },
): Promise<number> {
  const data = parseItem(input);
  const open = opening ? openingStockSchema.parse(opening) : undefined;
  try {
    return await inTransaction(db, async tx => {
      const [row] = await tx
        .insert(items)
        .values({
          name: data.name,
          baseUnit: data.baseUnit,
          categoryId: await categoryId(tx, data.categoryName),
          parLevel: data.parLevel,
          reorderPoint: data.reorderPoint,
          shelfLifeDays: data.shelfLifeDays ?? null,
          barcode: data.barcode ?? null,
        })
        .returning({ id: items.id });
      await writePacks(tx, row.id, data.packs);
      await tx.insert(stockLevels).values({ itemId: row.id });
      if (open) {
        await postMovement(
          tx,
          {
            itemId: row.id,
            type: 'ADJUST',
            qtyBase: open.qtyBase,
            valuePaisa: open.valuePaisa,
            reason: 'Opening stock',
          },
          { refType: 'manual' },
        );
      }
      return row.id;
    });
  } catch (e) {
    return friendly(e, 'An item with this name or barcode');
  }
}

export async function updateItem(
  db: Db,
  id: number,
  input: ItemInput,
): Promise<void> {
  const data = parseItem(input);
  try {
    await inTransaction(db, async tx => {
      const res = await tx
        .update(items)
        .set({
          name: data.name,
          baseUnit: data.baseUnit,
          categoryId: await categoryId(tx, data.categoryName),
          parLevel: data.parLevel,
          reorderPoint: data.reorderPoint,
          shelfLifeDays: data.shelfLifeDays ?? null,
          barcode: data.barcode ?? null,
        })
        .where(eq(items.id, id))
        .returning({ id: items.id });
      must(res[0], 'Item not found');
      await writePacks(tx, id, data.packs);
    });
  } catch (e) {
    friendly(e, 'An item with this name or barcode');
  }
}

export async function setItemActive(
  db: Db,
  id: number,
  isActive: boolean,
): Promise<void> {
  await db.update(items).set({ isActive }).where(eq(items.id, id));
}

function toRow(r: {
  id: number;
  name: string;
  baseUnit: BaseUnit;
  categoryName: string | null;
  qtyBase: number | null;
  valuePaisa: number | null;
  parLevel: number;
  reorderPoint: number;
  isActive: boolean;
}): ItemRow {
  const level = { qtyBase: r.qtyBase ?? 0, valuePaisa: r.valuePaisa ?? 0 };
  return {
    ...r,
    ...level,
    avgCostPerBase: avgCost(level),
    status: stockStatus(level.qtyBase, r.reorderPoint),
  };
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, c => `\\${c}`);
}

export async function listItems(
  db: Queryable,
  opts: { search?: string; includeInactive?: boolean } = {},
): Promise<ItemRow[]> {
  const term = opts.search?.trim();
  const filters = [
    opts.includeInactive ? undefined : eq(items.isActive, true),
    term
      ? or(
          sql`${items.name} like ${`%${escapeLike(term)}%`} escape '\\'`,
          like(items.barcode, term),
        )
      : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      baseUnit: items.baseUnit,
      categoryName: categories.name,
      qtyBase: stockLevels.qtyBase,
      valuePaisa: stockLevels.valuePaisa,
      parLevel: items.parLevel,
      reorderPoint: items.reorderPoint,
      isActive: items.isActive,
    })
    .from(items)
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(stockLevels, eq(stockLevels.itemId, items.id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(items.name);
  return rows.map(toRow);
}

export interface ItemDetail extends ItemRow {
  shelfLifeDays: number | null;
  barcode: string | null;
  packs: { packName: string; factorToBase: number }[];
  prices: {
    supplierId: number;
    supplierName: string;
    pricePerBase: number;
    effectiveDate: string;
  }[];
  movements: {
    id: number;
    type: string;
    qtyBase: number;
    valuePaisa: number;
    reason: string | null;
    isReversal: boolean;
    createdAt: number;
  }[];
}

export async function getItem(db: Queryable, id: number): Promise<ItemDetail> {
  const [row] = await db
    .select({
      id: items.id,
      name: items.name,
      baseUnit: items.baseUnit,
      categoryName: categories.name,
      qtyBase: stockLevels.qtyBase,
      valuePaisa: stockLevels.valuePaisa,
      parLevel: items.parLevel,
      reorderPoint: items.reorderPoint,
      isActive: items.isActive,
      shelfLifeDays: items.shelfLifeDays,
      barcode: items.barcode,
    })
    .from(items)
    .leftJoin(categories, eq(items.categoryId, categories.id))
    .leftJoin(stockLevels, eq(stockLevels.itemId, items.id))
    .where(eq(items.id, id));
  must(row, 'Item not found');

  const packs = await db
    .select({
      packName: unitConversions.packName,
      factorToBase: unitConversions.factorToBase,
    })
    .from(unitConversions)
    .where(eq(unitConversions.itemId, id))
    .orderBy(unitConversions.packName);

  // Newest price per supplier, newest first.
  const history = await db
    .select({
      supplierId: schema.itemPrices.supplierId,
      supplierName: schema.suppliers.name,
      pricePerBase: schema.itemPrices.pricePerBase,
      effectiveDate: schema.itemPrices.effectiveDate,
    })
    .from(schema.itemPrices)
    .innerJoin(schema.suppliers, eq(schema.suppliers.id, schema.itemPrices.supplierId))
    .where(eq(schema.itemPrices.itemId, id))
    .orderBy(desc(schema.itemPrices.effectiveDate), desc(schema.itemPrices.id));
  const seen = new Set<number>();
  const prices = history.filter(p => !seen.has(p.supplierId) && seen.add(p.supplierId));

  const movements = await db
    .select({
      id: schema.stockMovements.id,
      type: schema.stockMovements.type,
      qtyBase: schema.stockMovements.qtyBase,
      valuePaisa: schema.stockMovements.valuePaisa,
      reason: schema.stockMovements.reason,
      isReversal: schema.stockMovements.isReversal,
      createdAt: schema.stockMovements.createdAt,
    })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.itemId, id))
    .orderBy(desc(schema.stockMovements.id))
    .limit(50);

  return {
    ...toRow(row),
    shelfLifeDays: row.shelfLifeDays,
    barcode: row.barcode,
    packs,
    prices,
    movements,
  };
}

/** Active items with their pack sizes: what purchase entry needs, in two queries. */
export async function listItemPacks(db: Queryable): Promise<
  {
    id: number;
    name: string;
    baseUnit: BaseUnit;
    packs: { packName: string; factorToBase: number }[];
  }[]
> {
  const rows = await db
    .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
    .from(items)
    .where(eq(items.isActive, true))
    .orderBy(items.name);
  const packs = await db.select().from(unitConversions).orderBy(unitConversions.packName);
  return rows.map(r => ({
    ...r,
    packs: packs
      .filter(p => p.itemId === r.id)
      .map(p => ({ packName: p.packName, factorToBase: p.factorToBase })),
  }));
}
