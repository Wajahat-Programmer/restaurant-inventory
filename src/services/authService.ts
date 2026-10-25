import { and, count, eq, inArray } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import {
  afterFailure,
  afterSuccess,
  pinProblem,
  recoveryProblem,
  Role,
  secondsLeft,
  FREE_ATTEMPTS,
} from '../domain/auth';
import { hashSecret, PinRecord, verifySecret } from '../domain/crypto';
import { audit } from './auditService';
import { must, ValidationError, friendly } from './errors';
import { getSetting, setSetting } from './settingsService';
import { getSession, requirePermission, SessionUser, setSession } from './session';

const { users } = schema;

export interface UserRow {
  id: number;
  name: string;
  role: Role;
  isActive: boolean;
}

const RECOVERY_KEY = 'auth.recovery' as const;

/** The app is locked once at least one person has a PIN. */
export async function lockEnabled(q: Queryable): Promise<boolean> {
  const [r] = await q.select({ n: count() }).from(users).where(eq(users.isActive, true));
  return r.n > 0;
}

export async function listUsers(q: Queryable): Promise<UserRow[]> {
  return q
    .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(users.role, users.name);
}

function checkName(name: string): string {
  const n = name.trim();
  if (!n) {
    throw new ValidationError('Name is required');
  }
  if (n.length > 40) {
    throw new ValidationError('Name is too long');
  }
  return n;
}

function checkPin(pin: string): void {
  const p = pinProblem(pin);
  if (p) {
    throw new ValidationError(p);
  }
}

/**
 * First-time setup: the owner's PIN plus a recovery passphrase for the day the
 * PIN is forgotten. There is no server, so without the passphrase a forgotten
 * PIN cannot be reset.
 */
export async function setUpLock(
  db: Db,
  input: { ownerName: string; pin: string; recoveryPassphrase: string },
): Promise<number> {
  const name = checkName(input.ownerName);
  checkPin(input.pin);
  const recovery = input.recoveryPassphrase.trim();
  const rp = recoveryProblem(recovery);
  if (rp) {
    throw new ValidationError(rp);
  }
  return inTransaction(db, async tx => {
    if (await lockEnabled(tx)) {
      throw new ValidationError('The PIN lock is already set up.');
    }
    const h = await hashSecret(input.pin);
    const [u] = await tx
      .insert(users)
      .values({ name, role: 'owner', pinHash: h.hash, pinSalt: h.salt, pinIterations: h.iterations })
      .returning({ id: users.id });
    await setSetting(tx, RECOVERY_KEY, JSON.stringify(await hashSecret(recovery)));
    await audit(tx, 'lock.setup', 'user', u.id);
    return u.id;
  });
}

export async function addStaff(db: Db, input: { name: string; pin: string }): Promise<number> {
  requirePermission('manage');
  const name = checkName(input.name);
  checkPin(input.pin);
  try {
    return await inTransaction(db, async tx => {
      const h = await hashSecret(input.pin);
      const [u] = await tx
        .insert(users)
        .values({ name, role: 'staff', pinHash: h.hash, pinSalt: h.salt, pinIterations: h.iterations })
        .returning({ id: users.id });
      await audit(tx, 'user.add', 'user', u.id, { name, role: 'staff' });
      return u.id;
    });
  } catch (e) {
    return friendly(e, 'A person with this name');
  }
}

export type LoginResult =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'wrong'; attemptsLeft: number }
  | { ok: false; reason: 'locked'; secondsLeft: number }
  | { ok: false; reason: 'unknown' };

/** Checks a PIN, counting wrong tries and making the person wait after too many. */
export async function login(db: Db, userId: number, pin: string, nowMs = Date.now()): Promise<LoginResult> {
  return inTransaction(db, async tx => {
    const [u] = await tx.select().from(users).where(and(eq(users.id, userId), eq(users.isActive, true)));
    if (!u) {
      return { ok: false, reason: 'unknown' } as const;
    }
    const state = { failedAttempts: u.failedAttempts, lockedUntil: u.lockedUntil };
    const wait = secondsLeft(state, nowMs);
    if (wait > 0) {
      return { ok: false, reason: 'locked', secondsLeft: wait } as const;
    }
    const rec: PinRecord = { hash: u.pinHash, salt: u.pinSalt, iterations: u.pinIterations };
    if (!(await verifySecret(pin, rec))) {
      const next = afterFailure(state, nowMs);
      await tx.update(users).set(next).where(eq(users.id, u.id));
      await audit(tx, 'login.failed', 'user', u.id, { attempts: next.failedAttempts });
      const left = secondsLeft(next, nowMs);
      return left > 0
        ? ({ ok: false, reason: 'locked', secondsLeft: left } as const)
        : ({ ok: false, reason: 'wrong', attemptsLeft: Math.max(FREE_ATTEMPTS - next.failedAttempts, 0) } as const);
    }
    await tx.update(users).set(afterSuccess()).where(eq(users.id, u.id));
    const user: SessionUser = { id: u.id, name: u.name, role: u.role };
    setSession(user);
    await audit(tx, 'login', 'user', u.id);
    return { ok: true, user } as const;
  });
}

