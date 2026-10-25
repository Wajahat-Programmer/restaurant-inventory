import { buildExpense, ExpenseForm } from './expenseForm';

const form = (over: Partial<ExpenseForm> = {}): ExpenseForm => ({
  date: '2026-10-25',
  category: 'rent',
  amount: '30,000',
  method: 'bank',
  note: 'October',
  ...over,
});
const err = (f: ExpenseForm) => {
  const r = buildExpense(f);
  return r.ok ? null : r.error;
};

describe('buildExpense', () => {
  it('converts rupees to exact paisa', () => {
    expect(buildExpense(form())).toEqual({
      ok: true,
      input: { date: '2026-10-25', category: 'rent', amountPaisa: 3000000, method: 'bank', note: 'October' },
    });
    expect(buildExpense(form({ amount: '19.99' }))).toMatchObject({ ok: true, input: { amountPaisa: 1999 } });
  });

  it('says what is wrong', () => {
    expect(err(form({ date: '2026-02-30' }))).toContain('real date');
    expect(err(form({ category: null }))).toBe('Choose what the expense is for');
    for (const bad of ['', '0', '0.00', '-5', 'abc', '1.234']) {
      expect(err(form({ amount: bad }))).toContain('more than 0');
    }
  });
});
