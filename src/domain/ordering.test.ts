import { groupBySupplier, orderMessage, pickSupplier, SupplierPrice } from './ordering';

const sp = (supplierId: number, supplierName: string, pricePerBase: number, date: string, id = 1): SupplierPrice => ({ supplierId, supplierName, pricePerBase, date, id });
const want = (itemId: number, name: string, qty: number, baseUnit: 'g' | 'ml' | 'pcs' = 'g') => ({ itemId, name, baseUnit, qty });

describe('pickSupplier', () => {
  it('prefers whoever supplied most recently, and breaks a tie by the later purchase', () => {
    const a = pickSupplier([sp(1, 'A', 50, '2026-10-01'), sp(2, 'B', 55, '2026-10-10')]);
    expect(a.chosen?.supplierName).toBe('B');
    const b = pickSupplier([sp(1, 'A', 50, '2026-10-10', 4), sp(2, 'B', 55, '2026-10-10', 3)]);
    expect(b.chosen?.supplierName).toBe('A');
  });

  it('names another supplier only when it was clearly cheaper (10% or more)', () => {
    expect(pickSupplier([sp(1, 'A', 100, '2026-10-10'), sp(2, 'B', 91, '2026-10-01')]).cheaper).toBeNull(); // 9%
    expect(pickSupplier([sp(1, 'A', 100, '2026-10-10'), sp(2, 'B', 90, '2026-10-01')]).cheaper?.supplierName).toBe('B');
    // Of several cheaper ones, the cheapest.
    const m = pickSupplier([sp(1, 'A', 100, '2026-10-10'), sp(2, 'B', 85, '2026-10-01'), sp(3, 'C', 70, '2026-09-01')]);
    expect(m.cheaper?.supplierName).toBe('C');
  });

  it('knows nothing about an item nobody has sold you', () => {
    expect(pickSupplier([])).toEqual({ chosen: null, cheaper: null });
  });
});

describe('groupBySupplier', () => {
  const prices = new Map<number, SupplierPrice[]>([
    [1, [sp(2, 'Fresh Farms', 9, '2026-10-20')]],
    [2, [sp(1, 'Al-Noor', 32, '2026-10-20'), sp(3, 'Metro', 28, '2026-10-01')]],
    [3, [sp(1, 'Al-Noor', 48, '2026-10-20')]],
  ]);

  it('makes one list per supplier, A to Z, with the estimate and the unknown last', () => {
    const groups = groupBySupplier(
      [want(1, 'Onion', 10000), want(2, 'Rice', 25000), want(3, 'Oil', 5000, 'ml'), want(9, 'Mystery spice', 500)],
      prices,
    );
    expect(groups.map(g => g.supplierName)).toEqual(['Al-Noor', 'Fresh Farms', 'No supplier yet']);
    const alNoor = groups[0];
    expect(alNoor.lines.map(l => l.name)).toEqual(['Rice', 'Oil']);
    expect(alNoor.estimatePaisa).toBe(32 * 25000 + 48 * 5000);
    expect(alNoor.unpriced).toBe(0);
    expect(groups[1].estimatePaisa).toBe(90000);
    expect(groups[2]).toMatchObject({ supplierId: null, estimatePaisa: 0, unpriced: 1 });
    expect(groups[2].lines[0].estimatePaisa).toBeNull();
  });

  it('points out a cheaper supplier for a line, with the saving', () => {
    const [g] = groupBySupplier([want(2, 'Rice', 25000)], prices);
    expect(g.lines[0].cheaperAt).toEqual({ supplierName: 'Metro', savePct: 13 });
  });

  it('is empty when there is nothing to order', () => {
    expect(groupBySupplier([], prices)).toEqual([]);
  });
});

describe('orderMessage', () => {
  const [g] = groupBySupplier([want(2, 'Rice', 25000), want(3, 'Oil', 5000, 'ml')], new Map([[2, [sp(1, 'Al-Noor', 32, '2026-10-20')]], [3, [sp(1, 'Al-Noor', 48, '2026-10-20')]]]));

  it('lists the quantities for one supplier and asks for the price, without giving ours', () => {
    expect(orderMessage(g, '24 Oct 2026')).toBe(
      ['Order for Al-Noor, 24 Oct 2026', '- Rice: 25 kg', '- Oil: 5 L', 'Please confirm what is available and the price.'].join('\n'),
    );
  });

  it('is plain "Order" when the supplier is not known, and empty with no lines', () => {
    const [none] = groupBySupplier([want(9, 'Mystery', 5)], new Map());
    expect(orderMessage(none, 'today').startsWith('Order, today')).toBe(true);
    expect(orderMessage({ ...g, lines: [] }, 'today')).toBe('');
  });
});
