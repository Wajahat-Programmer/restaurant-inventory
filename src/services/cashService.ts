import { and, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { cashBalance } from '../domain/finance';
import { assertPaisa, Paisa } from '../domain/money';
import { dateSchema } from '../domain/schemas';
import { audit } from './auditService';
import { ValidationError } from './errors';
import { requirePermission } from './session';

const { cashEntries } = schema;

export interface CashEntryInput {
  date: string;
  direction: 'IN' | 'OUT';
  amountPaisa: Paisa;
  source: 'sale' | 'expense' | 'purchase' | 'supplier_payment' | 'manual';
  refId?: number;
  method?: 'cash' | 'bank' | 'other';
  isReversal?: boolean;
  note?: string;
}

/**
 * The only way money is recorded. Runs inside the caller's transaction so a
 * sale, purchase or expense and its cash entry commit or fail together.
 * Zero amounts are skipped: nothing moved.
 */
export async function postCash(tx: Queryable, e: CashEntryInput): Promise<void> {
  assertPaisa(e.amountPaisa);
  if (e.amountPaisa < 0) {
    throw new ValidationError('Amount cannot be negative');
  }
  if (e.amountPaisa === 0) {
    return;
  }
  await tx.insert(cashEntries).values({
    date: e.date,
    direction: e.direction,
    amountPaisa: e.amountPaisa,
    source: e.source,
    refId: e.refId ?? null,
    method: e.method ?? 'cash',
    isReversal: e.isReversal ?? false,
    note: e.note?.trim() || null,
  });
}

/** Writes the opposite entries for everything recorded against a source row. */
export async function reverseCash(
  tx: Queryable,
  source: CashEntryInput['source'],
  refId: number,
  date: string,
  note: string,
): Promise<void> {
  const rows = await tx
    .select()
    .from(cashEntries)
    .where(and(eq(cashEntries.source, source), eq(cashEntries.refId, refId), eq(cashEntries.isReversal, false)));
  for (const r of rows) {
    await postCash(tx, {
      date,
      direction: r.direction === 'IN' ? 'OUT' : 'IN',
      amountPaisa: r.amountPaisa,
      source,
      refId,
      method: r.method,
      isReversal: true,
      note,
    });
  }
}

/** A manual deposit or withdrawal, e.g. the owner putting money in the till. */
export async function addManualCash(
  db: Db,
  input: { date: string; direction: 'IN' | 'OUT'; amountPaisa: Paisa; note: string },
): Promise<void> {
  requirePermission('finance');
  const d = dateSchema.safeParse(input.date);
  if (!d.success) {
    throw new ValidationError(d.error.issues[0].message);
  }
  if (!input.note.trim()) {
    throw new ValidationError('A note is required for a manual cash entry');
  }
  if (!Number.isInteger(input.amountPaisa) || input.amountPaisa <= 0) {
    throw new ValidationError('Amount must be more than 0');
  }
  await inTransaction(db, async tx => {
    await postCash(tx, { ...input, source: 'manual' });
    await audit(tx, 'cash.manual', 'cash', null, { direction: input.direction, amount: input.amountPaisa });
  });
}

export interface CashBook {
  openingPaisa: Paisa;
  entries: (typeof cashEntries.$inferSelect)[];
  totalInPaisa: Paisa;
  totalOutPaisa: Paisa;
  closingPaisa: Paisa;
}

/** Entries between two dates (inclusive), with the balance before and after. */
export async function getCashBook(db: Queryable, from: string, to: string): Promise<CashBook> {
  requirePermission('finance');
  const before = await db
    .select({ direction: cashEntries.direction, amountPaisa: sql<number>`sum(${cashEntries.amountPaisa})` })
    .from(cashEntries)
    .where(lt(cashEntries.date, from))
    .groupBy(cashEntries.direction);
  const entries = await db
    .select()
    .from(cashEntries)
    .where(and(gte(cashEntries.date, from), lte(cashEntries.date, to)))
    .orderBy(desc(cashEntries.date), desc(cashEntries.id));

  const openingPaisa = cashBalance(before);
  const totalInPaisa = entries.filter(e => e.direction === 'IN').reduce((a, e) => a + e.amountPaisa, 0);
  const totalOutPaisa = entries.filter(e => e.direction === 'OUT').reduce((a, e) => a + e.amountPaisa, 0);
  return {
    openingPaisa,
    entries,
    totalInPaisa,
    totalOutPaisa,
    closingPaisa: openingPaisa + totalInPaisa - totalOutPaisa,
  };
}

/** Balance of everything ever recorded. */
export async function getCashBalance(db: Queryable): Promise<Paisa> {
  requirePermission('finance');
  const rows = await db
    .select({ direction: cashEntries.direction, amountPaisa: sql<number>`sum(${cashEntries.amountPaisa})` })
    .from(cashEntries)
    .groupBy(cashEntries.direction);
  return cashBalance(rows);
}
