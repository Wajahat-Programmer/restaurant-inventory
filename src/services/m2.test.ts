import { eq } from 'drizzle-orm';
import { Db, schema } from '../db/client';
import { createTestDb } from '../db/testing';
import { addManualCash, getCashBalance, getCashBook } from './cashService';
import { addExpense, listExpenses, voidExpense } from './expenseService';
import { createItem, getItem } from './itemService';
import { findCacheMismatches } from './ledgerInvariant';
import {
  createSupplier,
  postPurchase,
  recordPayment,
  voidPurchase,
} from './purchaseService';
import { createRecipe, getRecipe, listRecipes, setRecipeActive, updateRecipe } from './recipeService';
import { dashboard, profitAndLoss, stockValuation, supplierSpend } from './reportService';
import { listSales, postSales, voidSale } from './salesService';
import { adjustStock, issueToKitchen, recordWaste } from './stockService';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const local = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const TODAY = local();
const YESTERDAY = local(new Date(Date.now() - 24 * 3600 * 1000));

/** Rice at 10 paisa/g (10 kg for Rs 1,000), oil at 20 paisa/ml, and a supplier. */
async function kitchen() {
  const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
  const oil = await createItem(db, { name: 'Oil', baseUnit: 'ml' });
  const supplier = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, {
    supplierId: supplier,
    date: TODAY,
    lines: [
      { itemId: rice, qtyBase: 10000, totalPaisa: 100000 },
      { itemId: oil, qtyBase: 2000, totalPaisa: 40000 },
    ],
    paidPaisa: 140000,
  });
  const pulao = await createRecipe(db, {
    name: 'Pulao',
    sellPricePaisa: 15000,
    lines: [
      { itemId: rice, qtyBase: 200 },
      { itemId: oil, qtyBase: 10 },
    ],
  });
  return { rice, oil, supplier, pulao };
}

describe('recipes', () => {
  it('costs a dish from stock average and reports margin', async () => {
    const { pulao } = await kitchen();
    const r = await getRecipe(db, pulao);
    expect(r).toMatchObject({ costPaisa: 2200, costKnown: true, marginPaisa: 12800 });
    expect(r.marginPct).toBe(85.3);
    expect(r.lines.map(l => l.itemName)).toEqual(['Oil', 'Rice']);
  });

  it('uses the last purchase price when the shelf is empty, and flags unknown cost', async () => {
    const { rice, pulao } = await kitchen();
    await issueToKitchen(db, { itemId: rice, qtyBase: 10000 });
    expect((await getRecipe(db, pulao)).costPaisa).toBe(2200); // rice falls back to 10 paisa/g
    const salt = await createItem(db, { name: 'Salt', baseUnit: 'g' });
    const soup = await createRecipe(db, { name: 'Soup', sellPricePaisa: 5000, lines: [{ itemId: salt, qtyBase: 5 }] });
    expect(await getRecipe(db, soup)).toMatchObject({ costKnown: false, costPaisa: 0 });
  });

  it('validates input with readable messages', async () => {
    const { rice } = await kitchen();
    const ok = { name: 'Dal', sellPricePaisa: 100, lines: [{ itemId: rice, qtyBase: 1 }] };
    await expect(createRecipe(db, { ...ok, name: ' ' })).rejects.toThrow('Name is required');
    await expect(createRecipe(db, { ...ok, lines: [] })).rejects.toThrow('at least one ingredient');
    await expect(createRecipe(db, { ...ok, lines: [{ itemId: rice, qtyBase: 0 }] })).rejects.toThrow('above 0');
    await expect(createRecipe(db, { ...ok, lines: [{ itemId: rice, qtyBase: 1 }, { itemId: rice, qtyBase: 2 }] })).rejects.toThrow('listed twice');
    await expect(createRecipe(db, { ...ok, sellPricePaisa: -1 })).rejects.toThrow('cannot be negative');
    await expect(createRecipe(db, { ...ok, sellPricePaisa: 1.5 })).rejects.toThrow('whole paisa');
    await expect(createRecipe(db, { ...ok, lines: [{ itemId: 999, qtyBase: 1 }] })).rejects.toThrow('no longer exists');
    await createRecipe(db, ok);
    await expect(createRecipe(db, ok)).rejects.toThrow('already exists');
  });

  it('updates replace the ingredients; inactive dishes are hidden', async () => {
    const { rice, oil, pulao } = await kitchen();
    await updateRecipe(db, pulao, { name: 'Pulao', sellPricePaisa: 20000, lines: [{ itemId: oil, qtyBase: 5 }] });
    const r = await getRecipe(db, pulao);
    expect(r.sellPricePaisa).toBe(20000);
    expect(r.lines).toHaveLength(1);
    await expect(updateRecipe(db, 999, { name: 'X', sellPricePaisa: 1, lines: [{ itemId: rice, qtyBase: 1 }] })).rejects.toThrow('Dish not found');
    await setRecipeActive(db, pulao, false);
    expect(await listRecipes(db)).toHaveLength(0);
    expect(await listRecipes(db, { includeInactive: true })).toHaveLength(1);
  });
});

