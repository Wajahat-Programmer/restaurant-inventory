import { screen } from '@testing-library/react-native';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { createItem } from '../src/services/itemService';
import { createSupplier, postPurchase } from '../src/services/purchaseService';
import { createRecipe } from '../src/services/recipeService';
import { postSales } from '../src/services/salesService';
import { setSession } from '../src/services/session';
import { recordWaste } from '../src/services/stockService';
import { goMore, localDate, openApp, press, text } from '../test-utils/harness';

jest.mock('../src/features/update/devicePorts', () => ({
  installedVersion: jest.fn(async () => '1.0.0'),
  timedFetch: jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })),
  updatePorts: {},
}));

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
});
afterEach(() => setSession(null));

const TODAY = localDate();

/** Rice at 10 paisa/g, oil at 20 paisa/ml; four dishes, all sold today. */
async function kitchen() {
  const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
  const oil = await createItem(db, { name: 'Oil', baseUnit: 'ml' });
  const sup = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, {
    supplierId: sup,
    date: TODAY,
    lines: [
      { itemId: rice, qtyBase: 100000, totalPaisa: 1000000 },
      { itemId: oil, qtyBase: 20000, totalPaisa: 400000 },
    ],
    paidPaisa: 1400000,
  });
  const dish = (name: string, price: number, riceG: number, oilMl = 0) =>
    createRecipe(db, { name, sellPricePaisa: price, lines: [{ itemId: rice, qtyBase: riceG }, ...(oilMl ? [{ itemId: oil, qtyBase: oilMl }] : [])] });
  return { rice, oil, karahi: await dish('Karahi', 5000, 300), fries: await dish('Fries', 2000, 100, 25), steak: await dish('Steak', 9000, 500), salad: await dish('Salad', 2200, 150, 25) };
}

describe('reports: dish performance', () => {
  it('shows each dish with its menu class, profit and a price tip', async () => {
    const k = await kitchen();
    await postSales(db, {
      date: TODAY,
      lines: [
        { recipeId: k.karahi, qty: 40 },
        { recipeId: k.fries, qty: 40 },
        { recipeId: k.steak, qty: 10 },
        { recipeId: k.salad, qty: 10 },
      ],
    });
    await openApp(db, 'home');
    await goMore('reports');
    await press('open-dish-performance');
    expect(await screen.findByTestId('dish-Karahi')).toBeTruthy();
    expect(text('dish-class-Karahi')).toBe('★ Star');
    expect(text('dish-class-Fries')).toBe('▲ Plowhorse');
    expect(text('dish-class-Steak')).toBe('? Puzzle');
    expect(text('dish-class-Salad')).toBe('▼ Dog');
    // Karahi: Rs 50 at a 40% margin; Rs 86 would give 65%.
    expect(text('dish-tip-Karahi')).toContain('Rs 86.00');
  });

  it('says so when there are no dishes', async () => {
    await openApp(db, 'home');
    await goMore('reports');
    await press('open-dish-performance');
    expect(await screen.findByTestId('no-dishes')).toBeTruthy();
  });
});

describe('reports: wastage details', () => {
  it('breaks the wastage down by reason and by item', async () => {
    const k = await kitchen();
    await recordWaste(db, { itemId: k.rice, qtyBase: 1000, reason: 'spoiled' }); // Rs 100
    await recordWaste(db, { itemId: k.rice, qtyBase: 500, reason: 'expired' }); // Rs 50
    await recordWaste(db, { itemId: k.oil, qtyBase: 250, reason: 'spoiled' }); // Rs 50
    await openApp(db, 'home');
    await goMore('reports');
    await press('open-wastage');
    expect(await screen.findByTestId('wastage-total')).toBeTruthy();
    expect(text('reason-spoiled')).toContain('Rs 150.00');
    expect(screen.getByText('spoiled (2)')).toBeTruthy();
    expect(screen.getByText('Rice: 1.5 kg')).toBeTruthy();
    expect(screen.getByText('Oil: 250 ml')).toBeTruthy();
  });

  it('is calm when nothing was thrown away', async () => {
    await openApp(db, 'home');
    await goMore('reports');
    await press('open-wastage');
    expect(await screen.findByTestId('no-wastage')).toBeTruthy();
  });
});