/** For fingerprint or face unlock: the phone has already proved who it is. */
export async function loginWithBiometrics(db: Db, userId: number): Promise<LoginResult> {
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.isActive, true)));
  if (!u) {
    return { ok: false, reason: 'unknown' };
  }
  const user: SessionUser = { id: u.id, name: u.name, role: u.role };
  setSession(user);
  await audit(db, 'login.biometric', 'user', u.id);
  return { ok: true, user };
}

export function logout(): void {
  setSession(null);
}

export async function changePin(db: Db, userId: number, oldPin: string, newPin: string): Promise<void> {
  checkPin(newPin);
  await inTransaction(db, async tx => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    must(u, 'Person not found');
    const me = getSession();
    if (me && me.id !== userId && me.role !== 'owner') {
      throw new ValidationError('You can only change your own PIN.');
    }
    if (!(await verifySecret(oldPin, { hash: u.pinHash, salt: u.pinSalt, iterations: u.pinIterations }))) {
      throw new ValidationError('The current PIN is wrong.');
    }
    const h = await hashSecret(newPin);
    await tx.update(users).set({ pinHash: h.hash, pinSalt: h.salt, pinIterations: h.iterations }).where(eq(users.id, userId));
    await audit(tx, 'pin.change', 'user', userId);
  });
}

/** Forgotten owner PIN: the recovery passphrase set at the start proves it is the owner. */
export async function resetOwnerPin(db: Db, recoveryPassphrase: string, newPin: string): Promise<void> {
  checkPin(newPin);
  await inTransaction(db, async tx => {
    const stored = await getSetting(tx, RECOVERY_KEY);
    let rec: PinRecord | null = null;
    try {
      rec = JSON.parse(stored) as PinRecord;
    } catch {
      rec = null;
    }
    if (!rec?.hash || !(await verifySecret(recoveryPassphrase.trim(), rec))) {
      throw new ValidationError('That recovery passphrase is not right.');
    }
    const [owner] = await tx.select().from(users).where(and(eq(users.role, 'owner'), eq(users.isActive, true)));
    must(owner, 'No owner found');
    const h = await hashSecret(newPin);
    await tx
      .update(users)
      .set({ pinHash: h.hash, pinSalt: h.salt, pinIterations: h.iterations, ...afterSuccess() })
      .where(eq(users.id, owner.id));
    await audit(tx, 'pin.reset', 'user', owner.id);
  });
}

export async function deactivateUser(db: Db, userId: number): Promise<void> {
  requirePermission('manage');
  await inTransaction(db, async tx => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId));
    must(u, 'Person not found');
    if (u.role === 'owner') {
      throw new ValidationError('The owner cannot be removed. Turn the lock off instead.');
    }
    await tx.update(users).set({ isActive: false }).where(eq(users.id, userId));
    await audit(tx, 'user.remove', 'user', userId, { name: u.name });
  });
}

/** Turns the lock off completely. Needs the owner's PIN, and forgets everyone. */
export async function disableLock(db: Db, ownerPin: string): Promise<void> {
  requirePermission('manage');
  await inTransaction(db, async tx => {
    const [owner] = await tx.select().from(users).where(and(eq(users.role, 'owner'), eq(users.isActive, true)));
    must(owner, 'The lock is not set up.');
    if (!(await verifySecret(ownerPin, { hash: owner.pinHash, salt: owner.pinSalt, iterations: owner.pinIterations }))) {
      throw new ValidationError('The owner PIN is wrong.');
    }
    // Log first (it points at the signed-in person), then detach every entry from
    // the accounts about to go. The log keeps the names; only the link is removed.
    await audit(tx, 'lock.off', 'user', null);
    const ids = (await tx.select({ id: users.id }).from(users)).map(r => r.id);
    if (ids.length) {
      await tx.update(schema.auditLog).set({ userId: null }).where(inArray(schema.auditLog.userId, ids));
    }
    await tx.delete(users);
    await setSetting(tx, RECOVERY_KEY, '');
  });
  setSession(null);
}
