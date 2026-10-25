import { eq } from 'drizzle-orm';
import { Db, schema } from '../db/client';
import { createTestDb } from '../db/testing';
import { addDays } from '../domain/periods';
import { addExpense } from './expenseService';
import { alerts, dateOf, financialOutlook, itemForecasts } from './forecastService';
import { createItem } from './itemService';
import { createRecipe } from './recipeService';
import { getIntSetting, getSetting, setSetting } from './settingsService';
import { postSales } from './salesService';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const pad = (n: number) => String(n).padStart(2, '0');
const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();
/** Noon local time on a business date, so daylight saving cannot move it. */
const noon = (date: string) => new Date(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 12).getTime();

/** Writes a ledger row on a past day. The stock cache is set separately. */
async function move(itemId: number, date: string, type: 'IN' | 'ISSUE' | 'SALE' | 'WASTE', qty: number, value = 0) {
  await db.insert(schema.stockMovements).values({
    itemId,
    type,
    qtyBase: qty,
    valuePaisa: value,
    refType: 'manual',
    createdAt: noon(date),
  });
}
const setStock = (itemId: number, qty: number, value = 0) =>
  db.insert(schema.stockLevels).values({ itemId, qtyBase: qty, valuePaisa: value }).onConflictDoUpdate({ target: schema.stockLevels.itemId, set: { qtyBase: qty, valuePaisa: value } });

const WEEK = [100, 100, 100, 100, 150, 200, 50];

/** `weeks` full weeks of issues ending yesterday, following the weekly pattern. */
async function history(itemId: number, weeks: number) {
  const days = weeks * 7;
  await move(itemId, addDays(TODAY, -days), 'IN', 100000, 1000000);
  for (let i = days; i >= 1; i--) {
    const date = addDays(TODAY, -i);
    await move(itemId, date, 'ISSUE', -WEEK[(days - i) % 7]);
  }
}

describe('itemForecasts', () => {
  it('forecasts usage, days left and a reorder suggestion from the ledger', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g', reorderPoint: 200 });
    await history(id, 8);
    await setStock(id, 250, 2500);
    const [f] = await itemForecasts(db, TODAY);
    expect(f.forecast).toMatchObject({ method: 'holt-winters', shown: true });
    expect(f.daysLeft).toBeGreaterThan(0);
    expect(f.daysLeft).toBeLessThan(4);
    expect(f.next7).toBeGreaterThan(700);
    expect(f.next7).toBeLessThan(1000);
    // Lead 2 + review 7 days: about 9 days of use minus 250 on hand, plus safety stock.
    expect(f.reorder!.qty).toBeGreaterThan(600);
  });

  it('keeps today out of the series', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await history(id, 8);
    await setStock(id, 5000);
    const before = (await itemForecasts(db, TODAY))[0].forecast.daily[0];
    await move(id, TODAY, 'ISSUE', -99999); // a huge, unfinished day
    expect((await itemForecasts(db, TODAY))[0].forecast.daily[0]).toBe(before);
  });

  it('hides the forecast for a new item and explains why', async () => {
    const id = await createItem(db, { name: 'Salt', baseUnit: 'g' });
    await move(id, addDays(TODAY, -5), 'IN', 1000, 100);
    await move(id, addDays(TODAY, -2), 'ISSUE', -50);
    await setStock(id, 950, 95);
    const [f] = await itemForecasts(db, TODAY);
    expect(f.forecast.shown).toBe(false);
    expect(f.forecast.reason).toContain('14 days');
    expect(f.daysLeft).toBeNull();
    expect(f.reorder).toBeNull();
  });

  it('counts sales and wastage as usage, and a reversal gives it back', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const start = addDays(TODAY, -20);
    await move(id, start, 'IN', 50000, 500000);
    for (let i = 20; i >= 1; i--) {
      const d = addDays(TODAY, -i);
      await move(id, d, 'SALE', -60);
      await move(id, d, 'WASTE', -40);
    }
    await setStock(id, 30000);
    const [f] = await itemForecasts(db, TODAY);
    expect(f.forecast.daily[0]).toBeCloseTo(100, 0);
  });

  it('flags stock that has outlived its shelf life, using oldest stock first', async () => {
    const id = await createItem(db, { name: 'Milk', baseUnit: 'ml', shelfLifeDays: 4 });
    await move(id, addDays(TODAY, -10), 'IN', 2000, 20000); // expired
    await move(id, addDays(TODAY, -9), 'ISSUE', -500); // uses the old lot first
    await move(id, addDays(TODAY, -1), 'IN', 1000, 10000); // fresh
    await setStock(id, 2500);
    const [f] = await itemForecasts(db, TODAY);
    expect(f.expiry.expiredQty).toBe(1500);
    expect(f.expiry.expiringQty).toBe(0);
  });
});

