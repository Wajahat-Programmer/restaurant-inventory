import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { aggregateNeeds } from '../domain/recipes';
import { dateSchema } from '../domain/schemas';
import { formatQty } from '../domain/units';
import { audit } from './auditService';
import { postCash, reverseCash } from './cashService';
import { must, ValidationError } from './errors';
import { getLevel, postMovement, reverseMovement } from './ledgerService';
import { requirePermission } from './session';

const { sales, recipes, recipeLines, items } = schema;

export interface SaleLineInput {
  recipeId: number;
  /** Portions sold. */
  qty: number;
}

export interface SalesInput {
  date: string;
  lines: SaleLineInput[];
}

/**
 * Daily sales entry (dish x portions). Each line takes its ingredients out of
 * stock at the current average cost (a SALE movement per ingredient) and
 * records the revenue in the cash book. All lines commit together, or none.
 */
export async function postSales(db: Db, input: SalesInput): Promise<number[]> {
  const d = dateSchema.safeParse(input.date);
  if (!d.success) {
    throw new ValidationError(d.error.issues[0].message);
  }
  if (!input.lines.length) {
    throw new ValidationError('Add at least one dish');
  }
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 100000) {
      throw new ValidationError('Portions must be a whole number of 1 or more');
    }
  }

  return inTransaction(db, async tx => {
    const loaded = [];
    for (const l of input.lines) {
      const [r] = await tx.select().from(recipes).where(eq(recipes.id, l.recipeId));
      must(r, 'Dish not found');
      if (!r.isActive) {
        throw new ValidationError(`${r.name} is not on the menu any more`);
      }
      const ingredients = await tx
        .select({ itemId: recipeLines.itemId, qtyBase: recipeLines.qtyBase })
        .from(recipeLines)
        .where(eq(recipeLines.recipeId, r.id));
      loaded.push({ recipe: r, ingredients, qty: l.qty });
    }

    // Check the whole sale first so the message names every short ingredient.
    const needs = aggregateNeeds(loaded.map(x => ({ ingredients: x.ingredients, portions: x.qty })));
    const short: string[] = [];
    for (const [itemId, need] of needs) {
      const have = (await getLevel(tx, itemId)).qtyBase;
      if (have < need) {
        const [it] = await tx.select({ name: items.name, unit: items.baseUnit }).from(items).where(eq(items.id, itemId));
        short.push(`${it.name} (need ${formatQty(need, it.unit)}, have ${formatQty(have, it.unit)})`);
      }
    }
    if (short.length) {
      throw new ValidationError(
        `Not enough stock: ${short.join(', ')}. Record a purchase or adjustment first.`,
      );
    }

    const ids: number[] = [];
    for (const x of loaded) {
      const [sale] = await tx
        .insert(sales)
        .values({
          date: input.date,
          recipeId: x.recipe.id,
          qty: x.qty,
          pricePaisa: x.recipe.sellPricePaisa,
        })
        .returning({ id: sales.id });

      let cogs = 0;
      for (const ing of x.ingredients) {
        const m = await postMovement(
          tx,
          {
            itemId: ing.itemId,
            type: 'SALE',
            qtyBase: -Math.round(ing.qtyBase * x.qty * 1000) / 1000,
            reason: `Sale: ${x.recipe.name} x${x.qty}`,
          },
          { refType: 'sale', refId: sale.id },
        );
        cogs += -m.valuePaisa;
      }
      await tx.update(sales).set({ cogsPaisa: cogs }).where(eq(sales.id, sale.id));
      await postCash(tx, {
        date: input.date,
        direction: 'IN',
        amountPaisa: x.recipe.sellPricePaisa * x.qty,
        source: 'sale',
        refId: sale.id,
      });
      ids.push(sale.id);
    }
    return ids;
  });
}

/** Puts the ingredients back and reverses the revenue, dated the day it is voided. */
export async function voidSale(db: Db, saleId: number, date: string): Promise<void> {
  requirePermission('void');
  const d = dateSchema.safeParse(date);
  if (!d.success) {
    throw new ValidationError(d.error.issues[0].message);
  }
  await inTransaction(db, async tx => {
    const [s] = await tx.select().from(sales).where(eq(sales.id, saleId));
    must(s, 'Sale not found');
    if (s.status === 'VOID') {
      throw new ValidationError('This sale is already void');
    }
    const movs = await tx
      .select({ id: schema.stockMovements.id })
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refType, 'sale'),
          eq(schema.stockMovements.refId, saleId),
          eq(schema.stockMovements.isReversal, false),
        ),
      );
    for (const m of movs) {
      await reverseMovement(tx, m.id, { refType: 'sale', refId: saleId });
    }
    await reverseCash(tx, 'sale', saleId, date, 'Sale voided');
    await audit(tx, 'sale.void', 'sale', saleId, { revenue: s.qty * s.pricePaisa });
    await tx.update(sales).set({ status: 'VOID' }).where(eq(sales.id, saleId));
  });
}

export interface SaleRow {
  id: number;
  date: string;
  recipeId: number;
  dish: string;
  qty: number;
  pricePaisa: number;
  revenuePaisa: number;
  cogsPaisa: number;
  status: 'POSTED' | 'VOID';
}

export async function listSales(q: Queryable, from: string, to: string): Promise<SaleRow[]> {
  const rows = await q
    .select({
      id: sales.id,
      date: sales.date,
      recipeId: sales.recipeId,
      dish: recipes.name,
      qty: sales.qty,
      pricePaisa: sales.pricePaisa,
      cogsPaisa: sales.cogsPaisa,
      status: sales.status,
    })
    .from(sales)
    .innerJoin(recipes, eq(recipes.id, sales.recipeId))
    .where(and(gte(sales.date, from), lte(sales.date, to)))
    .orderBy(desc(sales.date), desc(sales.id));
  return rows.map(r => ({ ...r, revenuePaisa: r.qty * r.pricePaisa }));
}
