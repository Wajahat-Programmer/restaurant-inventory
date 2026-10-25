import { and, eq, gte, inArray, lt, lte, ne, or, isNull, sql } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import { computePnl, Pnl } from '../domain/finance';
import { Paisa } from '../domain/money';
import { rangeMs } from '../domain/periods';
import { getCashBalance } from './cashService';
import { listItems } from './itemService';
import { listSuppliers } from './purchaseService';

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
