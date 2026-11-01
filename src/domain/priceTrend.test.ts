import { pricePerLabel, priceRise } from './priceTrend';

const pts = (...prices: number[]) => prices.map((p, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, id: i + 1, pricePerBase: p }));

describe('priceRise', () => {
  it('flags a jump of 10% or more over the usual price', () => {
    const r = priceRise(pts(50, 52, 51, 58), '2026-10-14');
    expect(r).not.toBeNull();
    expect(r!.latest).toBe(58);
    expect(r!.usual).toBe(51);
    expect(r!.rise).toBeCloseTo(58 / 51 - 1);
  });

  it('is quiet for small moves, drops, a single purchase, and a flat price', () => {
    expect(priceRise(pts(50, 52, 51, 54), '2026-10-14')).toBeNull(); // +6%
    expect(priceRise(pts(50, 52, 51, 40), '2026-10-14')).toBeNull(); // cheaper
    expect(priceRise(pts(50), '2026-10-14')).toBeNull();
    expect(priceRise([], '2026-10-14')).toBeNull();
    expect(priceRise(pts(50, 50, 50, 50), '2026-10-14')).toBeNull();
  });

  it('uses the median, so one earlier spike or bargain does not hide a real rise', () => {
    // Usual is about 50; the old spike at 90 must not make 60 look normal.
    expect(priceRise(pts(50, 90, 50, 50, 60), '2026-10-15')).not.toBeNull();
    // And a one-off bargain does not make a normal price look like a rise.
    expect(priceRise(pts(50, 20, 50, 50, 52), '2026-10-15')).toBeNull();
  });

  it('only a fresh rise counts: after two weeks it stops nagging', () => {
    const p = pts(50, 50, 60); // last purchase 2026-10-12
    expect(priceRise(p, '2026-10-26')).not.toBeNull(); // 14 days
    expect(priceRise(p, '2026-10-27')).toBeNull(); // 15 days
  });

  it('takes two purchases on one day in the order they were recorded', () => {
    const a = [
      { date: '2026-10-10', id: 1, pricePerBase: 50 },
      { date: '2026-10-12', id: 3, pricePerBase: 62 },
      { date: '2026-10-12', id: 2, pricePerBase: 50 },
    ];
    expect(priceRise(a, '2026-10-13')!.latest).toBe(62);
  });

  it('ignores zero prices instead of dividing by them', () => {
    expect(priceRise(pts(0, 0, 5), '2026-10-14')).toBeNull();
  });
});

describe('pricePerLabel', () => {
  it('shows kilos, litres and pieces', () => {
    expect(pricePerLabel(58, 'g')).toBe('Rs 580.00 per kg');
    expect(pricePerLabel(48, 'ml')).toBe('Rs 480.00 per litre');
    expect(pricePerLabel(3800, 'pcs')).toBe('Rs 38.00 per piece');
  });
});
