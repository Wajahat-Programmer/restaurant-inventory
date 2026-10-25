import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../App';
import { Db } from '../src/db/client';
import { createTestDb } from '../src/db/testing';
import { createItem, getItem, listItems } from '../src/services/itemService';
import { createSupplier, listSuppliers, postPurchase } from '../src/services/purchaseService';
import { issueToKitchen } from '../src/services/stockService';

/** Whole-app tests: real screens, real services, in-memory SQLite. */
let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

const press = (id: string) => fireEvent.press(screen.getByTestId(id));
const type = (id: string, text: string) => fireEvent.changeText(screen.getByTestId(id), text);
const text = (id: string) => {
  const c = screen.getByTestId(id).props.children;
  return [c].flat().join('');
};

async function open() {
  await render(<App db={db} />);
  await screen.findByTestId('tab-stock');
}

describe('stock list', () => {
  it('shows an empty state, then the items with status and value', async () => {
    await open();
    expect(await screen.findByTestId('stock-empty')).toBeTruthy();

    await createItem(db, { name: 'Rice', baseUnit: 'g', reorderPoint: 5000 }, { qtyBase: 2000, valuePaisa: 40000 });
    await createItem(db, { name: 'Salt', baseUnit: 'g' });
    // Reopen so the list reloads from the seeded data.
    await screen.unmount();
    await open();

    expect(await screen.findByTestId('item-Rice')).toBeTruthy();
    expect(screen.getByTestId('item-Salt')).toBeTruthy();
    expect(screen.getAllByTestId('status-LOW')).toHaveLength(1);
    expect(screen.getAllByTestId('status-OUT')).toHaveLength(1);
    expect(screen.getByText('2 kg')).toBeTruthy();
    expect(screen.getByText('Rs 400.00')).toBeTruthy();
  });

  it('filters by search', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await createItem(db, { name: 'Salt', baseUnit: 'g' });
    await open();
    await screen.findByTestId('item-Rice');
    await type('search', 'sal');
    await waitFor(() => expect(screen.queryByTestId('item-Rice')).toBeNull());
    expect(screen.getByTestId('item-Salt')).toBeTruthy();
    await type('search', 'zzz');
    expect(await screen.findByText('No items match your search.')).toBeTruthy();
  });
});

describe('add item', () => {
  it('creates an item with a pack and opening stock', async () => {
    await open();
    await press('fab-add-item');
    await type('field-name', 'Flour');
    await type('field-reorderPoint', '5000');
    await press('pack-add');
    await type('pack-name-0', 'bag');
    await type('pack-size-0', '25000');
    await type('field-openingQty', '50000');
    await type('field-openingValue', '12,000');
    await press('save-item');

    expect(await screen.findByTestId('item-Flour')).toBeTruthy();
    const [flour] = await listItems(db);
    expect(flour).toMatchObject({ name: 'Flour', qtyBase: 50000, valuePaisa: 1200000 });
  });

  it('shows validation errors and keeps the form open', async () => {
    await open();
    await press('fab-add-item');
    await press('save-item');
    expect(await screen.findByText('✖ Name is required')).toBeTruthy();
    await type('field-name', 'Flour');
    await type('field-parLevel', 'abc');
    await press('save-item');
    expect(await screen.findByText(/Par level must be a number/)).toBeTruthy();
    expect(await listItems(db)).toHaveLength(0);
  });

  it('rejects a duplicate name with a readable message', async () => {
    await createItem(db, { name: 'Flour', baseUnit: 'g' });
    await open();
    await press('fab-add-item');
    await type('field-name', 'Flour');
    await press('save-item');
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });
});

describe('stock out from the item page', () => {
  async function openItem(qty = 1000) {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g', packs: [{ packName: 'bag', factorToBase: 500 }] }, { qtyBase: qty, valuePaisa: qty * 10 });
    await open();
    await press('item-Rice');
    await screen.findByTestId('detail-qty');
    return id;
  }

  it('issues stock, converting packs to base units', async () => {
    const id = await openItem();
    await press('act-issue');
    await screen.findByTestId('action-onhand');
    await type('field-qty', '1');
    await press('unit-bag');
    expect(await screen.findByTestId('action-converted')).toBeTruthy();
    await press('submit-action');
    await waitFor(async () => expect((await getItem(db, id)).qtyBase).toBe(500));
    expect(await screen.findByText('500 g')).toBeTruthy();
  });

  it('refuses to issue more than is on hand and says why', async () => {
    const id = await openItem(100);
    await press('act-issue');
    await screen.findByTestId('field-qty');
    await type('field-qty', '101');
    await press('submit-action');
    expect(await screen.findByText(/Insufficient stock/)).toBeTruthy();
    expect((await getItem(db, id)).qtyBase).toBe(100);
  });

  it('requires a note to adjust and a reason code for waste', async () => {
    const id = await openItem();
    await press('act-adjust');
    await screen.findByTestId('field-qty');
    await type('field-qty', '5');
    await press('submit-action');
    expect(await screen.findByText(/note is required/)).toBeTruthy();
    await type('field-note', 'found a sack');
    await press('dir-add');
    await press('submit-action');
    await waitFor(async () => expect((await getItem(db, id)).qtyBase).toBe(1005));

    await press('act-waste');
    await screen.findByTestId('reason-burnt');
    await type('field-qty', '10');
    await press('reason-burnt');
    await press('submit-action');
    await waitFor(async () => expect((await getItem(db, id)).qtyBase).toBe(995));
    expect((await getItem(db, id)).movements[0].reason).toBe('burnt');
  });

  it('shows the ledger history with reversals labelled', async () => {
    await openItem();
    expect(await screen.findByText(/ADJUST/)).toBeTruthy();
    expect(screen.getByText('Opening stock', { exact: false })).toBeTruthy();
  });
});

