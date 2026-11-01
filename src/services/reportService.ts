import { and, desc, eq, gte, inArray, lt, lte, ne, or, isNull, sql } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import { computePnl, Pnl } from '../domain/finance';
import { classifyDishes, DishClass, priceForMargin, unitMargin } from '../domain/menu';
import { Paisa } from '../domain/money';
import { rangeMs } from '../domain/periods';
import { getCashBalance } from './cashService';
import { listItems } from './itemService';
import { listSuppliers } from './purchaseService';
import { listRecipes } from './recipeService';
import { requirePermission } from './session';

const { sales, expenses, stockMovements, purchases, suppliers } = schema;

export interface PnlReport extends Pnl {
  from: string;
  to: string;
  salesCount: number;
  expensesByCategory: { category: string; amountPaisa: Paisa }[];
}

/**
 * Profit and loss for an inclusive date range. Sales and expenses use their
 * business date; wastage and adjustments come from the ledger, whose rows are
 * stamped with the time they were written.
 */
export async function profitAndLoss(q: Queryable, from: string, to: string): Promise<PnlReport> {
  requirePermission('finance');
  const [s] = await q
    .select({
      revenue: sql<number>`coalesce(sum(${sales.qty} * ${sales.pricePaisa}), 0)`,
      cogs: sql<number>`coalesce(sum(${sales.cogsPaisa}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(sales)
    .where(and(eq(sales.status, 'POSTED'), gte(sales.date, from), lte(sales.date, to)));

  const byCategory = await q
    .select({ category: expenses.category, amountPaisa: sql<number>`sum(${expenses.amountPaisa})` })
    .from(expenses)
    .where(and(eq(expenses.status, 'POSTED'), gte(expenses.date, from), lte(expenses.date, to)))
    .groupBy(expenses.category)
    .orderBy(expenses.category);

  const { start, end } = rangeMs(from, to);
  const inRange = and(gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end));
  const [w] = await q
    .select({ v: sql<number>`coalesce(-sum(${stockMovements.valuePaisa}), 0)` })
    .from(stockMovements)
    .where(and(inRange, eq(stockMovements.type, 'WASTE')));
  const [a] = await q
    .select({ v: sql<number>`coalesce(-sum(${stockMovements.valuePaisa}), 0)` })
    .from(stockMovements)
    .where(
      and(
        inRange,
        inArray(stockMovements.type, ['ADJUST', 'COUNT']),
        // Opening stock is not a gain.
        or(isNull(stockMovements.reason), ne(stockMovements.reason, 'Opening stock')),
      ),
    );

  const expensesTotal = byCategory.reduce((x, c) => x + c.amountPaisa, 0);
  return {
    from,
    to,
    salesCount: s.count,
    expensesByCategory: byCategory,
    ...computePnl({
      revenue: s.revenue,
      cogs: s.cogs,
      wastage: w.v,
      adjustments: a.v,
      expenses: expensesTotal,
    }),
  };
}

export interface StockValuation {
  totalPaisa: Paisa;
  byCategory: { category: string; valuePaisa: Paisa; items: number }[];
}

export async function stockValuation(q: Queryable): Promise<StockValuation> {
  requirePermission('finance');
  const rows = await listItems(q);
  const map = new Map<string, { valuePaisa: Paisa; items: number }>();
  for (const r of rows) {
    const key = r.categoryName ?? 'No category';
    const cur = map.get(key) ?? { valuePaisa: 0, items: 0 };
    map.set(key, { valuePaisa: cur.valuePaisa + r.valuePaisa, items: cur.items + 1 });
  }
  return {
    totalPaisa: rows.reduce((a, r) => a + r.valuePaisa, 0),
    byCategory: [...map].map(([category, v]) => ({ category, ...v })).sort((x, y) => y.valuePaisa - x.valuePaisa),
  };
}

/** Purchases (not voided) per supplier in the range, biggest first. */
export async function supplierSpend(q: Queryable, from: string, to: string) {
  requirePermission('finance');
  return q
    .select({
      supplierId: purchases.supplierId,
      supplier: suppliers.name,
      totalPaisa: sql<number>`sum(${purchases.totalPaisa})`,
      purchases: sql<number>`count(*)`,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(and(eq(purchases.status, 'POSTED'), gte(purchases.date, from), lte(purchases.date, to)))
    .groupBy(purchases.supplierId)
    .orderBy(sql`sum(${purchases.totalPaisa}) desc`);
}

export interface Dashboard {
  today: PnlReport;
  month: PnlReport;
  stockValuePaisa: Paisa;
  lowOrOutItems: number;
  suppliersOwedPaisa: Paisa;
  cashBalancePaisa: Paisa;
}

export async function dashboard(
  q: Queryable,
  today: string,
  month: { from: string; to: string },
): Promise<Dashboard> {
  requirePermission('finance');
  const [todayPnl, monthPnl, items, sups, cash] = await Promise.all([
    profitAndLoss(q, today, today),
    profitAndLoss(q, month.from, month.to),
    listItems(q),
    listSuppliers(q),
    getCashBalance(q),
  ]);
  return {
    today: todayPnl,
    month: monthPnl,
    stockValuePaisa: items.reduce((a, i) => a + i.valuePaisa, 0),
    lowOrOutItems: items.filter(i => i.status !== 'OK').length,
    suppliersOwedPaisa: sups.reduce((a, s) => a + Math.max(s.duePaisa, 0), 0),
    cashBalancePaisa: cash,
  };
}

export interface WastageReport {
  rows: {
    id: number;
    date: string;
    item: string;
    baseUnit: 'g' | 'ml' | 'pcs';
    qtyBase: number;
    valuePaisa: Paisa;
    reason: string | null;
  }[];
  totalPaisa: Paisa;
  /** Wastage as a share of everything used (sold plus thrown away). */
  pct: number | null;
}

/** Everything thrown away in the period, newest first, with what it cost. */
export async function wastageReport(q: Queryable, from: string, to: string): Promise<WastageReport> {
  requirePermission('finance');
  const { start, end } = rangeMs(from, to);
  const found = await q
    .select({
      id: stockMovements.id,
      createdAt: stockMovements.createdAt,
      item: schema.items.name,
      baseUnit: schema.items.baseUnit,
      qty: stockMovements.qtyBase,
      value: stockMovements.valuePaisa,
      reason: stockMovements.reason,
    })
    .from(stockMovements)
    .innerJoin(schema.items, eq(schema.items.id, stockMovements.itemId))
    .where(and(eq(stockMovements.type, 'WASTE'), gte(stockMovements.createdAt, start), lt(stockMovements.createdAt, end)))
    .orderBy(desc(stockMovements.id));
  const pnl = await profitAndLoss(q, from, to);
  const day = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return {
    rows: found.map(r => ({
      id: r.id,
      date: day(r.createdAt),
      item: r.item,
      baseUnit: r.baseUnit,
      qtyBase: -r.qty,
      valuePaisa: -r.value,
      reason: r.reason,
    })),
    totalPaisa: found.reduce((a, r) => a - r.value, 0),
    pct: pnl.wastagePct,
  };
}

export interface DishPerformance {
  recipeId: number;
  name: string;
  /** Portions sold in the period. */
  qty: number;
  revenuePaisa: Paisa;
  cogsPaisa: Paisa;
  /** Profit per portion sold; for a dish that did not sell, per portion at today's cost. */
  unitMarginPaisa: Paisa;
  /** Profit as a percent of the selling price, or null with no price. */
  marginPct: number | null;
  dishClass: DishClass | null;
  /** Today's selling price and ingredient cost of one portion. */
  sellPricePaisa: Paisa;
  costPaisa: Paisa;
  /** Price that would give the target margin; set only when the dish earns less than that now. */
  suggestedPricePaisa: Paisa | null;
}

export const TARGET_MARGIN_PCT = 65;

/**
 * How each active dish did in the period: what sold, what it earned per
 * portion, and its place on the menu (star, plowhorse, puzzle, dog). Best
 * sellers first; dishes that did not sell last.
 */
export async function dishPerformance(q: Queryable, from: string, to: string, targetPct = TARGET_MARGIN_PCT): Promise<DishPerformance[]> {
  requirePermission('finance');
  const sold = await q
    .select({
      recipeId: sales.recipeId,
      qty: sql<number>`sum(${sales.qty})`,
      revenue: sql<number>`sum(${sales.qty} * ${sales.pricePaisa})`,
      cogs: sql<number>`sum(${sales.cogsPaisa})`,
    })
    .from(sales)
    .where(and(eq(sales.status, 'POSTED'), gte(sales.date, from), lte(sales.date, to)))
    .groupBy(sales.recipeId);
  const byRecipe = new Map(sold.map(s => [s.recipeId, s]));
  const rows = (await listRecipes(q)).map(r => {
    const s = byRecipe.get(r.id);
    const stats = { qty: s?.qty ?? 0, revenuePaisa: s?.revenue ?? 0, cogsPaisa: s?.cogs ?? 0 };
    const margin = stats.qty > 0 ? unitMargin(stats) : r.marginPaisa;
    const price = stats.qty > 0 ? stats.revenuePaisa / stats.qty : r.sellPricePaisa;
    return { recipeId: r.id, name: r.name, ...stats, unitMarginPaisa: Math.round(margin), marginPct: price > 0 ? Math.round((margin / price) * 1000) / 10 : null, sellPricePaisa: r.sellPricePaisa, costPaisa: r.costPaisa, costKnown: r.costKnown };
  });
  return classifyDishes(rows)
    .map(({ costKnown, ...r }) => {
      const suggested = costKnown ? priceForMargin(r.costPaisa, targetPct) : null;
      const earnsLess = r.sellPricePaisa > 0 && r.costPaisa > 0 && ((r.sellPricePaisa - r.costPaisa) / r.sellPricePaisa) * 100 < targetPct;
      return { ...r, suggestedPricePaisa: earnsLess ? suggested : null };
    })
    .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
}
