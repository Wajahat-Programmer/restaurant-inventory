import { desc, eq } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema, Tx } from '../db/client';
import { dishCost, dishMargin } from '../domain/recipes';
import { RecipeInput, recipeInputSchema } from '../domain/schemas';
import { BaseUnit } from '../domain/units';
import { audit } from './auditService';
import { friendly, must, ValidationError } from './errors';
import { requirePermission } from './session';

const { recipes, recipeLines, items, stockLevels, itemPrices } = schema;

export interface RecipeRow {
  id: number;
  name: string;
  sellPricePaisa: number;
  isActive: boolean;
  costPaisa: number;
  /** False when an ingredient has no stock and no purchase price yet. */
  costKnown: boolean;
  marginPaisa: number;
  marginPct: number | null;
  lines: { itemId: number; itemName: string; baseUnit: BaseUnit; qtyBase: number }[];
}

function parse(input: RecipeInput) {
  const r = recipeInputSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0].message);
  }
  return r.data;
}

async function assertItemsExist(tx: Queryable, ids: number[]): Promise<void> {
  for (const id of ids) {
    must((await tx.select({ id: items.id }).from(items).where(eq(items.id, id)))[0], 'An ingredient no longer exists');
  }
}

/** Creates a dish inside the caller's transaction (used by imports). */
export async function createRecipeTx(tx: Tx, input: RecipeInput): Promise<number> {
  const data = parse(input);
  await assertItemsExist(tx, data.lines.map(l => l.itemId));
  const [r] = await tx
    .insert(recipes)
    .values({ name: data.name, sellPricePaisa: data.sellPricePaisa })
    .returning({ id: recipes.id });
  await tx.insert(recipeLines).values(data.lines.map(l => ({ recipeId: r.id, ...l })));
  return r.id;
}

export async function createRecipe(db: Db, input: RecipeInput): Promise<number> {
  requirePermission('recipes');
  try {
    return await inTransaction(db, tx => createRecipeTx(tx, input));
  } catch (e) {
    return friendly(e, 'A dish with this name');
  }
}

/** Replaces the dish and its ingredients. Past sales keep the price and cost they were made at. */
export async function updateRecipe(db: Db, id: number, input: RecipeInput): Promise<void> {
  requirePermission('recipes');
  const data = parse(input);
  try {
    await inTransaction(db, async tx => {
      await assertItemsExist(tx, data.lines.map(l => l.itemId));
      const res = await tx
        .update(recipes)
        .set({ name: data.name, sellPricePaisa: data.sellPricePaisa })
        .where(eq(recipes.id, id))
        .returning({ id: recipes.id });
      must(res[0], 'Dish not found');
      await tx.delete(recipeLines).where(eq(recipeLines.recipeId, id));
      await tx.insert(recipeLines).values(data.lines.map(l => ({ recipeId: id, ...l })));
      await audit(tx, 'recipe.update', 'recipe', id, { name: data.name, price: data.sellPricePaisa });
    });
  } catch (e) {
    friendly(e, 'A dish with this name');
  }
}

export async function setRecipeActive(db: Db, id: number, isActive: boolean): Promise<void> {
  requirePermission('recipes');
  await db.update(recipes).set({ isActive }).where(eq(recipes.id, id));
}

/**
 * Cost per base unit: the stock's weighted average, or if there is none on the
 * shelf the newest purchase price from a purchase that was not voided.
 */
export async function ingredientCosts(q: Queryable): Promise<Map<number, number>> {
  const levels = await q.select().from(stockLevels);
  const map = new Map<number, number>();
  for (const l of levels) {
    if (l.qtyBase > 0) {
      map.set(l.itemId, l.valuePaisa / l.qtyBase);
    }
  }
  const prices = await q
    .select({
      itemId: itemPrices.itemId,
      price: itemPrices.pricePerBase,
      status: schema.purchases.status,
    })
    .from(itemPrices)
    .leftJoin(schema.purchases, eq(schema.purchases.id, itemPrices.purchaseId))
    .orderBy(desc(itemPrices.effectiveDate), desc(itemPrices.id));
  for (const p of prices) {
    if (!map.has(p.itemId) && p.status !== 'VOID') {
      map.set(p.itemId, p.price);
    }
  }
  return map;
}

export async function listRecipes(
  q: Queryable,
  opts: { includeInactive?: boolean } = {},
): Promise<RecipeRow[]> {
  const rows = await q.select().from(recipes).orderBy(recipes.name);
  const lines = await q
    .select({
      recipeId: recipeLines.recipeId,
      itemId: recipeLines.itemId,
      itemName: items.name,
      baseUnit: items.baseUnit,
      qtyBase: recipeLines.qtyBase,
    })
    .from(recipeLines)
    .innerJoin(items, eq(items.id, recipeLines.itemId))
    .orderBy(items.name);
  const costs = await ingredientCosts(q);

  return rows
    .filter(r => opts.includeInactive || r.isActive)
    .map(r => {
      const mine = lines.filter(l => l.recipeId === r.id);
      const cost = dishCost(mine.map(l => ({ qtyBase: l.qtyBase, costPerBase: costs.get(l.itemId) ?? null })));
      return {
        id: r.id,
        name: r.name,
        sellPricePaisa: r.sellPricePaisa,
        isActive: r.isActive,
        costPaisa: cost.costPaisa,
        costKnown: cost.known,
        ...dishMargin(r.sellPricePaisa, cost.costPaisa),
        lines: mine.map(({ recipeId: _r, ...l }) => l),
      };
    });
}

export async function getRecipe(q: Queryable, id: number): Promise<RecipeRow> {
  const r = (await listRecipes(q, { includeInactive: true })).find(x => x.id === id);
  return must(r, 'Dish not found');
}
