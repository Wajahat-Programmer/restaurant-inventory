import { asc, eq } from 'drizzle-orm';
import { Queryable, schema } from '../db/client';
import {
  daysToStockout,
  Forecast,
  forecastUsage,
  outlook,
  Reorder,
  suggestReorder,
  usageAnomaly,
  wastageSpike,
} from '../domain/forecast';
import { expiryStatus, ExpiryStatus, remainingLots } from '../domain/lots';
import { addDays, periodRange } from '../domain/periods';
import { BaseUnit, formatQty } from '../domain/units';
import { listItems } from './itemService';
import { getIntSetting } from './settingsService';

const { stockMovements, items, sales, expenses } = schema;

/** The local business date of a timestamp. */
export function dateOf(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const CONSUMED = ['ISSUE', 'SALE', 'WASTE'] as const;

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** One value per calendar day from `start` to `end` inclusive, zero where nothing happened. */
function fillDays(start: string, end: string, byDay: Map<string, number>): number[] {
  const n = daysBetween(start, end) + 1;
  return n > 0 ? Array.from({ length: n }, (_, i) => byDay.get(addDays(start, i)) ?? 0) : [];
}

export interface ItemForecast {
  itemId: number;
  name: string;
  baseUnit: BaseUnit;
  onHand: number;
  forecast: Forecast;
  /** Days of stock left at the forecast rate. Null when hidden or beyond the forecast. */
  daysLeft: number | null;
  reorder: Reorder | null;
  expiry: ExpiryStatus;
  usageSpike: boolean;
  /** Total expected use over the next 7 days (for display). */
  next7: number | null;
}

/**
 * Usage per day for every item, from the first day it moved until yesterday.
 * Today is left out: it is not over yet, so it would drag the forecast down.
 */
async function dailyUsage(q: Queryable, today: string) {
  const rows = await q
    .select({
      itemId: stockMovements.itemId,
      type: stockMovements.type,
      qtyBase: stockMovements.qtyBase,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .orderBy(asc(stockMovements.id));

  const first = new Map<number, string>();
  const used = new Map<number, Map<string, number>>();
  const lots = new Map<number, { date: string; qtyBase: number }[]>();
  for (const r of rows) {
    const d = dateOf(r.createdAt);
    if (!first.has(r.itemId)) {
      first.set(r.itemId, d);
    }
    (lots.get(r.itemId) ?? lots.set(r.itemId, []).get(r.itemId)!).push({ date: d, qtyBase: r.qtyBase });
    if ((CONSUMED as readonly string[]).includes(r.type)) {
      const m = used.get(r.itemId) ?? new Map<string, number>();
      m.set(d, (m.get(d) ?? 0) - r.qtyBase);
      used.set(r.itemId, m);
    }
  }
  const yesterday = addDays(today, -1);
  return { first, used, lots, yesterday };
}

/** Forecast, days left, suggested reorder and expiry for every active item. */
export async function itemForecasts(q: Queryable, today: string): Promise<ItemForecast[]> {
  const leadDays = await getIntSetting(q, 'forecast.leadDays', 0, 60);
  const reviewDays = await getIntSetting(q, 'forecast.reviewDays', 1, 60);
  const [list, usage] = await Promise.all([listItems(q), dailyUsage(q, today)]);
  const shelf = new Map((await q.select({ id: items.id, shelfLifeDays: items.shelfLifeDays }).from(items)).map(i => [i.id, i.shelfLifeDays]));

  const out: ItemForecast[] = list.map(it => {
    const start = usage.first.get(it.id);
    const series = start ? fillDays(start, usage.yesterday, usage.used.get(it.id) ?? new Map()) : [];
    const forecast = forecastUsage(series);
    const daysLeft = forecast.shown ? daysToStockout(it.qtyBase, forecast.daily) : null;
    const reorder = forecast.shown
      ? suggestReorder({ daily: forecast.daily, sigma: forecast.sigma, onHand: it.qtyBase, leadDays, reviewDays })
      : null;
    return {
      itemId: it.id,
      name: it.name,
      baseUnit: it.baseUnit,
      onHand: it.qtyBase,
      forecast,
      daysLeft,
      reorder,
      expiry: expiryStatus(remainingLots(usage.lots.get(it.id) ?? []), shelf.get(it.id) ?? null, today),
      usageSpike: series.length ? usageAnomaly(series).flagged : false,
      next7: forecast.shown ? Math.round(forecast.daily.slice(0, 7).reduce((a, b) => a + b, 0)) : null,
    };
  });

  // Soonest to run out first; items with no forecast last.
  return out.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity) || a.name.localeCompare(b.name));
}

export interface Alert {
  kind: 'out' | 'low' | 'expired' | 'expiring' | 'usage' | 'wastage' | 'runout';
  itemId?: number;
  message: string;
}

/** Weekly wastage value for the 5 weeks ending with the week of `today` (Mon-Sun). */
async function weeklyWastage(q: Queryable, today: string): Promise<number[]> {
  const thisWeek = periodRange('week', today).from;
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(thisWeek, -7 * (4 - i)));
  const rows = await q
    .select({ v: stockMovements.valuePaisa, createdAt: stockMovements.createdAt })
    .from(stockMovements)
    .where(eq(stockMovements.type, 'WASTE'));
  const totals = new Map<string, number>();
  for (const r of rows) {
    const wk = periodRange('week', dateOf(r.createdAt)).from;
    totals.set(wk, (totals.get(wk) ?? 0) - r.v);
  }
  return weeks.map(w => totals.get(w) ?? 0);
}

