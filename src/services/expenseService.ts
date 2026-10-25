import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { dateSchema, ExpenseInput, expenseInputSchema } from '../domain/schemas';
import { audit } from './auditService';
import { postCash, reverseCash } from './cashService';
import { must, ValidationError } from './errors';
import { requirePermission } from './session';

const { expenses } = schema;

/** Rent, salaries, gas and the rest. Recorded in the cash book as money out. */
export async function addExpense(db: Db, input: ExpenseInput): Promise<number> {
  requirePermission('finance');
  const r = expenseInputSchema.safeParse(input);
  if (!r.success) {
    throw new ValidationError(r.error.issues[0].message);
  }
  const e = r.data;
  return inTransaction(db, async tx => {
    const [row] = await tx
      .insert(expenses)
      .values({
        date: e.date,
        category: e.category,
        amountPaisa: e.amountPaisa,
        method: e.method,
        note: e.note ?? null,
      })
      .returning({ id: expenses.id });
    await postCash(tx, {
      date: e.date,
      direction: 'OUT',
      amountPaisa: e.amountPaisa,
      source: 'expense',
      refId: row.id,
      method: e.method,
      note: e.note,
    });
    await audit(tx, 'expense.add', 'expense', row.id, { category: e.category, amount: e.amountPaisa });
    return row.id;
  });
}

/** Voiding keeps the record and adds an opposite cash entry dated the day it is voided. */
export async function voidExpense(db: Db, id: number, date: string): Promise<void> {
  requirePermission('void');
  const d = dateSchema.safeParse(date);
  if (!d.success) {
    throw new ValidationError(d.error.issues[0].message);
  }
  await inTransaction(db, async tx => {
    const [e] = await tx.select().from(expenses).where(eq(expenses.id, id));
    must(e, 'Expense not found');
    if (e.status === 'VOID') {
      throw new ValidationError('This expense is already void');
    }
    await reverseCash(tx, 'expense', id, date, 'Expense voided');
    await audit(tx, 'expense.void', 'expense', id, { amount: e.amountPaisa });
    await tx.update(expenses).set({ status: 'VOID' }).where(eq(expenses.id, id));
  });
}

export async function listExpenses(q: Queryable, from: string, to: string) {
  requirePermission('finance');
  return q
    .select()
    .from(expenses)
    .where(and(gte(expenses.date, from), lte(expenses.date, to)))
    .orderBy(desc(expenses.date), desc(expenses.id));
}
