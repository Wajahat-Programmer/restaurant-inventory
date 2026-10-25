import {
  afterFailure,
  afterSuccess,
  can,
  lockoutSeconds,
  LockState,
  pinProblem,
  recoveryProblem,
  secondsLeft,
  shouldAutoLock,
} from './auth';

describe('roles', () => {
  it('owner can do everything', () => {
    for (const p of ['record', 'void', 'adjust', 'finance', 'recipes', 'manage'] as const) {
      expect(can('owner', p)).toBe(true);
    }
  });

  it('staff can record stock and sales and nothing else', () => {
    expect(can('staff', 'record')).toBe(true);
    for (const p of ['void', 'adjust', 'finance', 'recipes', 'manage'] as const) {
      expect(can('staff', p)).toBe(false);
    }
  });
});

describe('pinProblem', () => {
  it('accepts ordinary PINs of 4 to 6 digits', () => {
    for (const ok of ['4829', '07391', '902756', '1357', '2580']) {
      expect(pinProblem(ok)).toBeNull();
    }
  });

  it('rejects the wrong length or non-digits', () => {
    expect(pinProblem('482')).toContain('4 to 6');
    expect(pinProblem('4829571')).toContain('4 to 6');
    expect(pinProblem('48a9')).toContain('digits only');
    expect(pinProblem('')).toContain('digits only');
    expect(pinProblem('48 29')).toContain('digits only');
  });

  it('rejects guessable PINs', () => {
    for (const bad of ['1111', '0000', '999999']) {
      expect(pinProblem(bad)).toContain('same digit');
    }
    for (const bad of ['1234', '4321', '0123', '345678', '9876']) {
      expect(pinProblem(bad)).toContain('run of digits');
    }
    for (const bad of ['1212', '5252', '123123']) {
      expect(pinProblem(bad)).toContain('repeating pattern');
    }
  });
});

describe('recoveryProblem', () => {
  it('wants a real passphrase', () => {
    expect(recoveryProblem('short')).toContain('at least 8');
    expect(recoveryProblem('aaaaaaaaaa')).toContain('too simple');
    expect(recoveryProblem('   spaces   ')).toContain('at least 8'); // padding does not count
    expect(recoveryProblem('my first restaurant 2026')).toBeNull();
  });
});

describe('lockout', () => {
  it('gives five free tries, then waits longer each time up to 15 minutes', () => {
    expect([1, 2, 3, 4].map(lockoutSeconds)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 50].map(lockoutSeconds)).toEqual([30, 60, 300, 900, 900, 900]);
  });

  it('tracks failures, locks, and clears on success', () => {
    let s: LockState = afterSuccess();
    for (let i = 0; i < 4; i++) {
      s = afterFailure(s, 1000);
    }
    expect(s).toEqual({ failedAttempts: 4, lockedUntil: 0 });
    s = afterFailure(s, 1000);
    expect(s).toEqual({ failedAttempts: 5, lockedUntil: 31000 });
    expect(secondsLeft(s, 1000)).toBe(30);
    expect(secondsLeft(s, 30500)).toBe(1);
    expect(secondsLeft(s, 31000)).toBe(0);
    expect(afterSuccess()).toEqual({ failedAttempts: 0, lockedUntil: 0 });
  });
});

describe('auto lock', () => {
  const MIN = 60 * 1000;
  it('locks after the chosen time away, immediately for 0, never without a leave time', () => {
    expect(shouldAutoLock(0, 4 * MIN, 5)).toBe(false);
    expect(shouldAutoLock(0, 5 * MIN, 5)).toBe(true);
    expect(shouldAutoLock(100, 100, 0)).toBe(true);
    expect(shouldAutoLock(null, 99 * MIN, 1)).toBe(false);
  });
});