describe('sales', () => {
  it('deducts ingredients at average cost, records exact COGS and revenue', async () => {
    const { rice, oil, pulao } = await kitchen();
    const [id] = await postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 10 }] });
    expect((await getItem(db, rice)).qtyBase).toBe(8000);
    expect((await getItem(db, oil)).qtyBase).toBe(1900);
    const [sale] = await listSales(db, TODAY, TODAY);
    expect(sale).toMatchObject({ id, dish: 'Pulao', qty: 10, pricePaisa: 15000, revenuePaisa: 150000, cogsPaisa: 22000, status: 'POSTED' });
    expect(await findCacheMismatches(db)).toEqual([]);
    const book = await getCashBook(db, TODAY, TODAY);
    expect(book.entries.find(e => e.source === 'sale')).toMatchObject({ direction: 'IN', amountPaisa: 150000, refId: id });
  });

  it('names every short ingredient and changes nothing', async () => {
    const { rice, oil, pulao } = await kitchen();
    await expect(postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 60 }] })).rejects.toThrow(
      /Not enough stock: Oil \(need 600 ml, have 2 L\)|Not enough stock: Rice \(need 12 kg, have 10 kg\)/,
    );
    await expect(postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 250 }] })).rejects.toThrow(/Oil .*Rice|Rice .*Oil/);
    expect((await getItem(db, rice)).qtyBase).toBe(10000);
    expect((await getItem(db, oil)).qtyBase).toBe(2000);
    expect(await listSales(db, TODAY, TODAY)).toHaveLength(0);
  });

  it('checks the whole entry together: two lines of one dish share the same stock', async () => {
    const { rice, pulao } = await kitchen();
    // 30 + 30 portions need 12 kg of rice, but only 10 kg exists.
    await expect(
      postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 30 }, { recipeId: pulao, qty: 30 }] }),
    ).rejects.toThrow('Not enough stock: Rice');
    expect((await getItem(db, rice)).qtyBase).toBe(10000);
    expect(await listSales(db, TODAY, TODAY)).toHaveLength(0);
  });

  it('validates date, dishes, portions and inactive dishes', async () => {
    const { pulao } = await kitchen();
    await expect(postSales(db, { date: '25/10/2026', lines: [{ recipeId: pulao, qty: 1 }] })).rejects.toThrow('real date');
    await expect(postSales(db, { date: '2026-02-30', lines: [{ recipeId: pulao, qty: 1 }] })).rejects.toThrow('real date');
    await expect(postSales(db, { date: TODAY, lines: [] })).rejects.toThrow('at least one dish');
    for (const qty of [0, -1, 1.5]) {
      await expect(postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty }] })).rejects.toThrow('whole number');
    }
    await expect(postSales(db, { date: TODAY, lines: [{ recipeId: 999, qty: 1 }] })).rejects.toThrow('Dish not found');
    await setRecipeActive(db, pulao, false);
    await expect(postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 1 }] })).rejects.toThrow('not on the menu');
  });

  it('keeps the price and cost a sale was made at when the dish changes later', async () => {
    const { oil, pulao } = await kitchen();
    await postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 1 }] });
    await updateRecipe(db, pulao, { name: 'Pulao', sellPricePaisa: 99999, lines: [{ itemId: oil, qtyBase: 1 }] });
    expect((await listSales(db, TODAY, TODAY))[0]).toMatchObject({ pricePaisa: 15000, cogsPaisa: 2200 });
  });

  it('void puts the stock back and reverses the revenue dated the day it is voided', async () => {
    const { rice, pulao } = await kitchen();
    const [id] = await postSales(db, { date: YESTERDAY, lines: [{ recipeId: pulao, qty: 10 }] });
    await voidSale(db, id, TODAY);
    expect((await getItem(db, rice)).qtyBase).toBe(10000);
    expect((await listSales(db, YESTERDAY, YESTERDAY))[0].status).toBe('VOID');
    const yesterday = await getCashBook(db, YESTERDAY, YESTERDAY);
    expect(yesterday.entries.filter(e => e.source === 'sale')).toHaveLength(1); // history untouched
    const today = await getCashBook(db, TODAY, TODAY);
    expect(today.entries.find(e => e.source === 'sale' && e.isReversal)).toMatchObject({ direction: 'OUT', amountPaisa: 150000 });
    expect(await findCacheMismatches(db)).toEqual([]);
    await expect(voidSale(db, id, TODAY)).rejects.toThrow('already void');
    await expect(voidSale(db, 999, TODAY)).rejects.toThrow('Sale not found');
    await expect(voidSale(db, id, 'x')).rejects.toThrow('real date');
  });
});

