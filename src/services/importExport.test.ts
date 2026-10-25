import { Db, schema } from '../db/client';
import { createTestDb } from '../db/testing';
import { parseCsv } from '../domain/csv';
import { previewItems, previewRecipes, previewSuppliers } from '../features/importExport/csvImport';
import { exportCsv, exportItems, EXPORTS, rupees } from './exportService';
import { existingNames, importItems, importRecipes, importSuppliers } from './importService';
import { createItem, getItem, listItems } from './itemService';
import { createSupplier, listSuppliers, postPurchase } from './purchaseService';
import { createRecipe, listRecipes } from './recipeService';
import { addExpense } from './expenseService';
import { issueToKitchen } from './stockService';
import { postSales } from './salesService';
import { setSession } from './session';

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
});

const pad = (n: number) => String(n).padStart(2, '0');
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('rupees', () => {
  it('formats exactly, including negatives and small amounts', () => {
    expect(rupees(0)).toBe('0.00');
    expect(rupees(5)).toBe('0.05');
    expect(rupees(123450)).toBe('1234.50');
    expect(rupees(-100)).toBe('-1.00');
  });
});

describe('export then import is lossless', () => {
  it('rebuilds the same items, with the same stock and value, in a new database', async () => {
    await createItem(db, { name: 'Rice, basmati', baseUnit: 'g', categoryName: 'Grains', parLevel: 50000, reorderPoint: 10000, shelfLifeDays: 365, barcode: '111' }, { qtyBase: 25000, valuePaisa: 500050 });
    await createItem(db, { name: 'Oil "premium"', baseUnit: 'ml' });
    await createItem(db, { name: 'Eggs', baseUnit: 'pcs', reorderPoint: 30 }, { qtyBase: 60, valuePaisa: 12000 });

    const rows = parseCsv(await exportItems(db));
    const fresh = await createTestDb();
    const names = await existingNames(fresh);
    const preview = previewItems(rows, { names: names.items, barcodes: names.barcodes });
    expect(preview.errors).toEqual([]);
    expect(await importItems(fresh, preview.valid)).toBe(3);

    const a = await listItems(db);
    const b = await listItems(fresh);
    const shape = (x: typeof a) => x.map(i => [i.name, i.baseUnit, i.categoryName, i.qtyBase, i.valuePaisa, i.parLevel, i.reorderPoint]);
    expect(shape(b)).toEqual(shape(a));
    expect((await getItem(fresh, b.find(i => i.name === 'Rice, basmati')!.id)).shelfLifeDays).toBe(365);
  });
});

describe('importing', () => {
  it('imports suppliers and recipes, and points at duplicates before writing', async () => {
    await createSupplier(db, { name: 'Al-Noor' });
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const names = await existingNames(db);

    const sp = previewSuppliers(parseCsv('Name,Phone,Opening balance Rs\nAl-Noor,,\nCity,0300,"1,200"'), names.suppliers);
    expect(sp.errors).toEqual([{ line: 2, message: '"Al-Noor" already exists in the app.' }]);
    expect(await importSuppliers(db, sp.valid)).toBe(1);
    expect((await listSuppliers(db)).map(s => [s.name, s.duePaisa])).toEqual([['Al-Noor', 0], ['City', 120000]]);

    const rp = previewRecipes(parseCsv('Dish,Price Rs,Ingredient,Quantity per portion\nPulao,350,Rice,200'), names.itemIds, names.recipes);
    expect(await importRecipes(db, rp.valid)).toBe(1);
    expect((await listRecipes(db))[0]).toMatchObject({ name: 'Pulao', sellPricePaisa: 35000, lines: [{ itemId: rice, qtyBase: 200 }] });
  });

  it('is all or nothing: a row that fails at write time rolls the whole file back', async () => {
    const preview = previewItems(parseCsv('Name,Base unit\nA,g\nB,g\nC,g'), { names: new Set(), barcodes: new Set() });
    // Something else adds "C" between the preview and the import.
    await createItem(db, { name: 'C', baseUnit: 'g' });
    await expect(importItems(db, preview.valid)).rejects.toThrow('already exists');
    expect((await listItems(db)).map(i => i.name)).toEqual(['C']);
  });

  it('imports opening stock as a proper ledger entry', async () => {
    const p = previewItems(parseCsv('Name,Base unit,Opening quantity,Opening value Rs\nRice,g,1000,100'), { names: new Set(), barcodes: new Set() });
    await importItems(db, p.valid);
    const item = (await listItems(db))[0];
    expect(item).toMatchObject({ qtyBase: 1000, valuePaisa: 10000 });
    expect((await getItem(db, item.id)).movements[0]).toMatchObject({ type: 'ADJUST', reason: 'Opening stock' });
  });

  it('only the owner can import', async () => {
    setSession({ id: 1, name: 'Bilal', role: 'staff' });
    await expect(importItems(db, [])).rejects.toThrow('Only the owner');
  });
});

