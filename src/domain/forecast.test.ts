import {
  daysToStockout,
  forecastUsage,
  outlook,
  suggestReorder,
  usageAnomaly,
  wape,
  wastageSpike,
} from './forecast';
import { expiryStatus, remainingLots } from './lots';

/** Deterministic noise so the tests never flake. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A restaurant-like week: quiet Mon-Thu, busy Fri-Sat, slow Sun. */
const WEEK = [100, 100, 100, 100, 150, 200, 50];
const weekly = (weeks: number, noise = 0, seed = 1) => {
  const r = lcg(seed);
  return Array.from({ length: weeks * 7 }, (_, i) => Math.max(0, WEEK[i % 7] + (r() - 0.5) * 2 * noise));
};

describe('wape', () => {
  it('is the total absolute error over the total actual', () => {
    expect(wape([100, 100], [90, 110])).toBe(10);
    expect(wape([0, 0], [1, 1])).toBeNull();
  });
});

describe('forecastUsage', () => {
  it('stays hidden until there are 14 days of history', () => {
    const f = forecastUsage(weekly(1));
    expect(f).toMatchObject({ method: 'none', shown: false });
    expect(f.reason).toContain('14 days');
  });

  it('says so when nothing was ever used', () => {
    expect(forecastUsage(Array(30).fill(0)).reason).toBe('No usage recorded yet.');
  });

  it('learns the weekly rhythm with four or more weeks of history', () => {
    const f = forecastUsage(weekly(8, 8));
    expect(f.method).toBe('holt-winters');
    expect(f.shown).toBe(true);
    expect(f.wape).toBeLessThan(15);
    // The next 7 days follow the pattern the history ended on (a Monday is next).
    f.daily.slice(0, 7).forEach((v, i) => expect(Math.abs(v - WEEK[i])).toBeLessThan(25));
    expect(f.daily).toHaveLength(28);
    f.low.forEach((v, i) => expect(v).toBeLessThanOrEqual(f.daily[i]));
    f.high.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(f.daily[i]));
  });

  it('falls back to a moving average with two or three weeks of history', () => {
    const f = forecastUsage(weekly(3, 5));
    expect(f.method).toBe('moving-average');
    expect(f.daily[0]).toBeCloseTo(f.daily[6], 5); // flat
  });

  it('hides a forecast when usage is too uneven to trust', () => {
    const r = lcg(7);
    const wild = Array.from({ length: 56 }, () => (r() < 0.5 ? 0 : 400 * r()));
    const f = forecastUsage(wild);
    expect(f.shown).toBe(false);
    expect(f.reason).toContain('too uneven');
    expect(f.wape).toBeGreaterThan(40);
  });

  it('never predicts negative usage', () => {
    const f = forecastUsage([...weekly(4, 0), 0, 0, 0, 0, 0, 0, 0]);
    f.daily.concat(f.low, f.high).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });
});

describe('daysToStockout', () => {
  const flat = Array(28).fill(100);
  it('counts days at the forecast rate, with a fraction', () => {
    expect(daysToStockout(250, flat)).toBe(2.5);
    expect(daysToStockout(100, flat)).toBe(1);
  });
  it('is 0 with no stock and null when it outlasts the forecast', () => {
    expect(daysToStockout(0, flat)).toBe(0);
    expect(daysToStockout(5000, flat)).toBeNull();
    expect(daysToStockout(10, Array(28).fill(0))).toBeNull();
  });
});

describe('suggestReorder', () => {
  it('covers lead time plus review days plus safety stock, minus what is on hand', () => {
    const r = suggestReorder({ daily: Array(28).fill(100), sigma: 20, onHand: 300, leadDays: 2, reviewDays: 7 });
    // need 900, safety 1.28 * 20 * 3 = 76.8, minus 300 -> 676.8 -> 677
    expect(r).toEqual({ need: 900, safety: 76.8, qty: 677 });
  });
  it('is zero when there is already enough', () => {
    expect(suggestReorder({ daily: [10], sigma: 0, onHand: 1000, leadDays: 2, reviewDays: 7 }).qty).toBe(0);
  });
  it('extends a short forecast with its last value', () => {
    expect(suggestReorder({ daily: [10, 20], sigma: 0, onHand: 0, leadDays: 2, reviewDays: 3 }).need).toBe(10 + 20 + 20 * 3);
  });
});

describe('usageAnomaly', () => {
  it('flags a day far above what was expected', () => {
    const s = weekly(6, 6, 3);
    expect(usageAnomaly([...s, 600])).toMatchObject({ flagged: true });
  });
  it('does not flag an ordinary day, a quiet day, or too little history', () => {
    const s = weekly(6, 6, 3);
    expect(usageAnomaly([...s, WEEK[0]]).flagged).toBe(false);
    expect(usageAnomaly([...s, 0]).flagged).toBe(false);
    expect(usageAnomaly(weekly(1)).flagged).toBe(false);
  });
});

describe('wastageSpike', () => {
  it('flags a week above twice the previous four-week average', () => {
    expect(wastageSpike([100, 100, 100, 100, 250])).toEqual({ flagged: true, ratio: 2.5 });
    expect(wastageSpike([100, 100, 100, 100, 200]).flagged).toBe(false);
  });
  it('is quiet with no baseline', () => {
    expect(wastageSpike([0, 0, 0, 0, 500])).toEqual({ flagged: false, ratio: null });
    expect(wastageSpike([500])).toEqual({ flagged: false, ratio: null });
  });
});

describe('outlook', () => {
  it('summarises past months as a range, not a single number', () => {
    expect(outlook([30000, 32000, 28000])).toEqual({ expected: 30000, low: 28000, high: 32000 });
    expect(outlook([])).toBeNull();
  });
});

describe('lots and expiry', () => {
  const moves = [
    { date: '2026-10-01', qtyBase: 1000 },
    { date: '2026-10-10', qtyBase: 500 },
    { date: '2026-10-12', qtyBase: -1200 },
  ];

  it('uses the oldest stock first', () => {
    expect(remainingLots(moves)).toEqual([{ date: '2026-10-10', qtyBase: 300 }]);
  });

  it('keeps going if more is removed than was added', () => {
    expect(remainingLots([{ date: '2026-10-01', qtyBase: 10 }, { date: '2026-10-02', qtyBase: -50 }])).toEqual([]);
  });

  it('splits stock into expired, expiring soon and fine', () => {
    const lots = [
      { date: '2026-10-01', qtyBase: 100 }, // expires 10-08: expired
      { date: '2026-10-20', qtyBase: 50 }, // expires 10-27: within 2 days of 10-25
      { date: '2026-10-24', qtyBase: 70 }, // expires 10-31: fine
    ];
    expect(expiryStatus(lots, 7, '2026-10-25')).toEqual({ expiredQty: 100, expiringQty: 50, firstExpiry: '2026-10-08' });
  });

  it('ignores items without a shelf life or without stock', () => {
    expect(expiryStatus([{ date: '2026-10-01', qtyBase: 5 }], null, '2026-10-25')).toEqual({ expiredQty: 0, expiringQty: 0, firstExpiry: null });
    expect(expiryStatus([], 7, '2026-10-25').firstExpiry).toBeNull();
  });
});
