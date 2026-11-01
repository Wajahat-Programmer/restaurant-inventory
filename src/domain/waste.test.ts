import { wasteBreakdown, WasteRow } from './waste';

const w = (item: string, qtyBase: number, valuePaisa: number, reason: string | null, baseUnit: 'g' | 'ml' | 'pcs' = 'g'): WasteRow => ({
  item, baseUnit, qtyBase, valuePaisa, reason,
});

describe('wasteBreakdown', () => {
  const rows = [
    w('Chicken', 500, 30000, 'expired'),
    w('Chicken', 300, 18000, 'spoiled'),
    w('Bread', 4, 2000, 'expired', 'pcs'),
    w('Milk', 1000, 20000, null, 'ml'),
  ];

  it('adds up by reason, biggest first, with each share of the total', () => {
    const { byReason } = wasteBreakdown(rows);
    expect(byReason.map(g => [g.label, g.valuePaisa, g.count, g.sharePct])).toEqual([
      ['expired', 32000, 2, 45.7],
      ['spoiled', 18000, 1, 25.7],
      ['No reason given', 20000, 1, 28.6],
    ].sort((a, b) => (b[1] as number) - (a[1] as number)));
  });

  it('groups by the reason alone when the note is stored after it', () => {
    const { byReason } = wasteBreakdown([w('Rice', 800, 25000, 'burnt: Burnt pot'), w('Rice', 100, 3000, 'burnt'), w('Tomato', 2000, 22000, 'spoiled: Soft tomatoes'), w('Milk', 1, 100, ': odd')]);
    expect(byReason.map(g => [g.label, g.count])).toEqual([['burnt', 2], ['spoiled', 1], ['No reason given', 1]]);
  });

  it('adds up by item with the quantity thrown away', () => {
    const { byItem } = wasteBreakdown(rows);
    expect(byItem[0]).toMatchObject({ label: 'Chicken', count: 2, qtyBase: 800, valuePaisa: 48000, baseUnit: 'g', sharePct: 68.6 });
    expect(byItem.map(g => g.label)).toEqual(['Chicken', 'Milk', 'Bread']);
  });

  it('is empty with nothing thrown away', () => {
    expect(wasteBreakdown([])).toEqual({ byReason: [], byItem: [] });
  });

  it('breaks ties by name and survives a zero total', () => {
    const { byItem } = wasteBreakdown([w('B', 1, 0, null), w('A', 1, 0, null)]);
    expect(byItem.map(g => [g.label, g.sharePct])).toEqual([['A', 0], ['B', 0]]);
  });
});