/** Everything that needs the owner's attention right now, most urgent first. */
export async function alerts(q: Queryable, today: string): Promise<Alert[]> {
  const list: Alert[] = [];
  const forecasts = await itemForecasts(q, today);
  for (const f of forecasts) {
    const q1 = (n: number) => formatQty(n, f.baseUnit);
    if (f.onHand <= 0) {
      list.push({ kind: 'out', itemId: f.itemId, message: `✖ ${f.name} is out of stock` });
    }
    if (f.expiry.expiredQty > 0) {
      list.push({ kind: 'expired', itemId: f.itemId, message: `✖ ${f.name}: ${q1(f.expiry.expiredQty)} has expired` });
    }
    if (f.expiry.expiringQty > 0) {
      list.push({ kind: 'expiring', itemId: f.itemId, message: `⚠ ${f.name}: ${q1(f.expiry.expiringQty)} expires within 2 days` });
    }
    if (f.onHand > 0 && f.daysLeft !== null && f.daysLeft <= 3) {
      list.push({ kind: 'runout', itemId: f.itemId, message: `⚠ ${f.name} will run out in about ${f.daysLeft} days` });
    }
    if (f.usageSpike) {
      list.push({ kind: 'usage', itemId: f.itemId, message: `⚠ ${f.name}: yesterday's use was unusually high. Check for waste or theft.` });
    }
  }
  const low = (await listItems(q)).filter(i => i.status === 'LOW');
  for (const i of low) {
    list.push({ kind: 'low', itemId: i.id, message: `⚠ ${i.name} is low (${formatQty(i.qtyBase, i.baseUnit)} left)` });
  }
  const spike = wastageSpike(await weeklyWastage(q, today));
  if (spike.flagged) {
    list.push({ kind: 'wastage', message: `⚠ Wastage this week is ${spike.ratio}× the usual. Look at what is being thrown away.` });
  }
  const rank = { out: 0, expired: 1, runout: 2, expiring: 3, low: 4, usage: 5, wastage: 6 } as const;
  return list.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

export interface Outlook {
  revenue: { forecast: Forecast; next7: { expected: number; low: number; high: number } | null };
  /** What recurring costs have been over recent full months. */
  monthlyExpenses: { expected: number; low: number; high: number } | null;
}

/** Revenue for the next 7 days and expected monthly expenses, both as ranges. */
export async function financialOutlook(q: Queryable, today: string): Promise<Outlook> {
  const rows = await q
    .select({ date: sales.date, qty: sales.qty, price: sales.pricePaisa })
    .from(sales)
    .where(eq(sales.status, 'POSTED'))
    .orderBy(asc(sales.date));
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.qty * r.price);
  }
  const yesterday = addDays(today, -1);
  const series = rows.length ? fillDays(rows[0].date, yesterday, byDay) : [];
  const forecast = forecastUsage(series);
  const next7 = forecast.shown
    ? {
        expected: Math.round(forecast.daily.slice(0, 7).reduce((a, b) => a + b, 0)),
        low: Math.round(forecast.low.slice(0, 7).reduce((a, b) => a + b, 0)),
        high: Math.round(forecast.high.slice(0, 7).reduce((a, b) => a + b, 0)),
      }
    : null;

  const exp = await q
    .select({ date: expenses.date, amount: expenses.amountPaisa })
    .from(expenses)
    .where(eq(expenses.status, 'POSTED'));
  const thisMonth = periodRange('month', today).from;
  const perMonth = new Map<string, number>();
  for (const e of exp) {
    const m = periodRange('month', e.date).from;
    if (m < thisMonth) {
      perMonth.set(m, (perMonth.get(m) ?? 0) + e.amount);
    }
  }
  return {
    revenue: { forecast, next7 },
    monthlyExpenses: outlook([...perMonth.values()].slice(-3)),
  };
}
