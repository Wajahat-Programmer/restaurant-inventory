import { parseRupees } from '../../domain/money';
import { isValidDate } from '../../domain/periods';
import { EXPENSE_CATEGORIES, ExpenseInput, PAY_METHODS } from '../../domain/schemas';

export interface ExpenseForm {
  date: string;
  category: (typeof EXPENSE_CATEGORIES)[number] | null;
  /** Rupees, typed. */
  amount: string;
  method: (typeof PAY_METHODS)[number];
  note: string;
}

export type BuiltExpense = { ok: true; input: ExpenseInput } | { ok: false; error: string };

export function buildExpense(f: ExpenseForm): BuiltExpense {
  if (!isValidDate(f.date)) {
    return { ok: false, error: 'Date must be a real date like 2026-10-25' };
  }
  if (!f.category) {
    return { ok: false, error: 'Choose what the expense is for' };
  }
  const amount = parseRupees(f.amount);
  if (amount === null || amount === 0) {
    return { ok: false, error: 'Amount must be more than 0, like 500 or 99.50' };
  }
  return {
    ok: true,
    input: { date: f.date, category: f.category, amountPaisa: amount, method: f.method, note: f.note },
  };
}
