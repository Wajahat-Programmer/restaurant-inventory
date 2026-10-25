import { asc, eq } from 'drizzle-orm';
import { Db, schema } from '../db/client';
import { createTestDb } from '../db/testing';
import { PostedMovement, replay } from '../domain/ledger';
import { createItem, getItem, listItemPacks, listItems, setItemActive, updateItem } from './itemService';
import { attachPhoto, deletePhoto, listPhotos, setPrimaryPhoto } from './photoService';
import {
  createSupplier,
  listPurchases,
  listSuppliers,
  postPurchase,
  recordPayment,
  voidPurchase,
} from './purchaseService';
import {
  adjustStock,
  getCount,
  issueToKitchen,
  openCountId,
  postCount,
  recordWaste,
  setCounted,
  startCount,
} from './stockService';

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

/** The cache must always equal a replay of the append-only ledger. */
async function expectCacheMatchesLedger() {
  const levels = await db.select().from(schema.stockLevels);
  for (const lvl of levels) {
    const rows = await db
      .select()
      .from(schema.stockMovements)
      .where(eq(schema.stockMovements.itemId, lvl.itemId))
      .orderBy(asc(schema.stockMovements.id));
    const movs: PostedMovement[] = rows.map(r => ({
      itemId: r.itemId,
      type: r.type,
      qtyBase: r.qtyBase,
      valuePaisa: r.valuePaisa,
      isReversal: r.isReversal,
    }));
    expect({ qtyBase: lvl.qtyBase, valuePaisa: lvl.valuePaisa }).toEqual(
      replay(movs),
    );
  }
}

const rice = (extra = {}) => ({ name: 'Rice', baseUnit: 'g' as const, ...extra });

describe('items', () => {
  it('creates an item with packs, category and opening stock', async () => {
    const id = await createItem(
      db,
      rice({
        categoryName: 'Grains',
        reorderPoint: 5000,
        packs: [{ packName: 'bag', factorToBase: 25000 }],
      }),
      { qtyBase: 10000, valuePaisa: 200000 },
    );
    const item = await getItem(db, id);
    expect(item).toMatchObject({
      name: 'Rice',
      categoryName: 'Grains',
      qtyBase: 10000,
      valuePaisa: 200000,
      avgCostPerBase: 20,
      status: 'OK',
    });
    expect(item.packs).toEqual([{ packName: 'bag', factorToBase: 25000 }]);
    expect(item.movements).toHaveLength(1);
    expect(item.movements[0]).toMatchObject({ type: 'ADJUST', reason: 'Opening stock' });
    await expectCacheMatchesLedger();
  });

  it('rejects bad input with a readable message', async () => {
    await expect(createItem(db, rice({ name: '   ' }))).rejects.toThrow('Name is required');
    await expect(createItem(db, rice({ parLevel: -1 }))).rejects.toThrow('cannot be negative');
    await expect(
      createItem(db, rice({ packs: [{ packName: 'bag', factorToBase: 0 }] })),
    ).rejects.toThrow('Pack size');
  });

  it('rejects duplicate names and barcodes', async () => {
    await createItem(db, rice({ barcode: '123' }));
    await expect(createItem(db, rice())).rejects.toThrow('already exists');
    await expect(createItem(db, { name: 'Other', baseUnit: 'g', barcode: '123' })).rejects.toThrow(
      'already exists',
    );
  });

  it('a failed create leaves nothing behind', async () => {
    await expect(
      createItem(db, rice(), { qtyBase: -1, valuePaisa: 0 }),
    ).rejects.toThrow();
    expect(await listItems(db, { includeInactive: true })).toHaveLength(0);
  });

  it('lists with status, searches, and escapes LIKE wildcards', async () => {
    await createItem(db, rice({ reorderPoint: 100 }), { qtyBase: 50, valuePaisa: 500 });
    await createItem(db, { name: '100% Juice', baseUnit: 'ml' });
    await createItem(db, { name: 'Salt', baseUnit: 'g' }, { qtyBase: 900, valuePaisa: 90 });

    const all = await listItems(db);
    expect(all.map(i => [i.name, i.status])).toEqual([
      ['100% Juice', 'OUT'],
      ['Rice', 'LOW'],
      ['Salt', 'OK'],
    ]);
    expect((await listItems(db, { search: 'ric' })).map(i => i.name)).toEqual(['Rice']);
    expect((await listItems(db, { search: '%' })).map(i => i.name)).toEqual(['100% Juice']);
    expect(await listItems(db, { search: '_' })).toHaveLength(0);
  });

  it('lists active items with their pack sizes', async () => {
    await createItem(db, rice({ packs: [{ packName: 'bag', factorToBase: 25000 }] }));
    const salt = await createItem(db, { name: 'Salt', baseUnit: 'g' });
    const old = await createItem(db, { name: 'Old', baseUnit: 'pcs' });
    await setItemActive(db, old, false);
    const r = await listItemPacks(db);
    expect(r.map(i => [i.name, i.packs.length])).toEqual([['Rice', 1], ['Salt', 0]]);
    expect(r.find(i => i.id === salt)?.baseUnit).toBe('g');
  });

  it('updates, deactivates and hides inactive items', async () => {
    const id = await createItem(db, rice({ packs: [{ packName: 'bag', factorToBase: 1000 }] }));
    await updateItem(db, id, rice({ name: 'Basmati', packs: [] }));
    expect((await getItem(db, id)).name).toBe('Basmati');
    expect((await getItem(db, id)).packs).toEqual([]);
    await setItemActive(db, id, false);
    expect(await listItems(db)).toHaveLength(0);
    expect(await listItems(db, { includeInactive: true })).toHaveLength(1);
    await expect(updateItem(db, 999, rice())).rejects.toThrow('Item not found');
  });
});

