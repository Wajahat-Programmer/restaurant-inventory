/**
 * On-device forecasting: pure TypeScript, no model to ship, no network.
 *
 * Daily usage per item is a short noisy series with a weekly rhythm. We fit
 * damped-trend Holt-Winters (weekly seasonality) when there are 4+ weeks of
 * history and a 7-day moving average otherwise, back-test both on the most
 * recent days, and only show a forecast whose error (WAPE) is at most 40%.
 */

export const SEASON = 7;
export const MIN_DAYS = 14;
export const MAX_WAPE = 40;
/** z for an 80% band around the forecast, and for ~90% service level in safety stock. */
const Z_BAND = 1.28;
const Z_SERVICE = 1.28;
const PHI = 0.9;

export interface Forecast {
  method: 'holt-winters' | 'moving-average' | 'none';
  /** Expected usage per future day, starting tomorrow. */
  daily: number[];
  low: number[];
  high: number[];
  /** Back-test error in percent, or null when it cannot be measured. */
  wape: number | null;
  /** Typical one-day error, used for the band and safety stock. */
  sigma: number;
  /** False when the forecast must stay hidden. */
  shown: boolean;
  reason: string | null;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a: number[]) => {
  if (a.length < 2) {
    return 0;
  }
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};

/** Weighted absolute percentage error over a test window, in percent. */
export function wape(actual: number[], predicted: number[]): number | null {
  const total = actual.reduce((a, b) => a + Math.abs(b), 0);
  if (!(total > 0)) {
    return null;
  }
  const err = actual.reduce((a, v, i) => a + Math.abs(v - predicted[i]), 0);
  return Math.round((err / total) * 1000) / 10;
}

interface Model {
  predict: (horizon: number) => number[];
  sigma: number;
}

function movingAverageModel(series: number[], window = 7): Model {
  const last = series.slice(-window);
  const level = mean(last);
  // One-step errors of the same rule on the history.
  const errs: number[] = [];
  for (let t = window; t < series.length; t++) {
    errs.push(series[t] - mean(series.slice(t - window, t)));
  }
  return {
    predict: h => Array<number>(h).fill(level),
    sigma: errs.length ? stdev(errs) : stdev(last),
  };
}

function hwRun(series: number[], a: number, b: number, g: number) {
  const m = SEASON;
  let level = mean(series.slice(0, m));
  let trend = (mean(series.slice(m, 2 * m)) - level) / m;
  const season = series.slice(0, m).map(v => v - level);
  let sse = 0;
  const errs: number[] = [];
  for (let t = m; t < series.length; t++) {
    const s = season[t % m];
    const fit = level + PHI * trend + s;
    const e = series[t] - fit;
    errs.push(e);
    sse += e * e;
    const prev = level;
    level = a * (series[t] - s) + (1 - a) * (prev + PHI * trend);
    trend = b * (level - prev) + (1 - b) * PHI * trend;
    season[t % m] = g * (series[t] - level) + (1 - g) * s;
  }
  return { level, trend, season, sse, errs, n: series.length };
}

function holtWintersModel(series: number[]): Model {
  let best: ReturnType<typeof hwRun> | null = null;
  for (const a of [0.1, 0.3, 0.5]) {
    for (const b of [0.01, 0.1]) {
      for (const g of [0.1, 0.3, 0.5]) {
        const r = hwRun(series, a, b, g);
        if (!best || r.sse < best.sse) {
          best = r;
        }
      }
    }
  }
  const f = best as NonNullable<typeof best>;
  return {
    predict: h => {
      const out: number[] = [];
      let damp = 0;
      let p = 1;
      for (let i = 1; i <= h; i++) {
        p *= PHI;
        damp += p;
        out.push(Math.max(0, f.level + damp * f.trend + f.season[(f.n + i - 1) % SEASON]));
      }
      return out;
    },
    sigma: stdev(f.errs),
  };
}

function backtest(series: number[], make: (s: number[]) => Model, minTrain: number): number | null {
  const H = Math.min(14, series.length - minTrain);
  if (H < 7) {
    return null;
  }
  const model = make(series.slice(0, series.length - H));
  return wape(series.slice(-H), model.predict(H));
}

const NONE = (reason: string): Forecast => ({
  method: 'none',
  daily: [],
  low: [],
  high: [],
  wape: null,
  sigma: 0,
  shown: false,
  reason,
});

/**
 * Forecast the next `horizon` days from a series of daily usage (oldest
 * first, one value per calendar day, zeros for days with no usage). Today is
 * excluded by the caller because it is not finished.
 */