describe('expenses and the cash book', () => {
  it('records an expense as money out, and void adds an opposite entry', async () => {
    const id = await addExpense(db, { date: TODAY, category: 'rent', amountPaisa: 30000, note: ' October ' });
    expect((await listExpenses(db, TODAY, TODAY))[0]).toMatchObject({ category: 'rent', amountPaisa: 30000, note: 'October', method: 'cash' });
    expect(await getCashBalance(db)).toBe(-30000);
    await voidExpense(db, id, TODAY);
    expect(await getCashBalance(db)).toBe(0);
    expect((await listExpenses(db, TODAY, TODAY))[0].status).toBe('VOID');
    await expect(voidExpense(db, id, TODAY)).rejects.toThrow('already void');
  });

  it('validates expenses', async () => {
    const ok = { date: TODAY, category: 'gas' as const, amountPaisa: 100 };
    await expect(addExpense(db, { ...ok, amountPaisa: 0 })).rejects.toThrow('more than 0');
    await expect(addExpense(db, { ...ok, amountPaisa: 1.5 })).rejects.toThrow('whole paisa');
    await expect(addExpense(db, { ...ok, date: '2026-13-01' })).rejects.toThrow('real date');
    await expect(addExpense(db, { ...ok, category: 'fun' as never })).rejects.toThrow();
  });

  it('purchases and supplier payments move cash; a void refunds on the day it happens', async () => {
    const { supplier } = await kitchen(); // Rs 1,400 paid at purchase
    expect(await getCashBalance(db)).toBe(-140000);
    const credit = await postPurchase(db, { supplierId: supplier, date: TODAY, lines: [{ itemId: 1, qtyBase: 100, totalPaisa: 5000 }], paidPaisa: 0 });
    expect(await getCashBalance(db)).toBe(-140000); // nothing paid yet
    await recordPayment(db, { supplierId: supplier, date: TODAY, amountPaisa: 2000, method: 'bank' });
    expect(await getCashBalance(db)).toBe(-142000);
    await voidPurchase(db, credit, TODAY);
    const book = await getCashBook(db, TODAY, TODAY);
    expect(book.entries.map(e => e.source).sort()).toEqual(['purchase', 'supplier_payment']);
    expect(book.entries.find(e => e.source === 'supplier_payment')).toMatchObject({ method: 'bank' });
  });

  it('shows opening and closing balances for a range, and manual entries', async () => {
    await addManualCash(db, { date: YESTERDAY, direction: 'IN', amountPaisa: 100000, note: 'Owner deposit' });
    await addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 25000 });
    const book = await getCashBook(db, TODAY, TODAY);
    expect(book).toMatchObject({ openingPaisa: 100000, totalInPaisa: 0, totalOutPaisa: 25000, closingPaisa: 75000 });
    await expect(addManualCash(db, { date: TODAY, direction: 'IN', amountPaisa: 1, note: ' ' })).rejects.toThrow('note is required');
    await expect(addManualCash(db, { date: TODAY, direction: 'OUT', amountPaisa: 0, note: 'x' })).rejects.toThrow('more than 0');
  });
});

