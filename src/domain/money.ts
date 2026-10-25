/** Money is always integer paisa; never floats. */
export type Paisa = number;

export function assertPaisa(value: number): Paisa {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money must be integer paisa, got ${value}`);
  }
  return value;
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