describe('exports', () => {
  async function trading() {
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const sup = await createSupplier(db, { name: 'Al-Noor' });
    await postPurchase(db, { supplierId: sup, date: TODAY, lines: [{ itemId: rice, qtyBase: 10000, totalPaisa: 100000 }], paidPaisa: 40000 });
    const dish = await createRecipe(db, { name: 'Pulao', sellPricePaisa: 15000, lines: [{ itemId: rice, qtyBase: 200 }] });
    await postSales(db, { date: TODAY, lines: [{ recipeId: dish, qty: 10 }] });
    await addExpense(db, { date: TODAY, category: 'rent', amountPaisa: 30000, note: 'Oct, "main" shop' });
    await issueToKitchen(db, { itemId: rice, qtyBase: 100 });
  }

  it('each export has a header, the right rows, and Excel-safe quoting', async () => {
    await trading();
    const out: Record<string, string[][]> = {};
    for (const e of EXPORTS) {
      const r = await exportCsv(db, e.kind, TODAY, TODAY);
      expect(r.text.startsWith('﻿')).toBe(true);
      expect(r.fileName).toMatch(e.kind === 'items' ? /^items-/ : new RegExp(`^${e.kind}-${TODAY}-to-${TODAY}\\.csv$`));
      out[e.kind] = parseCsv(r.text);
    }
    expect(out.items[1].slice(0, 2)).toEqual(['Rice', 'g']);
    expect(out.purchases[1]).toEqual(['1', TODAY, 'Al-Noor', 'Rice', '10000', 'g', '1000.00', '1000.00', '400.00', 'POSTED']);
    expect(out.sales[1]).toEqual(['1', TODAY, 'Pulao', '10', '150.00', '1500.00', '200.00', 'POSTED']);
    expect(out.expenses[1]).toEqual(['1', TODAY, 'rent', '300.00', 'cash', 'Oct, "main" shop', 'POSTED']);
    expect(out.cashbook.length).toBe(4); // header + purchase paid + sale + expense
    expect(out.ledger.slice(1).map(r => r[3])).toEqual(['IN', 'SALE', 'ISSUE']);
    // The sale took 2,000 g of rice at 10 paisa/g out of stock: Rs 200.00.
    expect(out.ledger[2][6]).toBe('-200.00');
  });

  it('respects the date range', async () => {
    await trading();
    const none = parseCsv((await exportCsv(db, 'sales', '2020-01-01', '2020-01-31')).text);
    expect(none).toHaveLength(1); // header only
  });

  it('only the owner can export', async () => {
    setSession({ id: 1, name: 'Bilal', role: 'staff' });
    await expect(exportCsv(db, 'items', TODAY, TODAY)).rejects.toThrow('Only the owner');
  });

  it('keeps spreadsheet formulas from running', async () => {
    await createItem(db, { name: '=HYPERLINK("x")', baseUnit: 'g' });
    expect(await exportItems(db)).toContain("'=HYPERLINK");
  });

  it('schema import is used (keeps this file honest about the tables it touches)', () => {
    expect(Object.keys(schema)).toContain('cashEntries');
  });
});
