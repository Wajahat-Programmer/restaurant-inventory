import { ColumnMapping, ColumnSpec, mapColumns, toCsv } from '../../domain/csv';
import { parseRupees } from '../../domain/money';
import { ItemInput, itemInputSchema } from '../../domain/schemas';
import { parseQty } from '../../domain/units';

export interface RowError {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  message: string;
}

export interface Preview<T> {
  mapping: ColumnMapping;
  valid: T[];
  errors: RowError[];
  /** Set when the header row cannot be used at all. */
  fatal: string | null;
}

function cellReader(row: string[], mapping: ColumnMapping) {
  return (key: string) => (mapping.index[key] === undefined ? '' : (row[mapping.index[key]] ?? '').trim());
}

/** Common start: header mapping and the missing-columns message. */
function begin(rows: string[][], spec: ColumnSpec[]) {
  if (rows.length === 0) {
    return { mapping: { index: {}, missing: [], unused: [] }, body: [] as string[][], fatal: 'The file is empty.' };
  }
  const mapping = mapColumns(rows[0], spec);
  const fatal = mapping.missing.length
    ? `Missing column${mapping.missing.length > 1 ? 's' : ''}: ${mapping.missing.map(c => c.label).join(', ')}.`
    : rows.length === 1
    ? 'The file has a header but no rows.'
    : null;
  return { mapping, body: rows.slice(1), fatal };
}

const lower = (s: string) => s.trim().toLowerCase();

/* ------------------------------ items ------------------------------ */

export const ITEM_COLUMNS: ColumnSpec[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['item', 'item name'] },
  { key: 'baseUnit', label: 'Base unit', required: true, aliases: ['unit', 'uom'] },
  { key: 'category', label: 'Category', required: false },
  { key: 'parLevel', label: 'Par level', required: false },
  { key: 'reorderPoint', label: 'Reorder point', required: false },
  { key: 'shelfLifeDays', label: 'Shelf life days', required: false, aliases: ['shelf life'] },
  { key: 'barcode', label: 'Barcode', required: false },
  { key: 'openingQty', label: 'Opening quantity', required: false, aliases: ['opening qty'] },
  { key: 'openingValue', label: 'Opening value Rs', required: false, aliases: ['opening value', 'opening cost'] },
];

export interface ParsedItem {
  input: ItemInput;
  opening?: { qtyBase: number; valuePaisa: number };
}

export function previewItems(
  rows: string[][],
  existing: { names: Set<string>; barcodes: Set<string> },
): Preview<ParsedItem> {
  const { mapping, body, fatal } = begin(rows, ITEM_COLUMNS);
  const out: Preview<ParsedItem> = { mapping, valid: [], errors: [], fatal };
  if (fatal) {
    return out;
  }
  const names = new Set<string>();
  const barcodes = new Set<string>();
  body.forEach((row, i) => {
    const line = i + 2;
    const get = cellReader(row, mapping);
    const fail = (message: string) => out.errors.push({ line, message });

    const name = get('name');
    const unit = lower(get('baseUnit'));
    if (!name) {
      return fail('Name is empty.');
    }
    if (!['g', 'ml', 'pcs'].includes(unit)) {
      return fail(`Base unit must be g, ml or pcs (found "${get('baseUnit')}").`);
    }
    if (names.has(lower(name))) {
      return fail(`"${name}" appears twice in this file.`);
    }
    if (existing.names.has(lower(name))) {
      return fail(`"${name}" already exists in the app.`);
    }

    const numberCell = (key: string, label: string): number | undefined | null => {
      const t = get(key);
      if (t === '') {
        return undefined;
      }
      const n = parseQty(t, { allowZero: true });
      if (n === null) {
        fail(`${label} must be a number like 2 or 1.5 (found "${t}").`);
        return null;
      }
      return n;
    };
    const par = numberCell('parLevel', 'Par level');
    const reorder = numberCell('reorderPoint', 'Reorder point');
    if (par === null || reorder === null) {
      return;
    }
    const shelfText = get('shelfLifeDays');
    if (shelfText !== '' && !/^[1-9]\d{0,4}$/.test(shelfText)) {
      return fail(`Shelf life must be a whole number of days (found "${shelfText}").`);
    }
    const barcode = get('barcode');
    if (barcode && (barcodes.has(barcode) || existing.barcodes.has(barcode))) {
      return fail(`Barcode ${barcode} is already used.`);
    }

    const qtyText = get('openingQty');
    const valueText = get('openingValue');
    let opening: ParsedItem['opening'];
    if (qtyText !== '' || valueText !== '') {
      const qty = qtyText === '' ? null : parseQty(qtyText);
      const value = valueText === '' ? null : parseRupees(valueText);
      if (qty === null || value === null) {
        return fail('Opening stock needs both a quantity above 0 and a value in rupees (0 if unknown).');
      }
      opening = { qtyBase: qty, valuePaisa: value };
    }

    const input: ItemInput = {
      name,
      baseUnit: unit as 'g' | 'ml' | 'pcs',
      categoryName: get('category') || undefined,
      parLevel: par ?? 0,
      reorderPoint: reorder ?? 0,
      shelfLifeDays: shelfText ? Number(shelfText) : undefined,
      barcode: barcode || undefined,
    };
    const check = itemInputSchema.safeParse(input);
    if (!check.success) {
      return fail(check.error.issues[0].message + '.');
    }
    names.add(lower(name));
    if (barcode) {
      barcodes.add(barcode);
    }
    out.valid.push({ input, opening });
  });
  return out;
}

