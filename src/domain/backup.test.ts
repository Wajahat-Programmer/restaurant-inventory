import {
  APP_ID,
  backupDate,
  backupDue,
  backupFileName,
  checkManifest,
  failingForTwoDays,
  Manifest,
  retention,
} from './backup';

const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  app: APP_ID,
  format: 1,
  appVersion: '1.0.0',
  schemaVersion: 3,
  createdAt: '2026-10-25T10:00:00.000Z',
  dbSha256: 'a'.repeat(64),
  photoCount: 4,
  ...over,
});

describe('checkManifest', () => {
  it('accepts a backup from the same or an older schema', () => {
    expect(checkManifest(manifest(), 3).ok).toBe(true);
    expect(checkManifest(manifest({ schemaVersion: 1 }), 3).ok).toBe(true);
  });

  it('refuses backups it cannot understand, each with its own message', () => {
    const msg = (m: unknown) => {
      const r = checkManifest(m, 3);
      return r.ok ? null : r.message;
    };
    expect(msg(null)).toContain('not from Restaurant Inventory');
    expect(msg('x')).toContain('not from Restaurant Inventory');
    expect(msg({ ...manifest(), app: 'other' })).toContain('not from Restaurant Inventory');
    expect(msg(manifest({ format: 2 }))).toContain('newer version');
    expect(msg(manifest({ schemaVersion: 4 }))).toContain('newer version');
    expect(msg(manifest({ schemaVersion: 0 }))).toContain('no valid data version');
    expect(msg(manifest({ dbSha256: 'xyz' }))).toContain('no checksum');
    expect(msg({ ...manifest(), createdAt: undefined })).toContain('missing its details');
  });
});

describe('file names', () => {
  it('builds sortable names in local time and reads the date back', () => {
    const n = backupFileName(new Date(2026, 9, 5, 7, 4, 9));
    expect(n).toBe('restaurant-2026-10-05-070409.rimbak');
    expect(backupDate(n)).toBe('2026-10-05');
    // Older names (to the minute) are still understood.
    expect(backupDate('restaurant-2026-10-05-0704.rimbak')).toBe('2026-10-05');
    expect(backupDate('holiday.jpg')).toBeNull();
    expect(backupDate('restaurant-2026-10-05-070409-2.rimbak')).toBe('2026-10-05');
  });

  it('never reuses a name that is taken, even within the same second', () => {
    const d = new Date(2026, 9, 5, 7, 4, 9);
    const first = backupFileName(d);
    const second = backupFileName(d, [first]);
    const third = backupFileName(d, [first, second]);
    expect(new Set([first, second, third]).size).toBe(3);
    expect(second).toBe('restaurant-2026-10-05-070409-2.rimbak');
    expect(third).toBe('restaurant-2026-10-05-070409-3.rimbak');
    expect(backupDate('restaurant-2026-10-05.rimbak')).toBeNull();
  });
});

describe('retention', () => {
  const name = (date: string, hhmm = '1200') => `restaurant-${date}-${hhmm}.rimbak`;

  it('keeps the newest backup of each of the last 7 days', () => {
    const files = [name('2026-10-25', '0900'), name('2026-10-25', '2100'), name('2026-10-24'), name('2026-10-19')];
    const r = retention(files, '2026-10-25');
    expect(r.keep.sort()).toEqual([name('2026-10-19'), name('2026-10-24'), name('2026-10-25', '2100')].sort());
    expect(r.remove).toEqual([name('2026-10-25', '0900')]);
  });

  it('then keeps one per week for 4 weeks and drops the rest', () => {
    // today is Sunday 2026-10-25; the daily window is 10-19..10-25.
    const files = [
      name('2026-10-14'), // week of 10-12 (kept: newest of that week)
      name('2026-10-13'), // same week (older, dropped)
      name('2026-10-07'), // week of 10-05
      name('2026-09-30'), // week of 09-28
      name('2026-09-23'), // week of 09-21
      name('2026-09-16'), // week of 09-14: too old
      name('2026-08-01'),
    ];
    const r = retention(files, '2026-10-25');
    expect(r.keep.sort()).toEqual([name('2026-09-23'), name('2026-09-30'), name('2026-10-07'), name('2026-10-14')].sort());
    expect(r.remove.sort()).toEqual([name('2026-08-01'), name('2026-09-16'), name('2026-10-13')].sort());
  });

  it('never touches files that are not ours', () => {
    const r = retention(['notes.txt', name('2026-10-25')], '2026-10-25');
    expect(r.keep).toEqual([name('2026-10-25')]);
    expect(r.remove).toEqual([]);
  });

  it('copes with no files and with future-dated ones', () => {
    expect(retention([], '2026-10-25')).toEqual({ keep: [], remove: [] });
    expect(retention([name('2026-10-30')], '2026-10-25').keep).toEqual([name('2026-10-30')]);
  });
});

describe('scheduling', () => {
  const H = 3600 * 1000;
  it('is due with no backup yet or after 24 hours', () => {
    expect(backupDue(null, 0)).toBe(true);
    expect(backupDue(0, 23 * H)).toBe(false);
    expect(backupDue(0, 24 * H)).toBe(true);
  });

  it('warns only when failures have run for two days with no success since', () => {
    const D = 24 * H;
    expect(failingForTwoDays([], 5 * D)).toBe(false);
    expect(failingForTwoDays([{ ok: false, at: 4 * D }], 5 * D)).toBe(false);
    expect(failingForTwoDays([{ ok: false, at: 3 * D }, { ok: false, at: 4 * D }], 5 * D + H)).toBe(true);
    // A success after the failures resets it.
    expect(failingForTwoDays([{ ok: false, at: 1 * D }, { ok: true, at: 4 * D }], 5 * D)).toBe(false);
    // An old success followed by fresh failures does not.
    expect(failingForTwoDays([{ ok: true, at: 0 }, { ok: false, at: 2 * D }], 3 * D)).toBe(false);
  });
});
