import { buildShoppingList, toOrder } from './shoppingList';

const items = [
  { itemId: 1, name: 'Rice', baseUnit: 'g' as const, qty: 25000 },
  { itemId: 2, name: 'Oil', baseUnit: 'ml' as const, qty: 1500 },
  { itemId: 3, name: 'Eggs', baseUnit: 'pcs' as const, qty: 60 },
];

describe('shopping list', () => {
  it('lists only the chosen items, in friendly units', () => {
    expect(buildShoppingList(items, new Set([1, 3]), '2026-10-25')).toBe(
      'Shopping list 2026-10-25\n- Rice: 25 kg\n- Eggs: 60 pcs',
    );
  });

  it('is empty when nothing is chosen', () => {
    expect(buildShoppingList(items, new Set(), '2026-10-25')).toBe('');
  });

  it('keeps only rows that have something to order', () => {
    const rows = [{ reorder: { qty: 5 } }, { reorder: { qty: 0 } }, { reorder: null }];
    expect(toOrder(rows)).toEqual([{ reorder: { qty: 5 } }]);
  });
});
