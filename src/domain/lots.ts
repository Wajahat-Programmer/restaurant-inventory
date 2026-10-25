import { addDays } from './periods';

export interface LotMovement {
  /** Business date the movement happened, YYYY-MM-DD. */
  date: string;
  /** Signed base units. */
  qtyBase: number;
}

export interface Lot {
  date: string;
  qtyBase: number;
}

/**
 * Stock has no lot records, so we infer them: every addition starts a lot, and
 * every removal uses the oldest lot first (FIFO, which is how a kitchen should
 * use stock). What is left is what is still on the shelf, and how old it is.
 * Movements must be in the order they happened.
 */
export function remainingLots(movements: LotMovement[]): Lot[] {
  const lots: Lot[] = [];
  for (const m of movements) {
    if (m.qtyBase > 0) {
      lots.push({ date: m.date, qtyBase: m.qtyBase });
      continue;
    }
    let out = -m.qtyBase;
    while (out > 1e-9 && lots.length) {
      const take = Math.min(lots[0].qtyBase, out);
      lots[0].qtyBase = Math.round((lots[0].qtyBase - take) * 1000) / 1000;
      out = Math.round((out - take) * 1000) / 1000;
      if (lots[0].qtyBase <= 1e-9) {
        lots.shift();
      }
    }
  }
  return lots;
}

export interface ExpiryStatus {
  expiredQty: number;
  expiringQty: number;
  /** Earliest expiry among lots still on the shelf, or null. */
  firstExpiry: string | null;
}

/**
 * Splits what is on the shelf into already expired, expiring within `warnDays`,
 * and fine. A lot expires `shelfLifeDays` after it came in.
 */
export function expiryStatus(lots: Lot[], shelfLifeDays: number | null, today: string, warnDays = 2): ExpiryStatus {
  if (!shelfLifeDays || !lots.length) {
    return { expiredQty: 0, expiringQty: 0, firstExpiry: null };
  }
  let expiredQty = 0;
  let expiringQty = 0;
  let firstExpiry: string | null = null;
  const warnUntil = addDays(today, warnDays);
  for (const l of lots) {
    const expires = addDays(l.date, shelfLifeDays);
    if (firstExpiry === null || expires < firstExpiry) {
      firstExpiry = expires;
    }
    if (expires < today) {
      expiredQty += l.qtyBase;
    } else if (expires <= warnUntil) {
      expiringQty += l.qtyBase;
    }
  }
  return {
    expiredQty: Math.round(expiredQty * 1000) / 1000,
    expiringQty: Math.round(expiringQty * 1000) / 1000,
    firstExpiry,
  };
}