describe('purchases', () => {
  async function setup() {
    const itemId = await createItem(db, rice({ packs: [{ packName: 'bag', factorToBase: 25000 }] }));
    const a = await createSupplier(db, { name: 'Al-Noor Traders' });
    const b = await createSupplier(db, { name: 'City Wholesale', openingBalancePaisa: 50000 });
    return { itemId, a, b };
  }

  it('posts stock in, updates the weighted average and records prices', async () => {
    const { itemId, a, b } = await setup();
    await postPurchase(db, {
      supplierId: a,
      date: '2026-10-01',
      lines: [{ itemId, qtyBase: 25000, totalPaisa: 500000 }],
      paidPaisa: 500000,
    });
    await postPurchase(db, {
      supplierId: b,
      date: '2026-10-08',
      lines: [{ itemId, qtyBase: 25000, totalPaisa: 700000 }],
      paidPaisa: 0,
    });
    const item = await getItem(db, itemId);
    expect(item.qtyBase).toBe(50000);
    expect(item.valuePaisa).toBe(1200000);
    expect(item.avgCostPerBase).toBe(24);
    expect(item.prices.map(p => [p.supplierName, p.pricePerBase])).toEqual([
      ['City Wholesale', 28],
      ['Al-Noor Traders', 20],
    ]);
    await expectCacheMatchesLedger();
  });

  it('tracks supplier dues, partial payments and rejects overpayment', async () => {
    const { itemId, b } = await setup();
    const p = await postPurchase(db, {
      supplierId: b,
      date: '2026-10-08',
      lines: [{ itemId, qtyBase: 1000, totalPaisa: 100000 }],
      paidPaisa: 20000,
    });
    const due = async () => (await listSuppliers(db)).find(s => s.id === b)!.duePaisa;
    expect(await due()).toBe(130000); // 50,000 opening + 100,000 - 20,000
    await recordPayment(db, { supplierId: b, purchaseId: p, date: '2026-10-09', amountPaisa: 30000 });
    expect(await due()).toBe(100000);
    await expect(
      recordPayment(db, { supplierId: b, date: '2026-10-09', amountPaisa: 100001 }),
    ).rejects.toThrow('more than what is owed');
    await expect(
      recordPayment(db, { supplierId: b, date: '2026-10-09', amountPaisa: 0 }),
    ).rejects.toThrow('more than 0');
    await recordPayment(db, { supplierId: b, date: '2026-10-10', amountPaisa: 100000 });
    expect(await due()).toBe(0);
    const [row] = await listPurchases(db, { supplierId: b });
    expect(row).toMatchObject({ payment: 'PARTIAL', paidPaisa: 20000, supplierName: 'City Wholesale' });
  });

  it('validates the purchase before writing anything', async () => {
    const { itemId, a } = await setup();
    const base = { supplierId: a, date: '2026-10-01', paidPaisa: 0 };
    await expect(postPurchase(db, { ...base, lines: [] })).rejects.toThrow('at least one item');
    await expect(
      postPurchase(db, { ...base, lines: [{ itemId, qtyBase: 0, totalPaisa: 1 }] }),
    ).rejects.toThrow('quantity');
    await expect(
      postPurchase(db, { ...base, lines: [{ itemId, qtyBase: 1, totalPaisa: 100 }], paidPaisa: 101 }),
    ).rejects.toThrow('between 0 and the total');
    await expect(
      postPurchase(db, { ...base, date: '01/10/2026', lines: [{ itemId, qtyBase: 1, totalPaisa: 1 }] }),
    ).rejects.toThrow('YYYY-MM-DD');
    await expect(
      postPurchase(db, { ...base, supplierId: 999, lines: [{ itemId, qtyBase: 1, totalPaisa: 1 }] }),
    ).rejects.toThrow('Supplier not found');
  });

  it('is atomic: a bad second line rolls back the whole purchase', async () => {
    const { itemId, a } = await setup();
    await expect(
      postPurchase(db, {
        supplierId: a,
        date: '2026-10-01',
        lines: [
          { itemId, qtyBase: 1000, totalPaisa: 10000 },
          { itemId: 999, qtyBase: 1, totalPaisa: 1 },
        ],
        paidPaisa: 0,
      }),
    ).rejects.toThrow('Item not found');
    expect(await listPurchases(db)).toHaveLength(0);
    expect((await getItem(db, itemId)).qtyBase).toBe(0);
    expect(await db.select().from(schema.stockMovements)).toHaveLength(0);
    // The queue must not be wedged by the failure.
    await postPurchase(db, {
      supplierId: a,
      date: '2026-10-01',
      lines: [{ itemId, qtyBase: 1, totalPaisa: 1 }],
      paidPaisa: 0,
    });
  });

  it('voids with reversing entries and refuses once the stock is used', async () => {
    const { itemId, a } = await setup();
    const p = await postPurchase(db, {
      supplierId: a,
      date: '2026-10-01',
      lines: [{ itemId, qtyBase: 1000, totalPaisa: 10000 }],
      paidPaisa: 0,
    });
    await voidPurchase(db, p);
    expect((await getItem(db, itemId)).qtyBase).toBe(0);
    expect((await listPurchases(db))[0].status).toBe('VOID');
    expect((await listSuppliers(db))[0].duePaisa).toBe(0);
    const movs = await db.select().from(schema.stockMovements);
    expect(movs.map(m => [m.type, m.qtyBase, m.isReversal])).toEqual([
      ['IN', 1000, false],
      ['IN', -1000, true],
    ]);
    await expect(voidPurchase(db, p)).rejects.toThrow('already void');

    const p2 = await postPurchase(db, {
      supplierId: a,
      date: '2026-10-02',
      lines: [{ itemId, qtyBase: 1000, totalPaisa: 10000 }],
      paidPaisa: 0,
    });
    await issueToKitchen(db, { itemId, qtyBase: 600 });
    await expect(voidPurchase(db, p2)).rejects.toThrow('Insufficient stock');
    expect((await listPurchases(db))[0].status).toBe('POSTED');
    expect((await getItem(db, itemId)).qtyBase).toBe(400);
    await expectCacheMatchesLedger();
  });
});

