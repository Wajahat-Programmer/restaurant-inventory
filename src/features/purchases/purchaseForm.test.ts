import { buildPurchase, EMPTY_LINE, PurchaseForm } from './purchaseForm';

const items = [
  { id: 1, packs: [{ packName: 'bag', factorToBase: 25000 }] },
  { id: 2, packs: [] },
];
const form = (over: Partial<PurchaseForm> = {}): PurchaseForm => ({
  supplierId: 7,
  date: '2026-10-25',
  lines: [{ itemId: 1, unit: 'bag', qty: '2', price: '6,000' }],
  paid: '',
  note: '',
  ...over,
});
const err = (f: PurchaseForm) => {
  const r = buildPurchase(f, items);
  return r.ok ? null : r.error;
};

describe('buildPurchase', () => {
  it('converts packs to base units and totals exactly; blank paid = in full', () => {
    const r = buildPurchase(form(), items);
    expect(r).toMatchObject({ ok: true, totalPaisa: 1200000, paidPaisa: 1200000 });
    expect(r.ok && r.input.lines).toEqual([
      { itemId: 1, qtyBase: 50000, totalPaisa: 1200000 },
    ]);
  });

  it('supports base units, several lines, credit and partial payment', () => {
    const f = form({
      lines: [
        { itemId: 1, unit: 'base', qty: '1000', price: '0.2' },
        { itemId: 2, unit: 'base', qty: '3', price: '49.99' },
      ],
      paid: '100',
    });
    const r = buildPurchase(f, items);
    expect(r).toMatchObject({ ok: true, totalPaisa: 20 * 1000 + 3 * 4999, paidPaisa: 10000 });
    expect(buildPurchase(form({ paid: '0' }), items)).toMatchObject({ ok: true, paidPaisa: 0 });
  });

  it('explains what is wrong, line by line', () => {
    expect(err(form({ supplierId: null }))).toBe('Choose a supplier');
    expect(err(form({ lines: [] }))).toBe('Add at least one item');
    expect(err(form({ lines: [EMPTY_LINE] }))).toBe('Line 1: choose an item');
    expect(err(form({ lines: [{ ...EMPTY_LINE, itemId: 1, qty: 'x' }] }))).toContain('quantity');
    expect(err(form({ lines: [{ ...EMPTY_LINE, itemId: 1, qty: '1', price: '' }] }))).toContain('price');
    expect(err(form({ lines: [{ itemId: 2, unit: 'bag', qty: '1', price: '1' }] }))).toContain('unknown pack');
    expect(err(form({ paid: 'abc' }))).toContain('Paid must be');
    expect(err(form({ paid: '12,000.01' }))).toBe('Paid amount is more than the total');
    expect(
      err(form({ lines: [{ itemId: 1, unit: 'bag', qty: '1', price: '1' }, EMPTY_LINE] })),
    ).toBe('Line 2: choose an item');
  });
});
