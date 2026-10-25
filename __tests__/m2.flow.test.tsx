import { screen, waitFor } from '@testing-library/react-native';
import { generatePDF } from 'react-native-html-to-pdf';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { getCashBalance } from '../src/services/cashService';
import { addExpense, listExpenses } from '../src/services/expenseService';
import { createItem, getItem } from '../src/services/itemService';
import { createSupplier, postPurchase } from '../src/services/purchaseService';
import { createRecipe, listRecipes } from '../src/services/recipeService';
import { listSales, postSales } from '../src/services/salesService';
import { recordWaste } from '../src/services/stockService';
import { goMore, localDate, openApp, press, text, type } from '../test-utils/harness';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});
const TODAY = localDate();

/** Rice 10 kg (10 paisa/g), oil 2 L (20 paisa/ml), and a Pulao that uses 200 g + 10 ml. */
async function kitchen() {
  const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
  const oil = await createItem(db, { name: 'Oil', baseUnit: 'ml' });
  const sup = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, {
    supplierId: sup,
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
    lines: [{ itemId: rice, qtyBase: 200 }, { itemId: oil, qtyBase: 10 }],
  });
  return { rice, oil, pulao };
}

describe('navigation', () => {
  it('opens on Home and reaches every screen under More', async () => {
    await openApp(db, 'home');
    expect(await screen.findByTestId('home-today-revenue')).toBeTruthy();
    await press('tab-more');
    for (const m of ['reports', 'recipes', 'expenses', 'cashbook', 'suppliers', 'count']) {
      expect(screen.getByTestId(`menu-${m}`)).toBeTruthy();
    }
  });
});

describe('recipes', () => {
  it('adds a dish and shows its live cost and margin before saving', async () => {
    const { rice, oil } = await kitchen();
    await openApp(db);
    await goMore('recipes');
    expect(await screen.findByTestId('recipe-Pulao')).toBeTruthy();
    await press('fab-add-recipe');
    await type('field-recipe-name', 'Biryani');
    await type('field-recipe-price', '300');
    await press('ingredient-0-item');
    await press('ingredient-0-item-Rice');
    await type('ingredient-0-qty', '250');
    await press('add-ingredient');
    await press('ingredient-1-item');
    await press('ingredient-1-item-Oil');
    await type('ingredient-1-qty', '20');
    // 250 g x 10 + 20 ml x 20 = Rs 29.00 cost against Rs 300.00.
    expect(text('recipe-cost')).toBe('Rs 29.00');
    expect(text('recipe-margin')).toMatch(/✓ Rs 271\.00 \(90\.3%\)/);
    await press('save-recipe');
    expect(await screen.findByTestId('recipe-Biryani')).toBeTruthy();
    const [b] = (await listRecipes(db)).filter(r => r.name === 'Biryani');
    expect(b.lines.map(l => [l.itemId, l.qtyBase]).sort()).toEqual([[rice, 250], [oil, 20]].sort());
  });

  it('rejects an incomplete or duplicate dish with a readable message', async () => {
    await kitchen();
    await openApp(db);
    await goMore('recipes');
    await press('fab-add-recipe');
    await press('save-recipe');
    expect(await screen.findByText('✖ Name is required')).toBeTruthy();
    await type('field-recipe-name', 'Pulao');
    await type('field-recipe-price', '100');
    await press('save-recipe');
    expect(await screen.findByText(/Ingredient 1: choose an item/)).toBeTruthy();
    await press('ingredient-0-item');
    await press('ingredient-0-item-Rice');
    await type('ingredient-0-qty', '10');
    await press('save-recipe');
    expect(await screen.findByText(/A dish with this name already exists/)).toBeTruthy();
  });

  it('lists dishes with cost and margin, and can take one off the menu', async () => {
    await kitchen();
    await openApp(db);
    await goMore('recipes');
    expect(await screen.findByText('cost Rs 22.00')).toBeTruthy();
    expect(screen.getByText(/margin 85\.3%/)).toBeTruthy();
    await press('recipe-Pulao');
    await screen.findByTestId('toggle-recipe-active');
    await press('toggle-recipe-active');
    await waitFor(async () => expect(await listRecipes(db)).toHaveLength(0));
  });
});