describe('stock out', () => {
  async function stocked() {
    const itemId = await createItem(db, rice(), { qtyBase: 1000, valuePaisa: 10000 });
    return itemId;
  }

  it('issues at the average cost and blocks over-issue atomically', async () => {
    const itemId = await stocked();
    await issueToKitchen(db, { itemId, qtyBase: 250 });
    expect(await getItem(db, itemId)).toMatchObject({ qtyBase: 750, valuePaisa: 7500 });
    await expect(issueToKitchen(db, { itemId, qtyBase: 751 })).rejects.toThrow('Insufficient stock');
    await expect(issueToKitchen(db, { itemId, qtyBase: 0 })).rejects.toThrow('more than 0');
    await expect(issueToKitchen(db, { itemId, qtyBase: -5 })).rejects.toThrow('more than 0');
    expect((await getItem(db, itemId)).qtyBase).toBe(750);
    await expectCacheMatchesLedger();
  });

  it('records wastage with a reason code', async () => {
    const itemId = await stocked();
    await recordWaste(db, { itemId, qtyBase: 100, reason: 'spoiled', note: 'wet bag' });
    const item = await getItem(db, itemId);
    expect(item.qtyBase).toBe(900);
    expect(item.movements[0]).toMatchObject({ type: 'WASTE', reason: 'spoiled: wet bag' });
    await expect(
      recordWaste(db, { itemId, qtyBase: 1, reason: 'bored' as never }),
    ).rejects.toThrow('reason');
  });

  it('adjusts up or down but requires a note', async () => {
    const itemId = await stocked();
    await adjustStock(db, { itemId, deltaBase: -100, note: 'spilled' });
    await adjustStock(db, { itemId, deltaBase: 50, note: 'found a bag' });
    expect((await getItem(db, itemId)).qtyBase).toBe(950);
    await expect(adjustStock(db, { itemId, deltaBase: 5, note: '  ' })).rejects.toThrow('note');
    await expect(adjustStock(db, { itemId, deltaBase: 0, note: 'x' })).rejects.toThrow('0');
    await expectCacheMatchesLedger();
  });
});

