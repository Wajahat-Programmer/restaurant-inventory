import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer('created_at').notNull().default(sql`(unixepoch() * 1000)`);

export const categories = sqliteTable('categories', {
  id: id(),
  name: text('name').notNull().unique(),
});

export const items = sqliteTable(
  'items',
  {
    id: id(),
    name: text('name').notNull(),
    categoryId: integer('category_id').references(() => categories.id),
    baseUnit: text('base_unit', { enum: ['g', 'ml', 'pcs'] }).notNull(),
    parLevel: real('par_level').notNull().default(0),
    reorderPoint: real('reorder_point').notNull().default(0),
    shelfLifeDays: integer('shelf_life_days'),
    barcode: text('barcode'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  t => [
    uniqueIndex('items_name_unique').on(t.name),
    uniqueIndex('items_barcode_unique').on(t.barcode),
  ],
);

export const itemPhotos = sqliteTable('item_photos', {
  id: id(),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  originalPath: text('original_path').notNull(),
  cutoutPath: text('cutout_path'),
  thumbPath: text('thumb_path').notNull(),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  width: integer('width'),
  height: integer('height'),
  createdAt: createdAt(),
});

export const unitConversions = sqliteTable(
  'unit_conversions',
  {
    id: id(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    packName: text('pack_name').notNull(),
    factorToBase: real('factor_to_base').notNull(),
  },
  t => [uniqueIndex('unit_conv_item_pack').on(t.itemId, t.packName)],
);

export const suppliers = sqliteTable('suppliers', {
  id: id(),
  name: text('name').notNull().unique(),
  phone: text('phone'),
  openingBalancePaisa: integer('opening_balance_paisa').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

/** Price history per supplier. Written by purchase posting. */
export const itemPrices = sqliteTable(
  'item_prices',
  {
    id: id(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    supplierId: integer('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    /** Display only: total / qty can be fractional paisa per base unit. */
    pricePerBase: real('price_per_base').notNull(),
    effectiveDate: text('effective_date').notNull(),
    /** Lets a voided purchase drop out of the price history. */
    purchaseId: integer('purchase_id').references(() => purchases.id),
  },
  t => [index('item_prices_item').on(t.itemId, t.effectiveDate)],
);

export const purchases = sqliteTable('purchases', {
  id: id(),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  date: text('date').notNull(),
  totalPaisa: integer('total_paisa').notNull(),
  /** Paid at the time of purchase; later payments go in supplier_payments. */
  paidPaisa: integer('paid_paisa').notNull().default(0),
  status: text('status', { enum: ['POSTED', 'VOID'] })
    .notNull()
    .default('POSTED'),
  note: text('note'),
  createdAt: createdAt(),
});

export const purchaseLines = sqliteTable('purchase_lines', {
  id: id(),
  purchaseId: integer('purchase_id')
    .notNull()
    .references(() => purchases.id),
  itemId: integer('item_id')
    .notNull()
    .references(() => items.id),
  qtyBase: real('qty_base').notNull(),
  /** Exact cost of the whole line. */
  totalPaisa: integer('total_paisa').notNull(),
});

export const supplierPayments = sqliteTable('supplier_payments', {
  id: id(),
  supplierId: integer('supplier_id')
    .notNull()
    .references(() => suppliers.id),
  purchaseId: integer('purchase_id').references(() => purchases.id),
  date: text('date').notNull(),
  amountPaisa: integer('amount_paisa').notNull(),
  method: text('method', { enum: ['cash', 'bank', 'other'] })
    .notNull()
    .default('cash'),
  createdAt: createdAt(),
});

/** Append-only ledger: rows are never updated or deleted. */
export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: id(),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    type: text('type', {
      enum: ['IN', 'ISSUE', 'WASTE', 'ADJUST', 'COUNT', 'SALE'],
    }).notNull(),
    qtyBase: real('qty_base').notNull(),
    valuePaisa: integer('value_paisa').notNull(),
    refType: text('ref_type', {
      enum: ['purchase', 'count', 'sale', 'manual'],
    }).notNull(),
    refId: integer('ref_id'),
    reason: text('reason'),
    isReversal: integer('is_reversal', { mode: 'boolean' })
      .notNull()
      .default(false),
    createdAt: createdAt(),
  },
  t => [index('movements_item').on(t.itemId, t.id)],
);

/** Cache of the ledger, rebuildable with replay(). */
export const stockLevels = sqliteTable('stock_levels', {
  itemId: integer('item_id')
    .primaryKey()
    .references(() => items.id),
  qtyBase: real('qty_base').notNull().default(0),
  valuePaisa: integer('value_paisa').notNull().default(0),
});

export const stockCounts = sqliteTable('stock_counts', {
  id: id(),
  date: text('date').notNull(),
  status: text('status', { enum: ['OPEN', 'POSTED'] })
    .notNull()
    .default('OPEN'),
  note: text('note'),
  createdAt: createdAt(),
});

export const countLines = sqliteTable(
  'count_lines',
  {
    id: id(),
    countId: integer('count_id')
      .notNull()
      .references(() => stockCounts.id),
    itemId: integer('item_id')
      .notNull()
      .references(() => items.id),
    /** Null until the item is counted. */
    countedQty: real('counted_qty'),
    /** Snapshot at count start; posting adjusts against the live level. */
    systemQty: real('system_qty').notNull(),
  },
  t => [uniqueIndex('count_lines_unique').on(t.countId, t.itemId)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