/* ---------------------------- suppliers ---------------------------- */

export const SUPPLIER_COLUMNS: ColumnSpec[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['supplier'] },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'openingBalance', label: 'Opening balance Rs', required: false, aliases: ['opening balance', 'owed'] },
];

export interface ParsedSupplier {
  name: string;
  phone?: string;
  openingBalancePaisa: number;
}

export function previewSuppliers(rows: string[][], existingNames: Set<string>): Preview<ParsedSupplier> {
  const { mapping, body, fatal } = begin(rows, SUPPLIER_COLUMNS);
  const out: Preview<ParsedSupplier> = { mapping, valid: [], errors: [], fatal };
  if (fatal) {
    return out;
  }
  const seen = new Set<string>();
  body.forEach((row, i) => {
    const line = i + 2;
    const get = cellReader(row, mapping);
    const fail = (message: string) => out.errors.push({ line, message });
    const name = get('name');
    if (!name) {
      return fail('Name is empty.');
    }
    if (seen.has(lower(name))) {
      return fail(`"${name}" appears twice in this file.`);
    }
    if (existingNames.has(lower(name))) {
      return fail(`"${name}" already exists in the app.`);
    }
    const balanceText = get('openingBalance');
    const balance = balanceText === '' ? 0 : parseRupees(balanceText);
    if (balance === null) {
      return fail(`Opening balance must be an amount like 5000 or 99.50 (found "${balanceText}").`);
    }
    seen.add(lower(name));
    out.valid.push({ name, phone: get('phone') || undefined, openingBalancePaisa: balance });
  });
  return out;
}

/* ----------------------------- recipes ----------------------------- */

export const RECIPE_COLUMNS: ColumnSpec[] = [
  { key: 'dish', label: 'Dish', required: true, aliases: ['recipe', 'name'] },
  { key: 'price', label: 'Price Rs', required: true, aliases: ['selling price', 'sell price'] },
  { key: 'ingredient', label: 'Ingredient', required: true, aliases: ['item'] },
  { key: 'qty', label: 'Quantity per portion', required: true, aliases: ['qty', 'quantity', 'amount'] },
];

export interface ParsedRecipe {
  name: string;
  sellPricePaisa: number;
  lines: { itemId: number; qtyBase: number }[];
}

/** One ingredient per row; rows with the same dish name make one recipe. */
export function previewRecipes(
  rows: string[][],
  itemIds: Map<string, number>,
  existingDishes: Set<string>,
): Preview<ParsedRecipe> {
  const { mapping, body, fatal } = begin(rows, RECIPE_COLUMNS);
  const out: Preview<ParsedRecipe> = { mapping, valid: [], errors: [], fatal };
  if (fatal) {
    return out;
  }
  const byDish = new Map<string, ParsedRecipe & { firstLine: number; bad: boolean }>();
  body.forEach((row, i) => {
    const line = i + 2;
    const get = cellReader(row, mapping);
    const fail = (message: string) => out.errors.push({ line, message });
    const dish = get('dish');
    if (!dish) {
      return fail('Dish name is empty.');
    }
    if (existingDishes.has(lower(dish))) {
      return fail(`"${dish}" already exists in the app.`);
    }
    const price = parseRupees(get('price'));
    if (price === null) {
      return fail(`Price must be an amount like 350 or 99.50 (found "${get('price')}").`);
    }
    const itemId = itemIds.get(lower(get('ingredient')));
    if (itemId === undefined) {
      return fail(`Ingredient "${get('ingredient')}" is not in your items. Add it first.`);
    }
    const qty = parseQty(get('qty'));
    if (qty === null) {
      return fail(`Quantity must be a number above 0 (found "${get('qty')}").`);
    }
    const key = lower(dish);
    const cur = byDish.get(key) ?? { name: dish, sellPricePaisa: price, lines: [], firstLine: line, bad: false };
    if (cur.sellPricePaisa !== price) {
      return fail(`"${dish}" has two different prices (line ${cur.firstLine} and this one).`);
    }
    if (cur.lines.some(l => l.itemId === itemId)) {
      return fail(`"${get('ingredient')}" is listed twice for "${dish}".`);
    }
    cur.lines.push({ itemId, qtyBase: qty });
    byDish.set(key, cur);
  });
  // A dish with any bad row is left out entirely, so a half recipe is never imported.
  const badDishes = new Set(
    out.errors
      .map(e => lower((body[e.line - 2]?.[mapping.index.dish] ?? '').trim()))
      .filter(Boolean),
  );
  for (const [key, r] of byDish) {
    if (!badDishes.has(key)) {
      out.valid.push({ name: r.name, sellPricePaisa: r.sellPricePaisa, lines: r.lines });
    }
  }
  return out;
}

/* ---------------------------- templates ---------------------------- */

export const TEMPLATES = {
  items: toCsv(
    [
      ITEM_COLUMNS.map(c => c.label),
      ['Basmati rice', 'g', 'Grains', 50000, 10000, 365, '', 25000, '5000'],
      ['Cooking oil', 'ml', 'Oils', 20000, 5000, 180, '', '', ''],
    ],
    { bom: true },
  ),
  suppliers: toCsv([SUPPLIER_COLUMNS.map(c => c.label), ['Al-Noor Traders', '0300-1234567', '0']], { bom: true }),
  recipes: toCsv(
    [
      RECIPE_COLUMNS.map(c => c.label),
      ['Pulao', '350', 'Basmati rice', 200],
      ['Pulao', '350', 'Cooking oil', 15],
    ],
    { bom: true },
  ),
};