describe('stock count', () => {
  it('posts variances against live stock and leaves uncounted items alone', async () => {
    const a = await createItem(db, rice(), { qtyBase: 1000, valuePaisa: 10000 });
    const b = await createItem(db, { name: 'Salt', baseUnit: 'g' }, { qtyBase: 500, valuePaisa: 500 });
    const c = await createItem(db, { name: 'Oil', baseUnit: 'ml' }, { qtyBase: 200, valuePaisa: 4000 });

    const countId = await startCount(db, '2026-10-25');
    expect(await openCountId(db)).toBe(countId);
    await expect(startCount(db, '2026-10-25')).rejects.toThrow('open count');

    // Stock moves while the count is in progress; posting uses live stock.
    await issueToKitchen(db, { itemId: a, qtyBase: 100 });

    const lines = (await getCount(db, countId)).lines;
    const lineOf = (itemId: number) => lines.find(l => l.itemId === itemId)!.lineId;
    await setCounted(db, lineOf(a), 850); // live 900 -> -50
    await setCounted(db, lineOf(b), 500); // no change
    // c is not counted

    expect(await postCount(db, countId)).toBe(1);
    expect((await getItem(db, a)).qtyBase).toBe(850);
    expect((await getItem(db, a)).movements[0]).toMatchObject({
      type: 'COUNT',
      qtyBase: -50,
      reason: `Stock count #${countId}`,
    });
    expect((await getItem(db, c)).qtyBase).toBe(200);
    expect((await getCount(db, countId)).status).toBe('POSTED');
    expect(await openCountId(db)).toBeNull();

    await expect(postCount(db, countId)).rejects.toThrow('already posted');
    await expect(setCounted(db, lineOf(a), 1)).rejects.toThrow('not open');
    await expectCacheMatchesLedger();
  });

  it('computes variance and values a gain at the average', async () => {
    const a = await createItem(db, rice(), { qtyBase: 1000, valuePaisa: 10000 });
    const countId = await startCount(db, '2026-10-25');
    const [line] = (await getCount(db, countId)).lines;
    await setCounted(db, line.lineId, 1100);
    expect((await getCount(db, countId)).lines[0].variance).toBe(100);
    await postCount(db, countId);
    expect(await getItem(db, a)).toMatchObject({ qtyBase: 1100, valuePaisa: 11000 });
  });

  it('applies unsaved entries in the same transaction as the post', async () => {
    const a = await createItem(db, rice(), { qtyBase: 1000, valuePaisa: 10000 });
    const b = await createItem(db, { name: 'Salt', baseUnit: 'g' }, { qtyBase: 100, valuePaisa: 100 });
    const countId = await startCount(db, '2026-10-25');
    const lines = (await getCount(db, countId)).lines;
    const lineOf = (id: number) => lines.find(l => l.itemId === id)!.lineId;

    // A bad entry rejects everything and leaves the count open and untouched.
    await expect(
      postCount(db, countId, [{ lineId: lineOf(a), countedQty: 900 }, { lineId: 99999, countedQty: 1 }]),
    ).rejects.toThrow('not part of this count');
    expect((await getCount(db, countId)).status).toBe('OPEN');
    expect((await getCount(db, countId)).lines.every(l => l.countedQty === null)).toBe(true);
    expect((await getItem(db, a)).qtyBase).toBe(1000);

    await expect(
      postCount(db, countId, [{ lineId: lineOf(a), countedQty: -1 }]),
    ).rejects.toThrow('negative');

    expect(
      await postCount(db, countId, [
        { lineId: lineOf(a), countedQty: 900 },
        { lineId: lineOf(b), countedQty: 100 },
      ]),
    ).toBe(1);
    expect((await getItem(db, a)).qtyBase).toBe(900);
    expect((await getItem(db, b)).qtyBase).toBe(100);
  });

  it('refuses to post an empty count or start with no items', async () => {
    await expect(startCount(db, '2026-10-25')).rejects.toThrow('Add items');
    await createItem(db, rice());
    const countId = await startCount(db, '2026-10-25');
    await expect(postCount(db, countId)).rejects.toThrow('at least one item');
    const [line] = (await getCount(db, countId)).lines;
    await expect(setCounted(db, line.lineId, -1)).rejects.toThrow('negative');
    await setCounted(db, line.lineId, 5);
    await setCounted(db, line.lineId, null); // un-count
    expect((await getCount(db, countId)).lines[0].countedQty).toBeNull();
  });
});

