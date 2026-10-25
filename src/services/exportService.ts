import { and, asc, eq, gte, lt, lte } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import { Cell, toCsv } from '../domain/csv';
import { rangeMs } from '../domain/periods';
import { listItems } from './itemService';
import { requirePermission } from './session';

const { stockMovements, purchases, purchaseLines, sales, expenses, cashEntries, suppliers, items, recipes } = schema;

/** Rupees as text with two decimals, exact (paisa is an integer). */
export const rupees = (paisa: number): string => {
  const sign = paisa < 0 ? '-' : '';
  const a = Math.abs(paisa);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};

const csv = (rows: Cell[][]) => toCsv(rows, { bom: true });

function guard() {
  // Data leaving the phone is the owner's call.
  requirePermission('manage');
}

/** Items with their current stock, in the same columns the item import reads. */
export async function exportItems(q: Queryable): Promise<string> {
  guard();
  const list = await listItems(q, { includeInactive: true });
  const meta = new Map((await q.select().from(items)).map(i => [i.id, i]));
  return csv([
    ['Name', 'Base unit', 'Category', 'Par level', 'Reorder point', 'Shelf life days', 'Barcode', 'Opening quantity', 'Opening value Rs', 'Active'],
    ...list.map(i => [
      i.name,
      i.baseUnit,
      i.categoryName ?? '',
      i.parLevel,
      i.reorderPoint,
      meta.get(i.id)?.shelfLifeDays ?? '',
      meta.get(i.id)?.barcode ?? '',
      // No stock is left blank, so the file imports back cleanly.
      i.qtyBase > 0 ? i.qtyBase : '',
      i.qtyBase > 0 ? rupees(i.valuePaisa) : '',
      i.isActive ? 'yes' : 'no',
    ]),
  ]);
}

/** Every stock movement in the date range (when each was recorded, local time). */
export async function exportLedger(q: Queryable, from: string, to: string): Promise<string> {
  guard();
  const { start, end } = rangeMs(from, to);
  const rows = await q
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      item: items.name,
      type: stockMovements.type,
      qty: stockMovements.qtyBase,
      unit: items.baseUnit,
      value: stockMovements.valuePaisa,
      reason: stockMovements.reason,
      reversal: stockMovements.isReversal,
      refType: stockMovements.refType,
      refId: stockMovements.refId,
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .where(and(gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end)))
    .orderBy(asc(stockMovements.id));
  return csv([
    ['Entry', 'Recorded at', 'Item', 'Type', 'Quantity', 'Unit', 'Value Rs', 'Reason', 'Reversal', 'Source', 'Source number'],
    ...rows.map(r => [
      r.id,
      new Date(r.createdAt).toISOString(),
      r.item,
      r.type,
      r.qty,
      r.unit,
      rupees(r.value),
      r.reason ?? '',
      r.reversal ? 'yes' : '',
      r.refType,
      r.refId ?? '',
    ]),
  ]);
}

export async function exportPurchases(q: Queryable, from: string, to: string): Promise<string> {
  guard();
  const rows = await q
    .select({
      id: purchases.id,
      date: purchases.date,
      supplier: suppliers.name,
      item: items.name,
      qty: purchaseLines.qtyBase,
      unit: items.baseUnit,
      lineTotal: purchaseLines.totalPaisa,
      total: purchases.totalPaisa,
      paid: purchases.paidPaisa,
      status: purchases.status,
    })
    .from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .innerJoin(items, eq(items.id, purchaseLines.itemId))
    .where(and(gte(purchases.date, from), lte(purchases.date, to)))
    .orderBy(asc(purchases.date), asc(purchases.id));
  return csv([
    ['Purchase', 'Date', 'Supplier', 'Item', 'Quantity', 'Unit', 'Line total Rs', 'Purchase total Rs', 'Paid at purchase Rs', 'Status'],
    ...rows.map(r => [r.id, r.date, r.supplier, r.item, r.qty, r.unit, rupees(r.lineTotal), rupees(r.total), rupees(r.paid), r.status]),
  ]);
}

export async function exportSales(q: Queryable, from: string, to: string): Promise<string> {
  guard();
  const rows = await q
    .select({
      id: sales.id,
      date: sales.date,
      dish: recipes.name,
      qty: sales.qty,
      price: sales.pricePaisa,
      cogs: sales.cogsPaisa,
      status: sales.status,
    })
    .from(sales)
    .innerJoin(recipes, eq(recipes.id, sales.recipeId))
    .where(and(gte(sales.date, from), lte(sales.date, to)))
    .orderBy(asc(sales.date), asc(sales.id));
  return csv([
    ['Sale', 'Date', 'Dish', 'Portions', 'Price each Rs', 'Revenue Rs', 'Ingredient cost Rs', 'Status'],
    ...rows.map(r => [r.id, r.date, r.dish, r.qty, rupees(r.price), rupees(r.qty * r.price), rupees(r.cogs), r.status]),
  ]);
}

export async function exportExpenses(q: Queryable, from: string, to: string): Promise<string> {
  guard();
  const rows = await q
    .select()
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to)))
    .orderBy(asc(expenses.date), asc(expenses.id));
  return csv([
    ['Expense', 'Date', 'Category', 'Amount Rs', 'Paid by', 'Note', 'Status'],
    ...rows.map(r => [r.id, r.date, r.category, rupees(r.amountPaisa), r.method, r.note ?? '', r.status]),
  ]);
}

export async function exportCashBook(q: Queryable, from: string, to: string): Promise<string> {
  guard();
  const rows = await q
    .select()
    .from(cashEntries)
    .where(and(gte(cashEntries.date, from), lte(cashEntries.date, to)))
    .orderBy(asc(cashEntries.date), asc(cashEntries.id));
  return csv([
    ['Entry', 'Date', 'Direction', 'Amount Rs', 'Source', 'Source number', 'Method', 'Reversal', 'Note'],
    ...rows.map(r => [r.id, r.date, r.direction, rupees(r.amountPaisa), r.source, r.refId ?? '', r.method, r.isReversal ? 'yes' : '', r.note ?? '']),
  ]);
}

export type ExportKind = 'items' | 'ledger' | 'purchases' | 'sales' | 'expenses' | 'cashbook';

export const EXPORTS: { kind: ExportKind; label: string; needsRange: boolean }[] = [
  { kind: 'items', label: 'Items and stock', needsRange: false },
  { kind: 'ledger', label: 'Stock ledger', needsRange: true },
  { kind: 'purchases', label: 'Purchases', needsRange: true },
  { kind: 'sales', label: 'Sales', needsRange: true },
  { kind: 'expenses', label: 'Expenses', needsRange: true },
  { kind: 'cashbook', label: 'Cash book', needsRange: true },
];

/** One entry point for the screen: the CSV text and a file name. */
export async function exportCsv(q: Queryable, kind: ExportKind, from: string, to: string) {
  const text =
    kind === 'items'
      ? await exportItems(q)
      : kind === 'ledger'
      ? await exportLedger(q, from, to)
      : kind === 'purchases'
      ? await exportPurchases(q, from, to)
      : kind === 'sales'
      ? await exportSales(q, from, to)
      : kind === 'expenses'
      ? await exportExpenses(q, from, to)
      : await exportCashBook(q, from, to);
  return { text, fileName: kind === 'items' ? `items-${to}.csv` : `${kind}-${from}-to-${to}.csv` };
}
