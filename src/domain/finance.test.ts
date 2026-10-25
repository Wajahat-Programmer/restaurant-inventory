import { cashBalance, computePnl, formatPct, pct } from './finance';
import { addDays, dayStartMs, isValidDate, periodLabel, periodRange, rangeMs, shiftPeriod } from './periods';
import { aggregateNeeds, dishCost, dishMargin } from './recipes';

describe('periods', () => {
  it('validates real calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2028-02-29')).toBe(true);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-1-1', 'x', '', '2026-00-10']) {
      expect(isValidDate(bad)).toBe(false);
    }
    expect(() => addDays('2026-02-30', 1)).toThrow('Not a valid date');
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('weeks run Monday to Sunday', () => {
    // 2026-10-25 is a Sunday.
    expect(periodRange('week', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodRange('week', '2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodRange('week', '2026-10-26')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('months and days', () => {
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(periodRange('month', '2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(periodRange('day', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-25' });
  });

  it('shifts by one period, clamping months', () => {
    expect(shiftPeriod('day', '2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftPeriod('week', '2026-10-25', 1)).toBe('2026-11-01');
    expect(shiftPeriod('month', '2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftPeriod('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('labels periods for display', () => {
    expect(periodLabel('day', '2026-10-25')).toBe('25 Oct 2026');
    expect(periodLabel('month', '2026-10-25')).toBe('Oct 2026');
    expect(periodLabel('week', '2026-10-25')).toBe('19 Oct 2026 – 25 Oct 2026');
  });

  it('converts an inclusive date range to a half-open ms range', () => {
    const { start, end } = rangeMs('2026-10-25', '2026-10-26');
    expect(start).toBe(dayStartMs('2026-10-25'));
    expect(end).toBe(dayStartMs('2026-10-27'));
    expect(end - start).toBeGreaterThan(47 * 3600 * 1000);
  });
});

describe('profit and loss', () => {
  it('purchases are not expenses: net = gross - wastage - adjustments - expenses', () => {
    const p = computePnl({ revenue: 100000, cogs: 40000, wastage: 5000, adjustments: 1000, expenses: 20000 });
    expect(p.grossProfit).toBe(60000);
    expect(p.netProfit).toBe(34000);
    expect(p.foodCostPct).toBe(40);
    expect(p.wastagePct).toBe(11.1);
  });

  it('a loss is negative, and a stock gain increases profit', () => {
    expect(computePnl({ revenue: 1000, cogs: 800, wastage: 0, adjustments: 0, expenses: 500 }).netProfit).toBe(-300);
    expect(computePnl({ revenue: 0, cogs: 0, wastage: 0, adjustments: -700, expenses: 0 }).netProfit).toBe(700);
  });

  it('percentages are null with nothing to divide by', () => {
    const p = computePnl({ revenue: 0, cogs: 0, wastage: 0, adjustments: 0, expenses: 0 });
    expect(p.foodCostPct).toBeNull();
    expect(p.wastagePct).toBeNull();
    expect(formatPct(p.foodCostPct)).toBe('—');
    expect(formatPct(pct(1, 3))).toBe('33.3%');
  });

  it('sums a cash book', () => {
    expect(cashBalance([{ direction: 'IN', amountPaisa: 500 }, { direction: 'OUT', amountPaisa: 200 }])).toBe(300);
    expect(cashBalance([])).toBe(0);
  });
});

describe('recipes', () => {
  it('costs a dish and reports an unknown ingredient cost', () => {
    expect(dishCost([{ qtyBase: 200, costPerBase: 0.1 }, { qtyBase: 2, costPerBase: 15 }])).toEqual({ costPaisa: 50, known: true });
    expect(dishCost([{ qtyBase: 100, costPerBase: 0.5 }, { qtyBase: 1, costPerBase: null }])).toEqual({ costPaisa: 50, known: false });
  });

  it('computes margin and percentage', () => {
    expect(dishMargin(30000, 12000)).toEqual({ marginPaisa: 18000, marginPct: 60 });
    expect(dishMargin(0, 100).marginPct).toBeNull();
    expect(dishMargin(100, 150)).toEqual({ marginPaisa: -50, marginPct: -50 });
  });

  it('adds up an ingredient used by several dishes', () => {
    const needs = aggregateNeeds([
      { portions: 3, ingredients: [{ itemId: 1, qtyBase: 150 }, { itemId: 2, qtyBase: 0.1 }] },
      { portions: 2, ingredients: [{ itemId: 1, qtyBase: 100 }] },
    ]);
    expect(needs.get(1)).toBe(650);
    expect(needs.get(2)).toBe(0.3);
  });
});