export function forecastUsage(series: number[], horizon = 28): Forecast {
  if (series.length < MIN_DAYS) {
    return NONE(`Needs ${MIN_DAYS} days of history (has ${series.length}).`);
  }
  if (!series.some(v => v > 0)) {
    return NONE('No usage recorded yet.');
  }

  const candidates: { method: Forecast['method']; model: Model; wape: number | null }[] = [
    { method: 'moving-average', model: movingAverageModel(series), wape: backtest(series, s => movingAverageModel(s), 7) },
  ];
  if (series.length >= 4 * SEASON) {
    candidates.push({ method: 'holt-winters', model: holtWintersModel(series), wape: backtest(series, holtWintersModel, 2 * SEASON) });
  }
  // Prefer the lower back-test error; an unmeasurable one loses.
  candidates.sort((x, y) => (x.wape ?? Infinity) - (y.wape ?? Infinity));
  const pick = candidates[0];

  const daily = pick.model.predict(horizon);
  const band = Z_BAND * pick.model.sigma;
  const ok = pick.wape !== null && pick.wape <= MAX_WAPE;
  return {
    method: pick.method,
    daily,
    low: daily.map(v => Math.max(0, v - band)),
    high: daily.map(v => v + band),
    wape: pick.wape,
    sigma: pick.model.sigma,
    shown: ok,
    reason: ok
      ? null
      : pick.wape === null
      ? 'Not enough recent usage to check accuracy.'
      : `Usage is too uneven to predict (error ${pick.wape}%, limit ${MAX_WAPE}%).`,
  };
}

/** Days until stock runs out at the forecast rate, or null if it lasts past the forecast. */
export function daysToStockout(onHand: number, daily: number[]): number | null {
  if (onHand <= 0) {
    return 0;
  }
  let used = 0;
  for (let d = 0; d < daily.length; d++) {
    if (used + daily[d] >= onHand && daily[d] > 0) {
      return Math.round((d + (onHand - used) / daily[d]) * 10) / 10;
    }
    used += daily[d];
  }
  return null;
}

export interface Reorder {
  qty: number;
  need: number;
  safety: number;
}

/**
 * forecast over (lead time + review days) + safety stock - on hand, rounded up.
 * The owner confirms before anything is ordered.
 */
export function suggestReorder(args: {
  daily: number[];
  sigma: number;
  onHand: number;
  leadDays: number;
  reviewDays: number;
}): Reorder {
  const days = args.leadDays + args.reviewDays;
  const filler = args.daily.length ? args.daily[args.daily.length - 1] : 0;
  let need = 0;
  for (let d = 0; d < days; d++) {
    need += d < args.daily.length ? args.daily[d] : filler;
  }
  const safety = Z_SERVICE * args.sigma * Math.sqrt(days);
  return {
    need: Math.round(need * 100) / 100,
    safety: Math.round(safety * 100) / 100,
    qty: Math.max(0, Math.ceil(need + safety - args.onHand)),
  };
}

/** Is the latest day's usage far above what the model expected (z > 3)? */
export function usageAnomaly(series: number[]): { z: number | null; flagged: boolean } {
  if (series.length < MIN_DAYS + 1) {
    return { z: null, flagged: false };
  }
  const history = series.slice(0, -1);
  const model = series.length - 1 >= 4 * SEASON ? holtWintersModel(history) : movingAverageModel(history);
  if (!(model.sigma > 0)) {
    return { z: null, flagged: false };
  }
  const z = (series[series.length - 1] - model.predict(1)[0]) / model.sigma;
  return { z: Math.round(z * 10) / 10, flagged: z > 3 };
}

/** This week's wastage against the average of the four weeks before it (alert above 2x). */
export function wastageSpike(weekly: number[]): { flagged: boolean; ratio: number | null } {
  if (weekly.length < 2) {
    return { flagged: false, ratio: null };
  }
  const current = weekly[weekly.length - 1];
  const before = weekly.slice(-5, -1);
  const avg = mean(before);
  if (!(avg > 0)) {
    return { flagged: false, ratio: null };
  }
  const ratio = Math.round((current / avg) * 10) / 10;
  return { flagged: current > 2 * avg, ratio };
}

/** Expected spend for a recurring cost from its past monthly totals, as a range. */
export function outlook(monthly: number[]): { expected: number; low: number; high: number } | null {
  if (!monthly.length) {
    return null;
  }
  return {
    expected: Math.round(mean(monthly)),
    low: Math.min(...monthly),
    high: Math.max(...monthly),
  };
}
