import { and, desc, eq, sql } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { assertPaisa } from '../domain/money';
import {
  paymentStatus,
  PaymentStatus,
  pricePerBase,
  supplierDue,
} from '../domain/purchasing';
import { dateSchema, SupplierInput, supplierInputSchema } from '../domain/schemas';
import { friendly, must, ValidationError } from './errors';
import { audit } from './auditService';
import { postCash, reverseCash } from './cashService';
import { postMovement, reverseMovement } from './ledgerService';
import { requirePermission } from './session';

const { suppliers, purchases, purchaseLines, supplierPayments, itemPrices } =
  schema;

export interface SupplierRow {
  id: number;
  name: string;
  phone: string | null;
  isActive: boolean;
  duePaisa: number;
}

function parseSupplier(input: SupplierInput) {
  const r = supplierInputSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0].message);
  }
  return r.data;
}

export async function createSupplier(
  db: Db,
  input: SupplierInput,
): Promise<number> {
  const data = parseSupplier(input);
  try {
    const [row] = await db
      .insert(suppliers)
      .values({
        name: data.name,
        phone: data.phone ?? null,
        openingBalancePaisa: data.openingBalancePaisa,
      })
      .returning({ id: suppliers.id });
    return row.id;
  } catch (e) {
    return friendly(e, 'A supplier with this name');
  }
}

export async function updateSupplier(
  db: Db,
  id: number,
  input: Omit<SupplierInput, 'openingBalancePaisa'>,
): Promise<void> {
  const data = parseSupplier(input);
  try {
    await db
      .update(suppliers)
      .set({ name: data.name, phone: data.phone ?? null })
      .where(eq(suppliers.id, id));
  } catch (e) {
    friendly(e, 'A supplier with this name');
  }
}

/** What each supplier is owed: opening balance + posted purchases - all payments. */
async function duesBySupplier(q: Queryable): Promise<Map<number, number>> {
  const sums = await q
    .select({
      supplierId: purchases.supplierId,
      total: sql<number>`sum(${purchases.totalPaisa})`,
      paid: sql<number>`sum(${purchases.paidPaisa})`,
    })
    .from(purchases)
    .where(eq(purchases.status, 'POSTED'))
    .groupBy(purchases.supplierId);
  const pays = await q
    .select({
      supplierId: supplierPayments.supplierId,
      paid: sql<number>`sum(${supplierPayments.amountPaisa})`,
    })
    .from(supplierPayments)
    .groupBy(supplierPayments.supplierId);
  const rows = await q.select().from(suppliers);

  return new Map(
    rows.map(s => [
      s.id,
      supplierDue({
        openingBalancePaisa: s.openingBalancePaisa,
        purchasesTotalPaisa: sums.find(x => x.supplierId === s.id)?.total ?? 0,
        paidPaisa:
          (sums.find(x => x.supplierId === s.id)?.paid ?? 0) +
          (pays.find(x => x.supplierId === s.id)?.paid ?? 0),
      }),
    ]),
  );
}

async function dueFor(q: Queryable, supplierId: number): Promise<number> {
  const due = (await duesBySupplier(q)).get(supplierId);
  return must(due, 'Supplier not found');
}

export async function listSuppliers(db: Queryable): Promise<SupplierRow[]> {
  const [rows, dues] = await Promise.all([
    db.select().from(suppliers).orderBy(suppliers.name),
    duesBySupplier(db),
  ]);
  return rows.map(s => ({
    id: s.id,
    name: s.name,
    phone: s.phone,
    isActive: s.isActive,
    duePaisa: dues.get(s.id) ?? 0,
  }));
}

export interface PurchaseLineInput {
  itemId: number;
  qtyBase: number;
  totalPaisa: number;
}

export interface PurchaseInput {
  supplierId: number;
  date: string;
  lines: PurchaseLineInput[];
  paidPaisa: number;
  note?: string;
}

/** Stock in: writes the purchase, its lines, IN movements and price history. */
export async function postPurchase(
  db: Db,
  input: PurchaseInput,
): Promise<number> {
  if (!input.lines.length) {
    throw new ValidationError('Add at least one item');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw new ValidationError('Date must be YYYY-MM-DD');
  }
  for (const l of input.lines) {
    if (!(l.qtyBase > 0)) {
      throw new ValidationError('Every line needs a quantity above 0');
    }
    assertPaisa(l.totalPaisa);
    if (l.totalPaisa < 0) {
      throw new ValidationError('Line cost cannot be negative');
    }
  }
  assertPaisa(input.paidPaisa);
  const total = input.lines.reduce((a, l) => a + l.totalPaisa, 0);
  try {
    paymentStatus(total, input.paidPaisa);
  } catch {
    throw new ValidationError('Paid amount must be between 0 and the total');
  }

  return inTransaction(db, async tx => {
    must(
      (await tx.select().from(suppliers).where(eq(suppliers.id, input.supplierId)))[0],
      'Supplier not found',
    );
    const [p] = await tx
      .insert(purchases)
      .values({
        supplierId: input.supplierId,
        date: input.date,
        totalPaisa: total,
        paidPaisa: input.paidPaisa,
        note: input.note?.trim() || null,
      })
      .returning({ id: purchases.id });

    for (const l of input.lines) {
      must(
        (await tx.select({ id: schema.items.id }).from(schema.items).where(eq(schema.items.id, l.itemId)))[0],
        'Item not found',
      );
      await tx.insert(purchaseLines).values({ purchaseId: p.id, ...l });
      await postMovement(
        tx,
        { itemId: l.itemId, type: 'IN', qtyBase: l.qtyBase, valuePaisa: l.totalPaisa },
        { refType: 'purchase', refId: p.id },
      );
      await tx.insert(itemPrices).values({
        itemId: l.itemId,
        supplierId: input.supplierId,
        pricePerBase: pricePerBase(l.totalPaisa, l.qtyBase),
        effectiveDate: input.date,
        purchaseId: p.id,
      });
    }
    await postCash(tx, {
      date: input.date,
      direction: 'OUT',
      amountPaisa: input.paidPaisa,
      source: 'purchase',
      refId: p.id,
    });
    return p.id;
  });
}

