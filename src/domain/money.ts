/** Money is always integer paisa; never floats. */
export type Paisa = number;

export function assertPaisa(value: number): Paisa {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money must be integer paisa, got ${value}`);
  }
  return value;
}

/**
 * Parses a user-typed rupee amount ("1,234.5", "50") into integer paisa.
 * Returns null for anything that is not a plain non-negative amount with at
 * most two decimals. String parsing avoids float error (19.99 * 100 = 1998.99...).
 */
export function parseRupees(text: string): Paisa | null {
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(text.trim().replace(/,/g, ''));
  if (!m) {
    return null;
  }
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** Formats paisa as "Rs 1,234.50". Integer math only, so no float drift. */
export function formatPKR(paisa: Paisa): string {
  assertPaisa(paisa);
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}Rs ${whole}.${frac}`;
}
