import { lineFromPack, paymentStatus, pricePerBase, settle, supplierDue } from './purchasing';
import { countVariance, stockStatus } from './stockStatus';
import { formatQty, parseQty, roundQty, toBase } from './units';

describe('units', () => {
  it('converts packs to base units without float drift', () => {
    expect(toBase(3, 0.1)).toBe(0.3);
    expect(toBase(2, 24)).toBe(48);
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });

  it('parses typed quantities', () => {
    expect(parseQty('2')).toBe(2);
    expect(parseQty(' 1.5 ')).toBe(1.5);
    for (const bad of ['', '0', '-1', '1.2345', 'x', '1,5']) {
      expect(parseQty(bad)).toBeNull();
    }
    expect(parseQty('0', { allowZero: true })).toBe(0);
    expect(parseQty('-1', { allowZero: true })).toBeNull();
  });

  it('formats by unit', () => {
    expect(formatQty(1500, 'g')).toBe('1.5 kg');
    expect(formatQty(999, 'g')).toBe('999 g');
    expect(formatQty(2000, 'ml')).toBe('2 L');
    expect(formatQty(12, 'pcs')).toBe('12 pcs');
  });
});

describe('purchasing', () => {
  it('builds a line from packs: 2 bags of 25 kg at Rs 6,000', () => {
    expect(
      lineFromPack({ packQty: 2, factorToBase: 25000, packPricePaisa: 600000 }),
    ).toEqual({ qtyBase: 50000, totalPaisa: 1200000 });
  });

  it('rejects bad pack input', () => {
    expect(() =>
      lineFromPack({ packQty: 0, factorToBase: 1, packPricePaisa: 1 }),
    ).toThrow('positive');
    expect(() =>
      lineFromPack({ packQty: 1, factorToBase: 1, packPricePaisa: -1 }),
    ).toThrow('negative');
    expect(() =>
      lineFromPack({ packQty: 1, factorToBase: 1, packPricePaisa: 1.5 }),
    ).toThrow('integer paisa');
  });

  it('derives payment status and dues', () => {
    expect(paymentStatus(1000, 1000)).toBe('PAID');
    expect(paymentStatus(1000, 0)).toBe('CREDIT');
    expect(paymentStatus(1000, 400)).toBe('PARTIAL');
    expect(() => paymentStatus(1000, 1001)).toThrow('between');
    expect(
      supplierDue({
        openingBalancePaisa: 500,
        purchasesTotalPaisa: 3000,
        paidPaisa: 1200,
      }),
    ).toBe(2300);
  });

  it('computes price per base unit', () => {
    expect(pricePerBase(1200000, 50000)).toBe(24);
    expect(pricePerBase(100, 0)).toBe(0);
  });
});

describe('stock status', () => {
  it('flags OUT, LOW and OK', () => {
    expect(stockStatus(0, 100)).toBe('OUT');
    expect(stockStatus(100, 100)).toBe('LOW');
    expect(stockStatus(101, 100)).toBe('OK');
    expect(stockStatus(5, 0)).toBe('OK'); // no reorder point set
  });

  it('computes count variance', () => {
    expect(countVariance(10, 8.5)).toBe(-1.5);
    expect(countVariance(0.3, 0.1 + 0.2)).toBe(0);
  });
});

describe('settle', () => {
  const p = (id: number, date: string, total: number, paid = 0, tied = 0) => ({ id, date, totalPaisa: total, paidPaisa: paid, tiedPaisa: tied });

  it('pays the opening balance first, then the oldest purchases', () => {
    const out = settle([p(2, '2026-10-05', 1000), p(1, '2026-10-01', 1000)], 500, 1700);
    // 1,700 - 500 opening = 1,200: the older purchase (1) is fully paid, the newer one gets 200.
    expect(out.get(1)).toBe(1000);
    expect(out.get(2)).toBe(200);
  });

  it('counts what was paid on the day and payments tied to a purchase, and never goes over the total', () => {
    const out = settle([p(1, '2026-10-01', 1000, 400, 700)], 0, 0);
    expect(out.get(1)).toBe(1000);
  });

  it('with no payments at all a credit purchase stays unpaid', () => {
    expect(settle([p(1, '2026-10-01', 1000)], 0, 0).get(1)).toBe(0);
  });

  it('matches what the supplier screen says is owed', () => {
    const rows = [p(1, '2026-10-01', 3000, 1000), p(2, '2026-10-02', 2000)];
    const opening = 400;
    const general = 2400;
    const settled = settle(rows, opening, general);
    const owedByPurchases = rows.reduce((a, r) => a + r.totalPaisa - (settled.get(r.id) ?? 0), 0);
    // owed = opening + totals - paid at purchase - general payments (nothing is tied here)
    expect(owedByPurchases).toBe(opening + 5000 - 1000 - general);
  });
});
