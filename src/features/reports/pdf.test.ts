import { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { addExpense } from '../../services/expenseService';
import { createItem } from '../../services/itemService';
import { createSupplier, postPurchase } from '../../services/purchaseService';
import { createRecipe } from '../../services/recipeService';
import { profitAndLoss, stockValuation, wastageReport } from '../../services/reportService';
import { postSales } from '../../services/salesService';
import { setSession } from '../../services/session';
import { recordWaste } from '../../services/stockService';
import { esc, pnlHtml, stockValuationHtml, wastageHtml } from './pdfHtml';

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
});

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

async function trading() {
  const rice = await createItem(db, { name: 'Rice <b>&"best"</b>', baseUnit: 'g', categoryName: 'Grains' });
  const sup = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, { supplierId: sup, date: TODAY, lines: [{ itemId: rice, qtyBase: 10000, totalPaisa: 100000 }], paidPaisa: 100000 });
  const dish = await createRecipe(db, { name: 'Pulao', sellPricePaisa: 15000, lines: [{ itemId: rice, qtyBase: 200 }] });
  await postSales(db, { date: TODAY, lines: [{ recipeId: dish, qty: 10 }] });
  await recordWaste(db, { itemId: rice, qtyBase: 500, reason: 'spoiled', note: 'wet <bag>' });
  await addExpense(db, { date: TODAY, category: 'rent', amountPaisa: 30000 });
  return rice;
}

describe('esc', () => {
  it('neutralises markup and quotes', () => {
    expect(esc('<script>alert("x")</script> & \'y\'')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;');
    expect(esc(5)).toBe('5');
  });
});

describe('wastageReport', () => {
  it('lists what was thrown away with its cost and share of use', async () => {
    await trading();
    const w = await wastageReport(db, TODAY, TODAY);
    expect(w.rows).toHaveLength(1);
    expect(w.rows[0]).toMatchObject({ date: TODAY, qtyBase: 500, valuePaisa: 5000, reason: 'spoiled: wet <bag>', baseUnit: 'g' });
    expect(w.totalPaisa).toBe(5000);
    // Rice for 10 portions cost Rs 200; Rs 50 was thrown away: 50 / 250 = 20%.
    expect(w.pct).toBe(20);
  });

  it('is empty outside the range, and owner-only', async () => {
    await trading();
    expect(await wastageReport(db, '2020-01-01', '2020-01-31')).toMatchObject({ rows: [], totalPaisa: 0, pct: null });
    setSession({ id: 1, name: 'Bilal', role: 'staff' });
    await expect(wastageReport(db, TODAY, TODAY)).rejects.toThrow('Only the owner');
  });
});

describe('report pages', () => {
  it('profit and loss shows every line, the net with a glyph, and escapes the period text', async () => {
    await trading();
    const html = pnlHtml(await profitAndLoss(db, TODAY, TODAY), 'Oct <2026>', TODAY);
    for (const expected of ['Profit and loss', 'Rs 1,500.00', '-Rs 200.00', 'Rs 1,300.00', 'Expenses: rent', '✓ Net profit', 'Rs 950.00', '13.3%', 'Oct &lt;2026&gt;']) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain('<2026>');
  });

  it('a loss reads as a loss', async () => {
    await addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 2500 });
    const html = pnlHtml(await profitAndLoss(db, TODAY, TODAY), 'Today', TODAY);
    expect(html).toContain('✖ Net loss');
    expect(html).toContain('-Rs 25.00');
  });

  it('stock valuation lists items, escaped, with totals', async () => {
    await trading();
    const v = await stockValuation(db);
    const html = stockValuationHtml(
      v,
      [{ name: 'Rice <b>&"best"</b>', category: 'Grains', qtyBase: 9300, baseUnit: 'g', valuePaisa: 93000, status: '✓ In stock' }],
      TODAY,
    );
    expect(html).toContain('Rs 930.00');
    expect(html).toContain('Rice &lt;b&gt;&amp;&quot;best&quot;&lt;/b&gt;');
    expect(html).not.toContain('<b>&"best"');
    expect(html).toContain('9.3 kg');
  });

  it('wastage page lists rows, and says so when there is none', async () => {
    await trading();
    const html = wastageHtml(await wastageReport(db, TODAY, TODAY), 'Today', TODAY);
    expect(html).toContain('wet &lt;bag&gt;');
    expect(html).toContain('20%');
    expect(html).toContain('500 g');
    const none = wastageHtml(await wastageReport(db, '2020-01-01', '2020-01-02'), '2020', TODAY);
    expect(none).toContain('Nothing was thrown away in this period. ✓');
    expect(none).not.toContain('<th>Date</th>');
  });
});
