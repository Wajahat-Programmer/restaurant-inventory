import { buildRecipe, previewDish } from './recipeForm';

const form = (over = {}) => ({
  name: 'Pulao',
  price: '150',
  lines: [{ itemId: 1, qty: '200' }, { itemId: 2, qty: '10' }],
  ...over,
});
const err = (f: ReturnType<typeof form>) => {
  const r = buildRecipe(f);
  return r.ok ? null : r.error;
};

describe('buildRecipe', () => {
  it('builds a service input with the price in exact paisa', () => {
    expect(buildRecipe(form({ price: '1,499.50' }))).toEqual({
      ok: true,
      input: { name: 'Pulao', sellPricePaisa: 149950, lines: [{ itemId: 1, qtyBase: 200 }, { itemId: 2, qtyBase: 10 }] },
    });
  });

  it('says what is wrong', () => {
    expect(err(form({ name: ' ' }))).toBe('Name is required');
    expect(err(form({ price: 'abc' }))).toContain('Selling price');
    expect(err(form({ lines: [] }))).toBe('Add at least one ingredient');
    expect(err(form({ lines: [{ itemId: null as never, qty: '1' }] }))).toBe('Ingredient 1: choose an item');
    expect(err(form({ lines: [{ itemId: 1, qty: '0' }] }))).toContain('Ingredient 1: enter an amount');
    expect(err(form({ lines: [{ itemId: 1, qty: '1' }, { itemId: 1, qty: '2' }] }))).toBe('An ingredient is listed twice');
  });
});

describe('previewDish', () => {
  const costs = new Map<number, number | null>([[1, 10], [2, 20], [3, null]]);

  it('shows cost and margin as the form is filled in', () => {
    expect(previewDish(form(), costs)).toEqual({ costPaisa: 2200, known: true, marginPaisa: 12800, marginPct: 85.3 });
  });

  it('flags an unknown ingredient cost and ignores unfinished lines', () => {
    const p = previewDish(form({ lines: [{ itemId: 3, qty: '5' }, { itemId: null as never, qty: '' }] }), costs);
    expect(p.known).toBe(false);
  });

  it('has no margin until the price is valid', () => {
    expect(previewDish(form({ price: '' }), costs)).toMatchObject({ marginPaisa: null, marginPct: null });
  });
});
