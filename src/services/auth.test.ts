import { eq } from 'drizzle-orm';
import { Db, schema } from '../db/client';
import { createTestDb } from '../db/testing';
import { listAudit } from './auditService';
import {
  addStaff,
  changePin,
  deactivateUser,
  disableLock,
  listUsers,
  lockEnabled,
  login,
  loginWithBiometrics,
  logout,
  resetOwnerPin,
  setUpLock,
} from './authService';
import { addManualCash, getCashBook } from './cashService';
import { addExpense, voidExpense } from './expenseService';
import { createItem } from './itemService';
import { createSupplier, postPurchase, recordPayment, voidPurchase } from './purchaseService';
import { createRecipe } from './recipeService';
import { profitAndLoss } from './reportService';
import { postSales, voidSale } from './salesService';
import { allowed, getSession, setSession } from './session';
import { adjustStock, issueToKitchen, recordWaste } from './stockService';

let db: Db;
beforeEach(async () => {
  setSession(null);
  db = await createTestDb();
});
afterEach(() => setSession(null));

const OWNER = { ownerName: 'Wajahat', pin: '4829', recoveryPassphrase: 'my first restaurant' };
const TODAY = '2026-10-25';

async function ownerAndStaff() {
  const ownerId = await setUpLock(db, OWNER);
  await login(db, ownerId, '4829');
  const staffId = await addStaff(db, { name: 'Bilal', pin: '7391' });
  logout();
  return { ownerId, staffId };
}

describe('setting up the lock', () => {
  it('creates the owner and turns the lock on, storing no PIN', async () => {
    expect(await lockEnabled(db)).toBe(false);
    const id = await setUpLock(db, OWNER);
    expect(await lockEnabled(db)).toBe(true);
    expect(await listUsers(db)).toEqual([{ id, name: 'Wajahat', role: 'owner', isActive: true }]);
    const row = (await db.select().from(schema.users))[0];
    expect(JSON.stringify(row)).not.toContain('4829');
    expect(row.pinHash).toHaveLength(64);
    const recovery = (await db.select().from(schema.settings).where(eq(schema.settings.key, 'auth.recovery')))[0].value;
    expect(recovery).not.toContain('my first restaurant');
  });

  it('refuses weak PINs, weak recovery phrases, blank names and a second setup', async () => {
    await expect(setUpLock(db, { ...OWNER, pin: '1234' })).rejects.toThrow('run of digits');
    await expect(setUpLock(db, { ...OWNER, pin: '12' })).rejects.toThrow('4 to 6');
    await expect(setUpLock(db, { ...OWNER, recoveryPassphrase: 'short' })).rejects.toThrow('at least 8');
    await expect(setUpLock(db, { ...OWNER, ownerName: '  ' })).rejects.toThrow('Name is required');
    expect(await lockEnabled(db)).toBe(false);
    await setUpLock(db, OWNER);
    await expect(setUpLock(db, OWNER)).rejects.toThrow('already set up');
  });
});