describe('sales', () => {
  it('enters the days sales, deducts stock, and shows totals', async () => {
    const { rice } = await kitchen();
    await openApp(db, 'sales');
    expect(await screen.findByTestId('sales-empty')).toBeTruthy();
    await press('fab-add-sales');
    await press('sale-line-0-dish');
    await press('sale-line-0-dish-Pulao');
    await type('sale-line-0-qty', '10');
    expect(text('sales-total')).toBe('Total sales Rs 1,500.00');
    await press('save-sales');

    expect(await screen.findByText('Pulao × 10')).toBeTruthy();
    expect(text('sales-revenue')).toBe('Rs 1,500.00');
    expect(text('sales-cogs')).toBe('Rs 220.00');
    expect((await getItem(db, rice)).qtyBase).toBe(8000);
    expect(await getCashBalance(db)).toBe(-140000 + 150000);
  });

  it('warns before saving when an ingredient would run out, and refuses to save', async () => {
    const { rice } = await kitchen();
    await openApp(db, 'sales');
    await press('fab-add-sales');
    await press('sale-line-0-dish');
    await press('sale-line-0-dish-Pulao');
    await type('sale-line-0-qty', '60');
    expect(await screen.findByTestId('stock-warning')).toBeTruthy();
    expect(screen.getByText(/Rice: need 12 kg, have 10 kg/)).toBeTruthy();
    await press('save-sales');
    expect(await screen.findByText(/Not enough stock: Rice/)).toBeTruthy();
    expect((await getItem(db, rice)).qtyBase).toBe(10000);
    expect(await listSales(db, TODAY, TODAY)).toHaveLength(0);
  });

  it('explains missing or invalid entries and the empty menu', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await openApp(db, 'sales');
    await press('fab-add-sales');
    expect(await screen.findByTestId('no-dishes')).toBeTruthy();
    await press('save-sales');
    expect(await screen.findByText('✖ Line 1: choose a dish')).toBeTruthy();
  });

  it('voids a sale: stock comes back and the totals drop', async () => {
    const { rice, pulao } = await kitchen();
    const [id] = await postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 10 }] });
    await openApp(db, 'sales');
    await screen.findByText('Pulao × 10');
    await press(`void-sale-${id}`);
    await waitFor(async () => expect((await getItem(db, rice)).qtyBase).toBe(10000));
    expect(await screen.findByText(/✖ Void/)).toBeTruthy();
    expect(text('sales-revenue')).toBe('Rs 0.00');
  });
});

describe('expenses and cash book', () => {
  it('adds an expense, shows the total, and voids it', async () => {
    await openApp(db, 'home');
    await goMore('expenses');
    expect(await screen.findByTestId('expenses-empty')).toBeTruthy();
    await press('fab-add-expense');
    await press('save-expense');
    expect(await screen.findByText('✖ Choose what the expense is for')).toBeTruthy();
    await press('category-rent');
    await type('field-expense-amount', '30000');
    await type('field-expense-note', 'October rent');
    await press('method-bank');
    await press('save-expense');
    expect(await screen.findByText(/October rent/)).toBeTruthy();
    expect(text('expenses-total')).toBe('Rs 30,000.00');
    const [e] = await listExpenses(db, TODAY, TODAY);
    expect(e).toMatchObject({ category: 'rent', amountPaisa: 3000000, method: 'bank' });
    await press(`void-expense-${e.id}`);
    await waitFor(() => expect(text('expenses-total')).toBe('Rs 0.00'));
  });

  it('rejects a bad amount', async () => {
    await openApp(db, 'home');
    await goMore('expenses');
    await press('fab-add-expense');
    await press('category-gas');
    await type('field-expense-amount', 'abc');
    await press('save-expense');
    expect(await screen.findByText(/Amount must be more than 0/)).toBeTruthy();
    expect(await listExpenses(db, TODAY, TODAY)).toHaveLength(0);
  });

  it('shows balances and takes a manual entry only with a note', async () => {
    await addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 25000 });
    await openApp(db, 'home');
    await goMore('cashbook');
    await screen.findByTestId('cash-closing');
    await waitFor(() => expect(text('cash-out')).toBe('Rs 250.00'));
    expect(text('cash-closing')).toBe('-Rs 250.00');
    await type('field-cash-amount', '1000');
    await press('save-cash');
    expect(await screen.findByText(/note is required/)).toBeTruthy();
    await type('field-cash-note', 'Owner deposit');
    await press('save-cash');
    await waitFor(() => expect(text('cash-in')).toBe('Rs 1,000.00'));
    expect(text('cash-closing')).toBe('Rs 750.00');
  });
});