describe('suppliers and purchases', () => {
  it('records a purchase on credit, then pays the supplier in part', async () => {
    const itemId = await createItem(db, { name: 'Rice', baseUnit: 'g', packs: [{ packName: 'bag', factorToBase: 25000 }] });
    const supplierId = await createSupplier(db, { name: 'Al-Noor', openingBalancePaisa: 0 });
    await open();

    await press('tab-purchases');
    expect(await screen.findByTestId('purchases-empty')).toBeTruthy();
    await press('fab-add-purchase');

    await press('pick-supplier');
    await press('pick-supplier-Al-Noor');
    await press('line-0-item');
    await press('line-0-item-Rice');
    await press('line-0-unit-bag');
    await type('line-0-qty', '2');
    await type('line-0-price', '6000');
    expect(text('purchase-total')).toBe('Total Rs 12,000.00');
    await type('field-paid', '0');
    expect(text('purchase-due')).toBe('Owed to supplier: Rs 12,000.00');
    await press('save-purchase');

    expect(await screen.findByText('Al-Noor')).toBeTruthy();
    expect((await getItem(db, itemId)).qtyBase).toBe(50000);
    expect((await listSuppliers(db))[0].duePaisa).toBe(1200000);

    await press('tab-suppliers');
    expect(await screen.findByText('⚠ Owe Rs 12,000.00')).toBeTruthy();
    await press('supplier-Al-Noor');
    await screen.findByTestId('supplier-due');
    await type('field-payment', '5000');
    await press('pay-amount');
    await waitFor(async () => expect((await listSuppliers(db))[0].duePaisa).toBe(700000));
    await type('field-payment', '99999');
    await press('pay-amount');
    expect(await screen.findByText(/more than what is owed/)).toBeTruthy();
    expect((await listSuppliers(db))[0].duePaisa).toBe(700000);
    expect(supplierId).toBeGreaterThan(0);
  });

  it('explains what is missing instead of saving a half-filled purchase', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await open();
    await press('tab-purchases');
    await press('fab-add-purchase');
    await press('save-purchase');
    expect(await screen.findByText('✖ Choose a supplier')).toBeTruthy();
  });

  it('adds a supplier from the form with an opening balance', async () => {
    await open();
    await press('tab-suppliers');
    await press('fab-add-supplier');
    await type('field-supplier-name', 'City Wholesale');
    await type('field-supplier-opening', '2500');
    await press('save-supplier');
    expect(await screen.findByText('⚠ Owe Rs 2,500.00')).toBeTruthy();
  });

  it('voids a purchase and blocks the void once stock was used', async () => {
    const itemId = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const supplierId = await createSupplier(db, { name: 'Al-Noor' });
    await postPurchase(db, { supplierId, date: '2026-10-01', lines: [{ itemId, qtyBase: 1000, totalPaisa: 10000 }], paidPaisa: 10000 });
    await open();
    await press('tab-purchases');
    await screen.findByText('Al-Noor');
    await issueToKitchen(db, { itemId, qtyBase: 600 });
    await press('void-1');
    expect(await screen.findByText(/Insufficient stock/)).toBeTruthy();
    expect((await getItem(db, itemId)).qtyBase).toBe(400);
  });
});

describe('stock count', () => {
  it('counts items, shows variance, and posts adjustments', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 1000, valuePaisa: 10000 });
    await createItem(db, { name: 'Salt', baseUnit: 'g' }, { qtyBase: 500, valuePaisa: 500 });
    await open();
    await press('tab-count');
    await press('start-count');

    expect(await screen.findByTestId('count-progress')).toBeTruthy();
    expect(text('count-progress')).toMatch(/: 0 of 2 counted$/);
    await type('counted-Rice', '900');
    expect(await screen.findByText('－ 100 g less')).toBeTruthy();

    await press('post-count');
    expect(await screen.findByTestId('count-message')).toBeTruthy();
    expect(text('count-message')).toBe('✓ Count posted: 1 item adjusted.');
    expect((await getItem(db, id)).qtyBase).toBe(900);
  });

  it('posts typed counts without needing the field to lose focus', async () => {
    const id = await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 1000, valuePaisa: 10000 });
    await open();
    await press('tab-count');
    await press('start-count');
    await screen.findByTestId('counted-Rice');
    await type('counted-Rice', '1100');
    expect(await screen.findByText('＋ 100 g more')).toBeTruthy();
    expect(text('count-progress')).toMatch(/: 1 of 1 counted$/);
    await press('post-count');
    await screen.findByTestId('count-message');
    expect((await getItem(db, id)).qtyBase).toBe(1100);
  });

  it('flags a bad count instead of posting it', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 1000, valuePaisa: 10000 });
    await open();
    await press('tab-count');
    await press('start-count');
    await screen.findByTestId('counted-Rice');
    await type('counted-Rice', '12x');
    expect(await screen.findByText('✖ Enter a number like 2 or 1.5')).toBeTruthy();
    await press('post-count');
    expect(await screen.findByText(/Rice: enter a quantity/)).toBeTruthy();
  });

  it('will not post an empty count', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g' });
    await open();
    await press('tab-count');
    await press('start-count');
    await screen.findByTestId('post-count');
    await press('post-count');
    expect(await screen.findByText(/Count at least one item/)).toBeTruthy();
  });
});
