import { Db, inTransaction, Queryable, schema } from '../db/client';
import { ParsedItem, ParsedRecipe, ParsedSupplier } from '../features/importExport/csvImport';
import { audit } from './auditService';
import { friendly } from './errors';
import { createItemTx } from './itemService';
import { createRecipeTx } from './recipeService';
import { requirePermission } from './session';

const { items, suppliers, recipes } = schema;

const lower = (s: string) => s.trim().toLowerCase();

/** What already exists, so a preview can point out duplicates before anything is written. */
export async function existingNames(q: Queryable) {
  const it = await q.select({ id: items.id, name: items.name, barcode: items.barcode }).from(items);
  const su = await q.select({ name: suppliers.name }).from(suppliers);
  const re = await q.select({ name: recipes.name }).from(recipes);
  return {
    items: new Set(it.map(i => lower(i.name))),
    barcodes: new Set(it.map(i => i.barcode).filter((b): b is string => !!b)),
    suppliers: new Set(su.map(s => lower(s.name))),
    recipes: new Set(re.map(r => lower(r.name))),
    itemIds: new Map(it.map(i => [lower(i.name), i.id])),
  };
}

/** Everything is added or nothing is: one bad row rolls the whole file back. */
export async function importItems(db: Db, rows: ParsedItem[]): Promise<number> {
  requirePermission('manage');
  try {
    return await inTransaction(db, async tx => {
      for (const r of rows) {
        await createItemTx(tx, r.input, r.opening);
      }
      await audit(tx, 'import.items', 'item', null, { count: rows.length });
      return rows.length;
    });
  } catch (e) {
    return friendly(e, 'One of these items');
  }
}

export async function importSuppliers(db: Db, rows: ParsedSupplier[]): Promise<number> {
  requirePermission('manage');
  try {
    return await inTransaction(db, async tx => {
      for (const r of rows) {
        await tx.insert(suppliers).values({
          name: r.name,
          phone: r.phone ?? null,
          openingBalancePaisa: r.openingBalancePaisa,
        });
      }
      await audit(tx, 'import.suppliers', 'supplier', null, { count: rows.length });
      return rows.length;
    });
  } catch (e) {
    return friendly(e, 'One of these suppliers');
  }
}

export async function importRecipes(db: Db, rows: ParsedRecipe[]): Promise<number> {
  requirePermission('manage');
  try {
    return await inTransaction(db, async tx => {
      for (const r of rows) {
        await createRecipeTx(tx, { name: r.name, sellPricePaisa: r.sellPricePaisa, lines: r.lines });
      }
      await audit(tx, 'import.recipes', 'recipe', null, { count: rows.length });
      return rows.length;
    });
  } catch (e) {
    return friendly(e, 'One of these dishes');
  }
}
