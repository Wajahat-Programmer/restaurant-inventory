export type Role = 'owner' | 'staff';

/** Things a person may or may not do. The app shows only what a role may use. */
export type Permission =
  | 'record' // stock in/out, wastage, counts, sales entry
  | 'void' // cancel purchases, sales and expenses
  | 'adjust' // manual stock adjustments
  | 'finance' // expenses, cash book, profit and loss
  | 'recipes' // change dishes and prices
  | 'manage'; // users, backup and restore, settings, updates

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set<Permission>(['record', 'void', 'adjust', 'finance', 'recipes', 'manage']),
  staff: new Set<Permission>(['record']),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].has(permission);
}

export const PIN_MIN = 4;
export const PIN_MAX = 6;

/** What a PIN is not allowed to be, or null when it is acceptable. */
export function pinProblem(pin: string): string | null {
  if (!/^\d+$/.test(pin)) {
    return 'A PIN is digits only.';
  }
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) {
    return `A PIN must be ${PIN_MIN} to ${PIN_MAX} digits.`;
  }
  if (/^(\d)\1+$/.test(pin)) {
    return 'Do not use the same digit repeated (like 1111).';
  }
  const d = [...pin].map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) {
    return 'Do not use a run of digits (like 1234 or 4321).';
  }
  if (pin.length % 2 === 0 && pin.slice(0, pin.length / 2) === pin.slice(pin.length / 2)) {
    return 'Do not use a repeating pattern (like 1212).';
  }
  return null;
}

export function recoveryProblem(passphrase: string): string | null {
  if (passphrase.trim().length < 8) {
    return 'The recovery passphrase must be at least 8 characters.';
  }
  if (new Set(passphrase).size < 4) {
    return 'The recovery passphrase is too simple. Use a short sentence.';
  }
  return null;
}

/** Wrong guesses allowed before the phone makes you wait. */
export const FREE_ATTEMPTS = 5;

/** Seconds to wait after this many wrong PINs in a row. */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts < FREE_ATTEMPTS) {
    return 0;
  }
  const table = [30, 60, 300, 900];
  return table[Math.min(failedAttempts - FREE_ATTEMPTS, table.length - 1)];
}

export interface LockState {
  failedAttempts: number;
  /** Time (ms) until which no attempt is allowed; 0 for none. */
  lockedUntil: number;
}

/** After a wrong PIN. */
export function afterFailure(s: LockState, nowMs: number): LockState {
  const failedAttempts = s.failedAttempts + 1;
  const wait = lockoutSeconds(failedAttempts);
  return { failedAttempts, lockedUntil: wait ? nowMs + wait * 1000 : 0 };
}

/** After a correct PIN. */
export const afterSuccess = (): LockState => ({ failedAttempts: 0, lockedUntil: 0 });

/** Whole seconds left to wait, 0 when an attempt is allowed. */
export function secondsLeft(s: LockState, nowMs: number): number {
  return s.lockedUntil > nowMs ? Math.ceil((s.lockedUntil - nowMs) / 1000) : 0;
}

/** Locks again after the app has been in the background this long (minutes). */
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_OPTIONS)[number];

export function shouldAutoLock(leftAtMs: number | null, nowMs: number, minutes: AutoLockMinutes): boolean {
  return leftAtMs !== null && nowMs - leftAtMs >= minutes * 60 * 1000;
}
