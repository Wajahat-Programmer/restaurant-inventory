import { createTestDb } from '../db/testing';
import { Db, schema } from '../db/client';
import { createItem } from '../services/itemService';
import { setSession } from '../services/session';
import { getSetting, setSetting } from '../services/settingsService';
import { runAutoChecks } from './AutoChecks';
import { loadBackupPassphrase } from './backup/devicePorts';
import { runLocalBackup } from './backup/runBackup';
import { driveConfigured } from './drive/driveDevice';
import { uploadLatestToDrive } from './drive/driveSync';
import { notifyAlerts, notifyBackupFailing } from './notify/notify';

jest.mock('./backup/devicePorts', () => ({ loadBackupPassphrase: jest.fn(), backupPorts: jest.fn(() => ({})) }));
jest.mock('./backup/runBackup', () => ({ ...jest.requireActual('./backup/runBackup'), runLocalBackup: jest.fn() }));
jest.mock('./drive/driveDevice', () => ({ driveConfigured: jest.fn(), driveSyncPorts: jest.fn(() => ({})) }));
jest.mock('./drive/driveSync', () => ({ uploadLatestToDrive: jest.fn() }));
jest.mock('./notify/notify', () => ({ notifyAlerts: jest.fn(), notifyBackupFailing: jest.fn(), notifyUpdate: jest.fn() }));
jest.mock('./update/devicePorts', () => ({
  installedVersion: jest.fn(async () => '1.0.0'),
  timedFetch: jest.fn(async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })),
}));

const H = 3600 * 1000;
const DAY = 24 * H;
const T0 = new Date(2026, 9, 24, 9, 0, 0).getTime(); // 24 Oct 2026, 09:00

let db: Db;
const handle = () => ({ db, path: '/x', close: () => undefined });

beforeEach(async () => {
  jest.clearAllMocks();
  setSession(null);
  db = await createTestDb();
  (loadBackupPassphrase as jest.Mock).mockResolvedValue('a good passphrase');
  (driveConfigured as jest.Mock).mockReturnValue(false);
  // A backup that works: it remembers when, like the real one.
  (runLocalBackup as jest.Mock).mockImplementation(async (d: Db) => {
    await setSetting(d, 'backup.lastOkAt', String((global as { __now?: number }).__now ?? 0));
    return { name: 'x', path: 'x', sizeBytes: 1 };
  });
  (uploadLatestToDrive as jest.Mock).mockImplementation(async (d: Db) => {
    await setSetting(d, 'drive.lastOkAt', String((global as { __now?: number }).__now ?? 0));
    return 'file';
  });
});

const at = async (ms: number) => {
  (global as { __now?: number }).__now = ms;
  await runAutoChecks(handle(), ms);
};

describe('the daily backup', () => {
  it('runs when it is due, not again the same day, and again after 24 hours', async () => {
    await at(T0);
    expect(runLocalBackup).toHaveBeenCalledTimes(1);
    await at(T0 + 2 * H);
    expect(runLocalBackup).toHaveBeenCalledTimes(1);
    await at(T0 + DAY + H);
    expect(runLocalBackup).toHaveBeenCalledTimes(2);
  });

  it('does nothing without a saved passphrase, and never for staff', async () => {
    (loadBackupPassphrase as jest.Mock).mockResolvedValueOnce(null);
    await at(T0);
    expect(runLocalBackup).not.toHaveBeenCalled();
    setSession({ id: 2, name: 'Bilal', role: 'staff' });
    await at(T0 + 3 * DAY);
    expect(runLocalBackup).not.toHaveBeenCalled();
    expect(loadBackupPassphrase).toHaveBeenCalledTimes(1); // staff never even looked
  });

  it('a failing backup does not stop the rest, and is tried again next time', async () => {
    (runLocalBackup as jest.Mock).mockRejectedValue(new Error('disk full'));
    await expect(at(T0)).resolves.toBeUndefined();
    await at(T0 + H);
    expect(runLocalBackup).toHaveBeenCalledTimes(2);
  });
});

describe('stock alerts', () => {
  it('are sent once a day, and staff get them too', async () => {
    await createItem(db, { name: 'Rice', baseUnit: 'g', reorderPoint: 1000 }, { qtyBase: 500, valuePaisa: 5000 });
    await at(T0);
    expect(notifyAlerts).toHaveBeenCalledTimes(1);
    expect((notifyAlerts as jest.Mock).mock.calls[0][0].join(' ')).toMatch(/Rice is low/);
    await at(T0 + 3 * H);
    expect(notifyAlerts).toHaveBeenCalledTimes(1);
    setSession({ id: 2, name: 'Bilal', role: 'staff' });
    await at(T0 + DAY + H);
    expect(notifyAlerts).toHaveBeenCalledTimes(2);
  });

  it('say nothing when there is nothing to say, but still count the day', async () => {
    await at(T0);
    expect(notifyAlerts).not.toHaveBeenCalled();
    expect(await getSetting(db, 'alerts.lastNotified')).toBe('2026-10-24');
  });
});

describe('Google Drive copies', () => {
  beforeEach(async () => {
    (driveConfigured as jest.Mock).mockReturnValue(true);
    await setSetting(db, 'drive.enabled', '1');
  });

  it('goes at most once a day, and tries again no sooner than an hour after a failure', async () => {
    await at(T0);
    expect(uploadLatestToDrive).toHaveBeenCalledTimes(1);
    await at(T0 + 5 * H);
    expect(uploadLatestToDrive).toHaveBeenCalledTimes(1); // done today
    await at(T0 + DAY + 2 * H);
    expect(uploadLatestToDrive).toHaveBeenCalledTimes(2);

    // Offline: the upload fails, and being opened again within the hour does not call Google again.
    (uploadLatestToDrive as jest.Mock).mockRejectedValue(new Error('offline'));
    const later = T0 + 3 * DAY;
    await at(later);
    await at(later + 10 * 60 * 1000);
    expect(uploadLatestToDrive).toHaveBeenCalledTimes(3);
    await at(later + 61 * 60 * 1000);
    expect(uploadLatestToDrive).toHaveBeenCalledTimes(4);
  });

  it('is skipped when Drive is not set up, or switched off', async () => {
    (driveConfigured as jest.Mock).mockReturnValue(false);
    await at(T0);
    (driveConfigured as jest.Mock).mockReturnValue(true);
    await setSetting(db, 'drive.enabled', '0');
    await at(T0 + 2 * DAY);
    expect(uploadLatestToDrive).not.toHaveBeenCalled();
  });
});

describe('the warning that backups keep failing', () => {
  it('appears once a day after two days of failures', async () => {
    const ms = (n: number) => T0 - n * DAY;
    await db.insert(schema.backupLog).values([
      { kind: 'local', status: 'failed', error: 'x', createdAt: ms(3) },
      { kind: 'local', status: 'failed', error: 'x', createdAt: ms(1) },
    ]);
    (loadBackupPassphrase as jest.Mock).mockResolvedValue(null); // no new attempts muddy the log
    await at(T0);
    expect(notifyBackupFailing).toHaveBeenCalledTimes(1);
    await at(T0 + 2 * H);
    expect(notifyBackupFailing).toHaveBeenCalledTimes(1);
  });
});