describe('reports and dashboard', () => {
  async function trading() {
    const { rice, pulao } = await kitchen();
    await postSales(db, { date: TODAY, lines: [{ recipeId: pulao, qty: 10 }] });
    await recordWaste(db, { itemId: rice, qtyBase: 500, reason: 'spoiled' });
    await addExpense(db, { date: TODAY, category: 'rent', amountPaisa: 30000 });
  }

  it('shows profit and loss for the month, and zeros for another month', async () => {
    await trading();
    await openApp(db, 'home');
    await goMore('reports');
    await waitFor(() => expect(text('pnl-revenue')).toBe('Rs 1,500.00'));
    expect(text('pnl-cogs')).toBe('Rs 220.00');
    expect(text('pnl-gross')).toBe('Rs 1,280.00');
    expect(text('pnl-wastage')).toBe('Rs 50.00');
    expect(text('pnl-expenses')).toBe('Rs 300.00');
    expect(text('pnl-net')).toBe('✓ Rs 930.00');
    expect(text('pnl-foodcost')).toBe('14.7%');
    expect(text('pnl-wastagepct')).toBe('18.5%');
    expect(screen.getByText('Supplier spend')).toBeTruthy();

    await press('report-period-prev');
    await waitFor(() => expect(text('pnl-revenue')).toBe('Rs 0.00'));
    expect(text('pnl-foodcost')).toBe('—');
  });

  it('makes a PDF of each report and says so', async () => {
    await trading();
    await openApp(db, 'home');
    await goMore('reports');
    await waitFor(() => expect(text('pnl-revenue')).toBe('Rs 1,500.00'));
    for (const [id, title] of [['pdf-pnl', 'Profit and loss'], ['pdf-stock', 'Stock valuation'], ['pdf-wastage', 'Wastage']]) {
      (generatePDF as jest.Mock).mockClear();
      await press(id);
      await waitFor(() => expect(text('pdf-note')).toContain('PDF ready'));
      const arg = (generatePDF as jest.Mock).mock.calls[0][0];
      expect(arg.html).toContain(title);
      expect(arg.fileName).not.toMatch(/\.pdf$/);
    }
    (generatePDF as jest.Mock).mockRejectedValueOnce(new Error('no space left'));
    await press('pdf-pnl');
    await waitFor(() => expect(text('pdf-note')).toBe('✖ no space left'));
  });

  it('puts today on the dashboard', async () => {
    await trading();
    await openApp(db, 'home');
    await waitFor(() => expect(text('home-today-revenue')).toBe('Rs 1,500.00'));
    expect(text('home-today-net')).toBe('✓ Rs 930.00');
    expect(text('home-month-revenue')).toBe('Rs 1,500.00');
    // 140,000 bought, 150,000 sold, 30,000 rent: Rs -200.00 in the cash book.
    expect(text('home-cash')).toBe('-Rs 200.00');
    expect(text('home-low')).toBe('✓ 0');
  });
});
