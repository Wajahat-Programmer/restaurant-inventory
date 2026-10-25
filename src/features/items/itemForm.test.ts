import { EMPTY_ITEM_FORM, itemFormSchema, toItemInput } from './itemForm';

const ok = (over = {}) => itemFormSchema.safeParse({ ...EMPTY_ITEM_FORM, name: 'Rice', ...over });
const firstError = (over = {}) => {
  const r = ok(over);
  return r.success ? null : r.error.issues[0].message;
};

describe('item form', () => {
  it('accepts a minimal item and converts blanks to zero', () => {
    expect(ok().success).toBe(true);
    expect(toItemInput(EMPTY_ITEM_FORM as never).input).toMatchObject({
      parLevel: 0,
      reorderPoint: 0,
    });
  });

  it('validates each field with a readable message', () => {
    expect(firstError({ name: ' ' })).toBe('Name is required');
    expect(firstError({ parLevel: '-1' })).toContain('Par level must be a number');
    expect(firstError({ reorderPoint: '1.2345' })).toContain('Reorder point');
    expect(firstError({ shelfLifeDays: '0' })).toContain('whole number');
    expect(firstError({ packs: [{ packName: 'bag', size: '' }] })).toContain('both');
    expect(firstError({ packs: [{ packName: '', size: '5' }] })).toContain('both');
    expect(firstError({ openingQty: '5' })).toContain('opening stock cost');
    expect(firstError({ openingValue: '5' })).toContain('opening quantity');
    expect(firstError({ openingQty: '5', openingValue: '1.234' })).toContain('amount');
  });

  it('converts packs, opening stock and rupees exactly', () => {
    const r = ok({
      categoryName: 'Grains',
      parLevel: '50000',
      shelfLifeDays: '365',
      packs: [
        { packName: 'bag', size: '25000' },
        { packName: '', size: '' },
      ],
      openingQty: '10000',
      openingValue: '1,999.90',
    });
    expect(r.success).toBe(true);
    const { input, opening } = toItemInput(r.data!);
    expect(input).toMatchObject({
      categoryName: 'Grains',
      parLevel: 50000,
      shelfLifeDays: 365,
      packs: [{ packName: 'bag', factorToBase: 25000 }],
    });
    expect(opening).toEqual({ qtyBase: 10000, valuePaisa: 199990 });
  });
});