/**
 * Voids a purchase with reversing entries. Fails, changing nothing, if any of
 * its stock has already been used.
 */
export async function voidPurchase(
  db: Db,
  purchaseId: number,
  /** The day the void happens; its cash reversal is dated then, not back-dated. */
  date: string,
): Promise<void> {
  requirePermission('void');
  const d = dateSchema.safeParse(date);
  if (!d.success) {
    throw new ValidationError(d.error.issues[0].message);
  }
  await inTransaction(db, async tx => {
    const [p] = await tx.select().from(purchases).where(eq(purchases.id, purchaseId));
    must(p, 'Purchase not found');
    if (p.status === 'VOID') {
      throw new ValidationError('Purchase is already void');
    }
    const movs = await tx
      .select({ id: schema.stockMovements.id })
      .from(schema.stockMovements)
      .where(
        and(
          eq(schema.stockMovements.refType, 'purchase'),
          eq(schema.stockMovements.refId, purchaseId),
          eq(schema.stockMovements.isReversal, false),
        ),
      );
    // Newest first so each reversal sees the level it was applied on.
    for (const m of movs.sort((a, b) => b.id - a.id)) {
      await reverseMovement(tx, m.id, { refType: 'purchase', refId: purchaseId });
    }
    await reverseCash(tx, 'purchase', purchaseId, date, 'Purchase voided');
    await audit(tx, 'purchase.void', 'purchase', purchaseId, { total: p.totalPaisa });
    await tx.update(purchases).set({ status: 'VOID' }).where(eq(purchases.id, purchaseId));
  });
}

export interface PaymentInput {
  supplierId: number;
  purchaseId?: number;
  date: string;
  amountPaisa: number;
  method?: 'cash' | 'bank' | 'other';
}

/** Pays a supplier. Overpaying what is owed is rejected. */
export async function recordPayment(db: Db, input: PaymentInput): Promise<void> {
  requirePermission('finance');
  assertPaisa(input.amountPaisa);
  if (input.amountPaisa <= 0) {
    throw new ValidationError('Payment must be more than 0');
  }
  await inTransaction(db, async tx => {
    const due = await dueFor(tx, input.supplierId);
    if (input.amountPaisa > due) {
      throw new ValidationError('Payment is more than what is owed');
    }
    const [pay] = await tx
      .insert(supplierPayments)
      .values({
        supplierId: input.supplierId,
        purchaseId: input.purchaseId ?? null,
        date: input.date,
        amountPaisa: input.amountPaisa,
        method: input.method ?? 'cash',
      })
      .returning({ id: supplierPayments.id });
    await postCash(tx, {
      date: input.date,
      direction: 'OUT',
      amountPaisa: input.amountPaisa,
      source: 'supplier_payment',
      refId: pay.id,
      method: input.method ?? 'cash',
    });
  });
}

export interface PurchaseRow {
  id: number;
  supplierId: number;
  supplierName: string;
  date: string;
  totalPaisa: number;
  paidPaisa: number;
  status: 'POSTED' | 'VOID';
  payment: PaymentStatus;
  lines: { itemId: number; itemName: string; qtyBase: number; totalPaisa: number }[];
}

export async function listPurchases(
  db: Queryable,
  opts: { supplierId?: number } = {},
): Promise<PurchaseRow[]> {
  const rows = await db
    .select({
      id: purchases.id,
      supplierId: purchases.supplierId,
      supplierName: suppliers.name,
      date: purchases.date,
      totalPaisa: purchases.totalPaisa,
      paidPaisa: purchases.paidPaisa,
      status: purchases.status,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(opts.supplierId ? eq(purchases.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(purchases.date), desc(purchases.id));

  const out: PurchaseRow[] = [];
  for (const r of rows) {
    const lines = await db
      .select({
        itemId: purchaseLines.itemId,
        itemName: schema.items.name,
        qtyBase: purchaseLines.qtyBase,
        totalPaisa: purchaseLines.totalPaisa,
      })
      .from(purchaseLines)
      .innerJoin(schema.items, eq(schema.items.id, purchaseLines.itemId))
      .where(eq(purchaseLines.purchaseId, r.id));
    out.push({ ...r, payment: paymentStatus(r.totalPaisa, r.paidPaisa), lines });
  }
  return out;
}
