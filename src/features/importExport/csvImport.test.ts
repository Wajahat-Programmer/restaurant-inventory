import { parseCsv } from '../../domain/csv';
import { previewItems, previewRecipes, previewSuppliers, TEMPLATES } from './csvImport';

const none = { names: new Set<string>(), barcodes: new Set<string>() };
const csv = (s: string) => parseCsv(s);

describe('previewItems', () => {
  it('accepts a clean file and converts opening stock exactly', () => {
    const p = previewItems(
      csv('Name,Base unit,Category,Par level,Reorder point,Shelf life days,Barcode,Opening quantity,Opening value Rs\nRice,g,Grains,50000,10000,365,111,25000,"5,000.50"\nSalt,g,,,,,,,'),
      none,
    );
    expect(p.fatal).toBeNull();
    expect(p.errors).toEqual([]);
    expect(p.valid).toHaveLength(2);
    expect(p.valid[0]).toMatchObject({
      input: { name: 'Rice', baseUnit: 'g', categoryName: 'Grains', parLevel: 50000, reorderPoint: 10000, shelfLifeDays: 365, barcode: '111' },
      opening: { qtyBase: 25000, valuePaisa: 500050 },
    });
    expect(p.valid[1].opening).toBeUndefined();
  });

  it('finds columns by alias, in any order', () => {
    const p = previewItems(csv('UOM,item\nml,Oil'), none);
    expect(p.valid[0].input).toMatchObject({ name: 'Oil', baseUnit: 'ml' });
  });

  it('reports a missing required column and an empty file', () => {
    expect(previewItems(csv('Name\nRice'), none).fatal).toBe('Missing column: Base unit.');
    expect(previewItems([], none).fatal).toBe('The file is empty.');
    expect(previewItems(csv('Name,Base unit'), none).fatal).toBe('The file has a header but no rows.');
  });

  it('gives a line-numbered message for each bad row and keeps the good ones', () => {
    const p = previewItems(
      csv(
        [
          'Name,Base unit,Par level,Shelf life days,Opening quantity,Opening value Rs,Barcode',
          'Good,g,5,3,,,',
          ',g,,,,,',
          'BadUnit,kg,,,,,',
          'BadPar,g,abc,,,,',
          'BadShelf,g,,0,,,',
          'Half,g,,,10,,',
          'Dup,g,,,,,',
          'dup,g,,,,,',
          'Known,g,,,,,',
          'B1,g,,,,,555',
          'B2,g,,,,,555',
        ].join('\n'),
      ),
      { names: new Set(['known']), barcodes: new Set<string>() },
    );
    expect(p.valid.map(v => v.input.name)).toEqual(['Good', 'Dup', 'B1']);
    expect(p.errors).toEqual([
      { line: 3, message: 'Name is empty.' },
      { line: 4, message: 'Base unit must be g, ml or pcs (found "kg").' },
      { line: 5, message: 'Par level must be a number like 2 or 1.5 (found "abc").' },
      { line: 6, message: 'Shelf life must be a whole number of days (found "0").' },
      { line: 7, message: 'Opening stock needs both a quantity above 0 and a value in rupees (0 if unknown).' },
      { line: 9, message: '"dup" appears twice in this file.' },
      { line: 10, message: '"Known" already exists in the app.' },
      { line: 12, message: 'Barcode 555 is already used.' },
    ]);
  });

  it('checks barcodes against what the app already has', () => {
    const p = previewItems(csv('Name,Base unit,Barcode\nA,g,999'), { names: new Set(), barcodes: new Set(['999']) });
    expect(p.errors[0].message).toBe('Barcode 999 is already used.');
  });

  it('its own template imports cleanly', () => {
    const p = previewItems(parseCsv(TEMPLATES.items), none);
    expect(p.errors).toEqual([]);
    expect(p.valid).toHaveLength(2);
  });
});

describe('previewSuppliers', () => {
  it('accepts valid rows and flags duplicates and bad amounts', () => {
    const p = previewSuppliers(
      csv('Name,Phone,Opening balance Rs\nAl-Noor,0300,"1,500"\nCity,,\nal-noor,,\nOld,,\nBad,,12abc'),
      new Set(['old']),
    );
    expect(p.valid).toEqual([
      { name: 'Al-Noor', phone: '0300', openingBalancePaisa: 150000 },
      { name: 'City', phone: undefined, openingBalancePaisa: 0 },
    ]);
    expect(p.errors.map(e => e.line)).toEqual([4, 5, 6]);
    expect(p.errors[2].message).toContain('Opening balance must be an amount');
  });

  it('its own template imports cleanly', () => {
    expect(previewSuppliers(parseCsv(TEMPLATES.suppliers), new Set()).errors).toEqual([]);
  });
});

describe('previewRecipes', () => {
  const ids = new Map([['rice', 1], ['oil', 2]]);

  it('groups rows into one recipe per dish', () => {
    const p = previewRecipes(csv('Dish,Price Rs,Ingredient,Quantity per portion\nPulao,350,Rice,200\nPulao,350,Oil,15\nDal,120,Rice,80'), ids, new Set());
    expect(p.errors).toEqual([]);
    expect(p.valid).toEqual([
      { name: 'Pulao', sellPricePaisa: 35000, lines: [{ itemId: 1, qtyBase: 200 }, { itemId: 2, qtyBase: 15 }] },
      { name: 'Dal', sellPricePaisa: 12000, lines: [{ itemId: 1, qtyBase: 80 }] },
    ]);
  });

  it('leaves a dish out entirely if any of its rows is bad', () => {
    const p = previewRecipes(
      csv('Dish,Price Rs,Ingredient,Quantity per portion\nPulao,350,Rice,200\nPulao,350,Ghost,15\nDal,120,Rice,80'),
      ids,
      new Set(),
    );
    expect(p.valid.map(v => v.name)).toEqual(['Dal']);
    expect(p.errors).toEqual([{ line: 3, message: 'Ingredient "Ghost" is not in your items. Add it first.' }]);
  });

  it('rejects conflicting prices, repeated ingredients, bad numbers and existing dishes', () => {
    const p = previewRecipes(
      csv(
        [
          'Dish,Price Rs,Ingredient,Quantity per portion',
          'A,100,Rice,1',
          'A,200,Oil,1',
          'B,100,Rice,1',
          'B,100,rice,2',
          'C,x,Rice,1',
          'D,100,Rice,0',
          'Old,100,Rice,1',
        ].join('\n'),
      ),
      ids,
      new Set(['old']),
    );
    expect(p.errors.map(e => e.line)).toEqual([3, 5, 6, 7, 8]);
    expect(p.valid).toEqual([]);
  });

  it('its own template imports cleanly once the items exist', () => {
    const t = new Map([['basmati rice', 1], ['cooking oil', 2]]);
    const p = previewRecipes(parseCsv(TEMPLATES.recipes), t, new Set());
    expect(p.errors).toEqual([]);
    expect(p.valid).toHaveLength(1);
  });
});
