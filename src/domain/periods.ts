export type PeriodKind = 'day' | 'week' | 'month';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True only for real calendar dates: 2026-02-30 is rejected. */
export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) {
    return false;
  }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

function assertDate(s: string): void {
  if (!isValidDate(s)) {
    throw new RangeError(`Not a valid date: ${s}`);
  }
}

const toISO = (d: Date) => d.toISOString().slice(0, 10);

/** Pure calendar arithmetic (UTC), so daylight-saving never shifts a date. */
export function addDays(date: string, n: number): string {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m - 1, d + n)));
}

/** Inclusive range. Weeks run Monday to Sunday. */
export function periodRange(kind: PeriodKind, anchor: string): { from: string; to: string } {
  assertDate(anchor);
  const [y, m, d] = anchor.split('-').map(Number);
  if (kind === 'day') {
    return { from: anchor, to: anchor };
  }
  if (kind === 'week') {
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
    const from = addDays(anchor, -dow);
    return { from, to: addDays(from, 6) };
  }
  return {
    from: toISO(new Date(Date.UTC(y, m - 1, 1))),
    to: toISO(new Date(Date.UTC(y, m, 0))),
  };
}

/** Moves the anchor one period back (-1) or forward (+1). */
export function shiftPeriod(kind: PeriodKind, anchor: string, dir: -1 | 1): string {
  assertDate(anchor);
  if (kind === 'day') {
    return addDays(anchor, dir);
  }
  if (kind === 'week') {
    return addDays(anchor, 7 * dir);
  }
  const [y, m] = anchor.split('-').map(Number);
  return toISO(new Date(Date.UTC(y, m - 1 + dir, 1)));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export function periodLabel(kind: PeriodKind, anchor: string): string {
  const { from, to } = periodRange(kind, anchor);
  if (kind === 'day') {
    return shortDate(from);
  }
  if (kind === 'month') {
    const [y, m] = from.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  return `${shortDate(from)} – ${shortDate(to)}`;
}

/** Local midnight at the start of a business date, in ms. */
export function dayStartMs(date: string): number {
  assertDate(date);
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** [from, to) in ms for an inclusive date range, for timestamp columns. */
export function rangeMs(from: string, to: string): { start: number; end: number } {
  return { start: dayStartMs(from), end: dayStartMs(addDays(to, 1)) };
}