describe('reports', () => {
  /** 10 plates sold, 500 g of rice wasted, Rs 300 rent. */
  async function trading() {
    const k = await kitchen();
    await postSales(db, { date: TODAY, lines: [{ recipeId: k.pulao, qty: 10 }] });
    await recordWaste(db, { itemId: k.rice, qtyBase: 500, reason: 'spoiled' });
    await addExpense(db, { date: TODAY, category: 'rent', amountPaisa: 30000 });
    return k;
  }

  it('computes profit and loss from sales, wastage and expenses', async () => {
    await trading();
    const p = await profitAndLoss(db, TODAY, TODAY);
    expect(p).toMatchObject({
      revenue: 150000,
      cogs: 22000,
      grossProfit: 128000,
      wastage: 5000,
      adjustments: 0,
      expenses: 30000,
      netProfit: 93000,
      salesCount: 1,
      foodCostPct: 14.7,
      wastagePct: 18.5,
    });
    expect(p.expensesByCategory).toEqual([{ category: 'rent', amountPaisa: 30000 }]);
  });

  it('purchases and opening stock are not costs or gains', async () => {
    await createItem(db, { name: 'Flour', baseUnit: 'g' }, { qtyBase: 1000, valuePaisa: 9000 });
    await kitchen();
    const p = await profitAndLoss(db, TODAY, TODAY);
    expect(p).toMatchObject({ revenue: 0, cogs: 0, wastage: 0, adjustments: 0, expenses: 0, netProfit: 0 });
  });

  it('counts stock write-downs as a loss and gains as a profit', async () => {
    const { rice } = await kitchen();
    await adjustStock(db, { itemId: rice, deltaBase: -100, note: 'spilled' }); // -1000
    expect((await profitAndLoss(db, TODAY, TODAY)).adjustments).toBe(1000);
    await adjustStock(db, { itemId: rice, deltaBase: 300, note: 'found' }); // +3000 at avg
    expect((await profitAndLoss(db, TODAY, TODAY)).adjustments).toBe(-2000);
    expect((await profitAndLoss(db, TODAY, TODAY)).netProfit).toBe(2000);
  });

  it('only counts what falls inside the range, and ignores voided sales and expenses', async () => {
    const k = await trading();
    expect(await profitAndLoss(db, YESTERDAY, YESTERDAY)).toMatchObject({ revenue: 0, wastage: 0, expenses: 0, salesCount: 0 });
    const [saleId] = (await listSales(db, TODAY, TODAY)).map(s => s.id);
    await voidSale(db, saleId, TODAY);
    const [exp] = await listExpenses(db, TODAY, TODAY);
    await voidExpense(db, exp.id, TODAY);
    const p = await profitAndLoss(db, TODAY, TODAY);
    expect(p).toMatchObject({ revenue: 0, cogs: 0, expenses: 0, salesCount: 0, wastage: 5000, netProfit: -5000 });
    expect(await findCacheMismatches(db)).toEqual([]);
    expect(k.rice).toBeGreaterThan(0);
  });

  it('values stock by category and totals supplier spend, ignoring voided purchases', async () => {
    const { supplier, rice } = await kitchen();
    await db.update(schema.items).set({ categoryId: null }).where(eq(schema.items.id, rice));
    const v = await stockValuation(db);
    expect(v.totalPaisa).toBe(140000);
    expect(v.byCategory).toEqual([{ category: 'No category', valuePaisa: 140000, items: 2 }]);

    const spend = await supplierSpend(db, TODAY, TODAY);
    expect(spend).toEqual([{ supplierId: supplier, supplier: 'Al-Noor', totalPaisa: 140000, purchases: 1 }]);
    const extra = await postPurchase(db, { supplierId: supplier, date: TODAY, lines: [{ itemId: rice, qtyBase: 100, totalPaisa: 9999 }], paidPaisa: 0 });
    expect((await supplierSpend(db, TODAY, TODAY))[0].totalPaisa).toBe(149999);
    await voidPurchase(db, extra, TODAY);
    expect((await supplierSpend(db, TODAY, TODAY))[0].totalPaisa).toBe(140000);
  });

  it('builds the dashboard', async () => {
    const { supplier } = await trading();
    await postPurchase(db, { supplierId: supplier, date: TODAY, lines: [{ itemId: 2, qtyBase: 1, totalPaisa: 1000 }], paidPaisa: 400 });
    const d = await dashboard(db, TODAY, { from: TODAY.slice(0, 8) + '01', to: TODAY });
    expect(d.today.revenue).toBe(150000);
    expect(d.month.revenue).toBe(150000);
    expect(d.suppliersOwedPaisa).toBe(600);
    expect(d.stockValuePaisa).toBeGreaterThan(0);
    // 140,000 bought, 150,000 sold, 30,000 rent, 400 paid on the second purchase.
    expect(d.cashBalancePaisa).toBe(-140000 + 150000 - 30000 - 400);
    expect(d.lowOrOutItems).toBe(0);
  });
});