describe('alerts', () => {
  it('lists out, low, expired, expiring and running-out items, most urgent first', async () => {
    const out = await createItem(db, { name: 'Salt', baseUnit: 'g' });
    const low = await createItem(db, { name: 'Oil', baseUnit: 'ml', reorderPoint: 500 });
    const milk = await createItem(db, { name: 'Milk', baseUnit: 'ml', shelfLifeDays: 4 });
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await setStock(out, 0);
    await setStock(low, 300, 3000);
    await move(milk, addDays(TODAY, -10), 'IN', 1000, 10000);
    await setStock(milk, 1000, 10000);
    await history(rice, 8);
    await setStock(rice, 250, 2500);

    const list = await alerts(db, TODAY);
    expect(list.map(a => a.kind)).toEqual(['out', 'expired', 'runout', 'low']);
    expect(list[0].message).toBe('✖ Salt is out of stock');
    expect(list[1].message).toContain('Milk: 1 L has expired');
    expect(list[2].message).toMatch(/Rice will run out in about [\d.]+ days/);
    expect(list[3].message).toBe('⚠ Oil is low (300 ml left)');
  });

  it('is empty when everything is fine', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g', reorderPoint: 100 });
    await setStock(id, 5000, 50000);
    expect(await alerts(db, TODAY)).toEqual([]);
  });

  it('flags a wastage week well above the usual', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await setStock(id, 50000, 500000);
    // Rs 100 of waste in each of the four earlier weeks, Rs 500 this week.
    for (let w = 1; w <= 4; w++) {
      await move(id, addDays(TODAY, -7 * w), 'WASTE', -100, -10000);
    }
    await move(id, TODAY, 'WASTE', -500, -50000);
    const list = await alerts(db, TODAY);
    expect(list.map(a => a.kind)).toContain('wastage');
    expect(list.find(a => a.kind === 'wastage')!.message).toContain('5×');
  });
});

describe('financialOutlook', () => {
  it('forecasts the next 7 days of sales as a range, and expenses from past months', async () => {
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 1000000, valuePaisa: 10000000 });
    const dish = await createRecipe(db, { name: 'Pulao', sellPricePaisa: 10000, lines: [{ itemId: rice, qtyBase: 1 }] });
    for (let i = 56; i >= 1; i--) {
      const d = addDays(TODAY, -i);
      await postSales(db, { date: d, lines: [{ recipeId: dish, qty: WEEK[(56 - i) % 7] / 10 }] });
    }
    const prev = (n: number) => {
      const d = new Date(+TODAY.slice(0, 4), +TODAY.slice(5, 7) - 1 - n, 5);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    await addExpense(db, { date: prev(1), category: 'rent', amountPaisa: 3000000 });
    await addExpense(db, { date: prev(2), category: 'rent', amountPaisa: 2800000 });
    await addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 99999 }); // this month: not a full month

    const o = await financialOutlook(db, TODAY);
    expect(o.revenue.forecast.shown).toBe(true);
    const n = o.revenue.next7!;
    // A week of 800 units' worth of dishes at Rs 100 each is Rs 8,000 = 800,000 paisa.
    // This history has no noise, so the range is as tight as the forecast is exact.
    expect(n.low).toBeLessThanOrEqual(n.expected);
    expect(n.high).toBeGreaterThanOrEqual(n.expected);
    expect(Math.abs(n.expected - 800000)).toBeLessThan(800000 * 0.02);
    expect(o.monthlyExpenses).toEqual({ expected: 2900000, low: 2800000, high: 3000000 });
  });

  it('shows nothing before there is history', async () => {
    const o = await financialOutlook(db, TODAY);
    expect(o.revenue.next7).toBeNull();
    expect(o.monthlyExpenses).toBeNull();
  });
});

describe('settings', () => {
  it('returns defaults, stores changes, and rejects out-of-range numbers', async () => {
    expect(await getSetting(db, 'theme')).toBe('system');
    expect(await getIntSetting(db, 'forecast.leadDays', 0, 60)).toBe(2);
    await setSetting(db, 'forecast.leadDays', '5');
    expect(await getIntSetting(db, 'forecast.leadDays', 0, 60)).toBe(5);
    await setSetting(db, 'forecast.leadDays', '5');
    expect(await db.select().from(schema.settings).where(eq(schema.settings.key, 'forecast.leadDays'))).toHaveLength(1);
    await setSetting(db, 'forecast.leadDays', '9999');
    expect(await getIntSetting(db, 'forecast.leadDays', 0, 60)).toBe(2);
    await setSetting(db, 'forecast.leadDays', 'abc');
    expect(await getIntSetting(db, 'forecast.leadDays', 0, 60)).toBe(2);
  });

  it('dateOf gives the local calendar date', () => {
    expect(dateOf(noon('2026-10-25'))).toBe('2026-10-25');
  });
});
