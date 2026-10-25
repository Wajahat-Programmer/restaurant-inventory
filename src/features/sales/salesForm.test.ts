import { buildSales, EMPTY_SALES_LINE, stockWarnings } from './salesForm';

const recipes = [
  { id: 1, sellPricePaisa: 15000, lines: [{ itemId: 10, itemName: 'Rice', baseUnit: 'g' as const, qtyBase: 200 }] },
  { id: 2, sellPricePaisa: 8000, lines: [{ itemId: 10, itemName: 'Rice', baseUnit: 'g' as const, qtyBase: 100 }] },
];

describe('buildSales', () => {
  it('builds lines and the revenue total', () => {
    const r = buildSales(
      { date: '2026-10-25', lines: [{ recipeId: 1, qty: '10' }, { recipeId: 2, qty: '3' }] },
      recipes,
    );
    expect(r).toMatchObject({ ok: true, revenuePaisa: 150000 + 24000 });
    expect(r.ok && r.input.lines).toEqual([{ recipeId: 1, qty: 10 }, { recipeId: 2, qty: 3 }]);
  });

  it('explains what is wrong, line by line', () => {
    const err = (f: Parameters<typeof buildSales>[0]) => {
      const r = buildSales(f, recipes);
      return r.ok ? null : r.error;
    };
    expect(err({ date: '2026-02-30', lines: [{ recipeId: 1, qty: '1' }] })).toContain('real date');
    expect(err({ date: '2026-10-25', lines: [] })).toBe('Add at least one dish');
    expect(err({ date: '2026-10-25', lines: [EMPTY_SALES_LINE] })).toBe('Line 1: choose a dish');
    for (const bad of ['', '0', '-3', '1.5', 'x', '1,000', '1234567']) {
      expect(err({ date: '2026-10-25', lines: [{ recipeId: 1, qty: bad }] })).toContain('whole number');
    }
    expect(err({ date: '2026-10-25', lines: [{ recipeId: 1, qty: '2' }, { recipeId: 99, qty: '2' }] })).toBe('Line 2: choose a dish');
  });
});

describe('stockWarnings', () => {
  const stock = new Map([[10, { name: 'Rice', unit: 'g' as const, qtyBase: 1000 }]]);

  it('warns once per ingredient across all lines', () => {
    const w = stockWarnings({ date: 'x', lines: [{ recipeId: 1, qty: 4 }, { recipeId: 2, qty: 3 }] }, recipes, stock);
    expect(w).toEqual(['Rice: need 1.1 kg, have 1 kg']);
  });

  it('is quiet when there is enough', () => {
    expect(stockWarnings({ date: 'x', lines: [{ recipeId: 1, qty: 5 }] }, recipes, stock)).toEqual([]);
  });
});