describe('photos', () => {
  const files = (n: number) => ({
    originalPath: `/p/o${n}.jpg`,
    cutoutPath: n % 2 ? `/p/c${n}.png` : null,
    thumbPath: `/p/t${n}.webp`,
    width: 768,
    height: 1024,
  });

  it('first photo is primary; exactly one primary afterwards', async () => {
    const id = await createItem(db, rice());
    const a = await attachPhoto(db, id, files(1));
    const b = await attachPhoto(db, id, files(2));
    expect((await listPhotos(db, id)).map(p => [p.id, p.isPrimary])).toEqual([[a, true], [b, false]]);
    await setPrimaryPhoto(db, b);
    expect((await listPhotos(db, id)).map(p => [p.id, p.isPrimary])).toEqual([[b, true], [a, false]]);
  });

  it('deleting the primary promotes the newest and returns files to remove', async () => {
    const id = await createItem(db, rice());
    const a = await attachPhoto(db, id, files(1));
    const b = await attachPhoto(db, id, files(2));
    expect(await deletePhoto(db, a)).toEqual(['/p/o1.jpg', '/p/c1.png', '/p/t1.webp']);
    expect((await listPhotos(db, id)).map(p => [p.id, p.isPrimary])).toEqual([[b, true]]);
    expect(await deletePhoto(db, b)).toEqual(['/p/o2.jpg', '/p/t2.webp']);
    expect(await listPhotos(db, id)).toEqual([]);
  });

  it('rejects a photo for a missing item or without files', async () => {
    await expect(attachPhoto(db, 999, files(1))).rejects.toThrow('Item not found');
    const id = await createItem(db, rice());
    await expect(attachPhoto(db, id, { ...files(1), thumbPath: '' })).rejects.toThrow('missing');
    await expect(deletePhoto(db, 999)).rejects.toThrow('Photo not found');
  });
});
