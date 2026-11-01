import { Db } from '../db/client';
import { createTestDb } from '../db/testing';
import { createItem } from './itemService';
import { createSupplier, postPurchase } from './purchaseService';
import { createRecipe } from './recipeService';
import { dishPerformance } from './reportService';
import { postSales, voidSale } from './salesService';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const local = (d = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const TODAY = local();

/** Four dishes over rice at 10 paisa/g and oil at 20 paisa/ml. */
async function menu() {
  const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
  const oil = await createItem(db, { name: 'Oil', baseUnit: 'ml' });
  const supplier = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, {
    supplierId: supplier,
    date: TODAY,
    lines: [
      { itemId: rice, qtyBase: 100000, totalPaisa: 1000000 },
      { itemId: oil, qtyBase: 20000, totalPaisa: 400000 },
    ],
    paidPaisa: 1400000,
  });
  const dish = (name: string, sellPricePaisa: number, riceG: number, oilMl = 0) =>
    createRecipe(db, { name, sellPricePaisa, lines: [{ itemId: rice, qtyBase: riceG }, ...(oilMl ? [{ itemId: oil, qtyBase: oilMl }] : [])] });
  return {
    karahi: await dish('Karahi', 5000, 300), // cost 3000: earns 2000 each
    fries: await dish('Fries', 2000, 100, 25), // cost 1000 + 500: earns 500
    steak: await dish('Steak', 9000, 500), // cost 5000: earns 4000
    salad: await dish('Salad', 2200, 150, 25), // cost 1500 + 500: earns 200
    ghost: await dish('Ghost', 10000, 100), // cost 1000, never sold
  };
}

describe('dish performance', () => {
  it('works out sales, profit per portion and the menu class for each dish', async () => {
    const m = await menu();
    await postSales(db, {
      date: TODAY,
      lines: [
        { recipeId: m.karahi, qty: 40 },
        { recipeId: m.fries, qty: 40 },
        { recipeId: m.steak, qty: 10 },
        { recipeId: m.salad, qty: 10 },
      ],
    });
    const rows = await dishPerformance(db, TODAY, TODAY);
    const by = Object.fromEntries(rows.map(r => [r.name, r]));
    expect(by.Karahi).toMatchObject({ qty: 40, revenuePaisa: 200000, cogsPaisa: 120000, unitMarginPaisa: 2000, marginPct: 40 });
    expect(by.Karahi.dishClass).toBe('star');
    expect(by.Steak.dishClass).toBe('puzzle'); // sells 10 of 100, earns Rs 40 each
    expect(by.Salad.dishClass).toBe('dog'); // sells 10, earns Rs 2 each
    expect(by.Fries.dishClass).toBe('plowhorse'); // sells 40, earns Rs 5 each
    // Best sellers first, the dish that never sold last.
    expect(rows[rows.length - 1].name).toBe('Ghost');
    expect(rows.slice(0, 2).map(r => r.qty)).toEqual([40, 40]);
  });

  it('a dish that did not sell has no class and shows its margin at today\'s cost', async () => {
    const m = await menu();
    await postSales(db, { date: TODAY, lines: [{ recipeId: m.karahi, qty: 5 }, { recipeId: m.steak, qty: 5 }] });
    const ghost = (await dishPerformance(db, TODAY, TODAY)).find(r => r.name === 'Ghost')!;
    expect(ghost).toMatchObject({ qty: 0, dishClass: null, unitMarginPaisa: 9000, marginPct: 90 });
  });

  it('suggests a price only for dishes that earn less than the target margin', async () => {
    const m = await menu();
    await postSales(db, { date: TODAY, lines: [{ recipeId: m.karahi, qty: 5 }, { recipeId: m.fries, qty: 5 }] });
    const by = Object.fromEntries((await dishPerformance(db, TODAY, TODAY)).map(r => [r.name, r]));
    // Karahi costs Rs 30 and sells for Rs 50 (40%): for 65% the price is 30 / 0.35 = Rs 85.71, so Rs 86.
    expect(by.Karahi.suggestedPricePaisa).toBe(8600);
    // Steak, not sold in this period, is judged on today's price: 44% margin, Rs 142.86 -> Rs 143.
    expect(by.Steak.suggestedPricePaisa).toBe(14300);
    // Ghost earns 90%, so it needs no change.
    expect(by.Ghost.suggestedPricePaisa).toBeNull();
  });

  it('counts only sales in the period, and not voided ones', async () => {
    const m = await menu();
    await postSales(db, { date: '2020-01-01', lines: [{ recipeId: m.karahi, qty: 7 }] });
    const [typo] = await postSales(db, { date: TODAY, lines: [{ recipeId: m.karahi, qty: 20 }] });
    await voidSale(db, typo, TODAY);
    await postSales(db, { date: TODAY, lines: [{ recipeId: m.karahi, qty: 2 }] });
    const k = (await dishPerformance(db, TODAY, TODAY)).find(r => r.name === 'Karahi')!;
    expect(k.qty).toBe(2);
  });
});