describe('signing in', () => {
  it('lets the right PIN in and remembers who is signed in', async () => {
    const id = await setUpLock(db, OWNER);
    const r = await login(db, id, '4829');
    expect(r).toMatchObject({ ok: true, user: { id, name: 'Wajahat', role: 'owner' } });
    expect(getSession()).toEqual({ id, name: 'Wajahat', role: 'owner' });
    logout();
    expect(getSession()).toBeNull();
  });

  it('counts wrong PINs, then makes the person wait, even for the right PIN', async () => {
    const id = await setUpLock(db, OWNER);
    let now = 1_000_000;
    for (let tries = 1; tries <= 4; tries++) {
      expect(await login(db, id, '0000', now)).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 5 - tries });
    }
    const fifth = await login(db, id, '0000', now);
    expect(fifth).toEqual({ ok: false, reason: 'locked', secondsLeft: 30 });
    expect(await login(db, id, '4829', now + 10_000)).toEqual({ ok: false, reason: 'locked', secondsLeft: 20 });
    expect(getSession()).toBeNull();
    now += 31_000;
    expect(await login(db, id, '4829', now)).toMatchObject({ ok: true });
  });

  it('a right PIN clears the count', async () => {
    const id = await setUpLock(db, OWNER);
    for (let i = 0; i < 3; i++) {
      await login(db, id, '0000', 1000);
    }
    await login(db, id, '4829', 1000);
    expect(await login(db, id, '0000', 1000)).toEqual({ ok: false, reason: 'wrong', attemptsLeft: 4 });
  });

  it('the wait gets longer each time', async () => {
    const id = await setUpLock(db, OWNER);
    const t = 5_000_000;
    for (let i = 0; i < 5; i++) {
      await login(db, id, '0000', t);
    }
    expect(await login(db, id, '0000', t + 31_000)).toEqual({ ok: false, reason: 'locked', secondsLeft: 60 });
  });

  it('does not know unknown or removed people', async () => {
    const { staffId } = await ownerAndStaff();
    expect(await login(db, 999, '4829')).toEqual({ ok: false, reason: 'unknown' });
    setSession({ id: 1, name: 'Wajahat', role: 'owner' });
    await deactivateUser(db, staffId);
    expect(await login(db, staffId, '7391')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('fingerprint sign-in starts a session for that person', async () => {
    const { staffId } = await ownerAndStaff();
    expect(await loginWithBiometrics(db, staffId)).toMatchObject({ ok: true, user: { name: 'Bilal', role: 'staff' } });
    expect(getSession()?.role).toBe('staff');
    expect(await loginWithBiometrics(db, 999)).toEqual({ ok: false, reason: 'unknown' });
  });
});

describe('managing people and PINs', () => {
  it('only the owner can add or remove staff, and names are unique', async () => {
    const { ownerId, staffId } = await ownerAndStaff();
    await login(db, staffId, '7391');
    await expect(addStaff(db, { name: 'Hamza', pin: '5902' })).rejects.toThrow('Only the owner');
    await expect(deactivateUser(db, staffId)).rejects.toThrow('Only the owner');
    logout();
    await login(db, ownerId, '4829');
    await expect(addStaff(db, { name: 'Bilal', pin: '5902' })).rejects.toThrow('already exists');
    await expect(addStaff(db, { name: 'Hamza', pin: '1111' })).rejects.toThrow('same digit');
    await expect(deactivateUser(db, ownerId)).rejects.toThrow('owner cannot be removed');
    await deactivateUser(db, staffId);
    expect((await listUsers(db)).map(u => u.name)).toEqual(['Wajahat']);
  });

  it('changing a PIN needs the old one', async () => {
    const { ownerId } = await ownerAndStaff();
    await expect(changePin(db, ownerId, '9999', '5902')).rejects.toThrow('current PIN is wrong');
    await expect(changePin(db, ownerId, '4829', '1234')).rejects.toThrow('run of digits');
    await changePin(db, ownerId, '4829', '5902');
    expect(await login(db, ownerId, '4829')).toMatchObject({ ok: false });
    expect(await login(db, ownerId, '5902')).toMatchObject({ ok: true });
  });

  it('staff cannot change someone elses PIN', async () => {
    const { ownerId, staffId } = await ownerAndStaff();
    await login(db, staffId, '7391');
    await expect(changePin(db, ownerId, '4829', '5902')).rejects.toThrow('only change your own');
  });

  it('a forgotten owner PIN is reset with the recovery passphrase, and the wait is cleared', async () => {
    const id = await setUpLock(db, OWNER);
    for (let i = 0; i < 5; i++) {
      await login(db, id, '0000', 1000);
    }
    await expect(resetOwnerPin(db, 'wrong passphrase', '5902')).rejects.toThrow('not right');
    await expect(resetOwnerPin(db, 'my first restaurant', '1111')).rejects.toThrow('same digit');
    await resetOwnerPin(db, '  my first restaurant  ', '5902');
    expect(await login(db, id, '4829', 2000)).toMatchObject({ ok: false });
    expect(await login(db, id, '5902', 2000)).toMatchObject({ ok: true });
  });

  it('turning the lock off needs the owner PIN and removes everyone', async () => {
    const { ownerId } = await ownerAndStaff();
    await login(db, ownerId, '4829');
    await expect(disableLock(db, '0000')).rejects.toThrow('PIN is wrong');
    await disableLock(db, '4829');
    expect(await lockEnabled(db)).toBe(false);
    expect(await db.select().from(schema.users)).toHaveLength(0);
    expect(getSession()).toBeNull();
    const log = await listAudit(db, 500);
    expect(log.some(l => l.action === 'lock.off')).toBe(true);
    expect(log.every(l => l.userId === null)).toBe(true); // links gone, names kept
    expect(log.some(l => l.actor === 'Wajahat')).toBe(true);
  });
});

describe('what each role may do', () => {
  async function stocked() {
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
    const sup = await createSupplier(db, { name: 'Al-Noor' });
    const purchase = await postPurchase(db, {
      supplierId: sup,
      date: TODAY,
      lines: [{ itemId: rice, qtyBase: 10000, totalPaisa: 100000 }],
      paidPaisa: 0,
    });
    const dish = await createRecipe(db, { name: 'Pulao', sellPricePaisa: 15000, lines: [{ itemId: rice, qtyBase: 100 }] });
    const [sale] = await postSales(db, { date: TODAY, lines: [{ recipeId: dish, qty: 1 }] });
    const expense = await addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 1000 });
    return { rice, sup, purchase, dish, sale, expense };
  }

  it('with nobody signed in (no lock) everything is allowed', async () => {
    expect(allowed('manage')).toBe(true);
    const s = await stocked();
    await voidSale(db, s.sale, TODAY);
  });

  it('staff can record stock and sales but not cancel, adjust, see money or change dishes', async () => {
    const s = await stocked();
    const { staffId } = await ownerAndStaff();
    await login(db, staffId, '7391');

    // Allowed.
    await issueToKitchen(db, { itemId: s.rice, qtyBase: 10 });
    await recordWaste(db, { itemId: s.rice, qtyBase: 10, reason: 'spoiled' });
    await postSales(db, { date: TODAY, lines: [{ recipeId: s.dish, qty: 1 }] });
    await postPurchase(db, { supplierId: s.sup, date: TODAY, lines: [{ itemId: s.rice, qtyBase: 100, totalPaisa: 1000 }], paidPaisa: 0 });

    // Not allowed.
    const denied = async (p: Promise<unknown>, msg: string) => expect(p).rejects.toThrow(msg);
    await denied(voidPurchase(db, s.purchase, TODAY), 'Only the owner can cancel');
    await denied(voidSale(db, s.sale, TODAY), 'Only the owner can cancel');
    await denied(voidExpense(db, s.expense, TODAY), 'Only the owner can cancel');
    await denied(adjustStock(db, { itemId: s.rice, deltaBase: 5, note: 'x' }), 'Only the owner can adjust');
    await denied(addExpense(db, { date: TODAY, category: 'gas', amountPaisa: 5 }), 'Only the owner can see or change money');
    await denied(addManualCash(db, { date: TODAY, direction: 'IN', amountPaisa: 5, note: 'x' }), 'money');
    await denied(getCashBook(db, TODAY, TODAY), 'money');
    await denied(profitAndLoss(db, TODAY, TODAY), 'money');
    await denied(recordPayment(db, { supplierId: s.sup, date: TODAY, amountPaisa: 5 }), 'money');
    await denied(createRecipe(db, { name: 'Dal', sellPricePaisa: 1, lines: [{ itemId: s.rice, qtyBase: 1 }] }), 'Only the owner can change dishes');
  });

  it('the owner can do all of it', async () => {
    const s = await stocked();
    const { ownerId } = await ownerAndStaff();
    await login(db, ownerId, '4829');
    await adjustStock(db, { itemId: s.rice, deltaBase: 5, note: 'found' });
    await voidSale(db, s.sale, TODAY);
    await voidExpense(db, s.expense, TODAY);
    expect((await profitAndLoss(db, TODAY, TODAY)).revenue).toBe(0);
    await recordPayment(db, { supplierId: s.sup, date: TODAY, amountPaisa: 5 });
  });
});

describe('audit trail', () => {
  it('records who cancelled or adjusted what, in the same transaction as the action', async () => {
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 1000, valuePaisa: 10000 });
    const { ownerId } = await ownerAndStaff();
    await login(db, ownerId, '4829');
    await adjustStock(db, { itemId: rice, deltaBase: -100, note: 'spilled' });
    const [adj] = (await listAudit(db)).filter(l => l.action === 'stock.adjust');
    expect(adj).toMatchObject({ actor: 'Wajahat', userId: ownerId, entity: 'item', entityId: rice });
    expect(JSON.parse(adj.detail!)).toEqual({ delta: -100, note: 'spilled' });
  });

  it('a refused action leaves no trace', async () => {
    const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' }, { qtyBase: 10, valuePaisa: 100 });
    await expect(adjustStock(db, { itemId: rice, deltaBase: -999, note: 'too much' })).rejects.toThrow('Insufficient');
    expect((await listAudit(db)).filter(l => l.action === 'stock.adjust')).toHaveLength(0);
  });

  it('logs failed sign-ins and never writes a PIN anywhere', async () => {
    const id = await setUpLock(db, OWNER);
    await login(db, id, '0000');
    await login(db, id, '4829');
    const log = await listAudit(db);
    expect(log.map(l => l.action).reverse()).toEqual(['lock.setup', 'login.failed', 'login']);
    // Look at what was written about people, not timestamps (which can contain "0000").
    const text = JSON.stringify(log.map(l => [l.action, l.actor, l.entity, l.detail]));
    expect(text).not.toMatch(/0000|4829|my first restaurant/);
  });

  it('shows newest first and respects the limit', async () => {
    const id = await setUpLock(db, OWNER);
    for (let i = 0; i < 4; i++) {
      await login(db, id, '0000', 1000 + i);
    }
    const log = await listAudit(db, 2);
    expect(log).toHaveLength(2);
    expect(log[0].id).toBeGreaterThan(log[1].id);
  });
});
