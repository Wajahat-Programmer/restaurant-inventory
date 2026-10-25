import { promises as fsp } from 'fs';
import { eq } from 'drizzle-orm';
import { schema } from '../../db/client';
import { createItem } from '../../services/itemService';
import { setSession } from '../../services/session';
import { makeTempDir, nodeFs, nodePorts, openDbFile } from '../../../test-utils/nodePorts';
import { BackupPorts, DbHandle, listBackups, restoreBackup } from './backupService';
import { backupStatus, runLocalBackup } from './runBackup';

let root: string;
let ports: BackupPorts;
let live: DbHandle;

beforeEach(async () => {
  setSession(null);
  root = await makeTempDir();
  ports = nodePorts(root);
  await nodeFs.mkdir(`${root}/live`);
  live = await openDbFile(`${root}/live/restaurant.db`, { migrated: true });
});
afterEach(async () => {
  live.close();
  await fsp.rm(root, { recursive: true, force: true });
});

describe('runLocalBackup', () => {
  it('makes the file, logs it, remembers when it worked, and records who did it', async () => {
    await createItem(live.db, { name: 'Rice', baseUnit: 'g' });
    const info = await runLocalBackup(live.db, ports, live, 'a good passphrase', '2026-10-25');
    expect(info.name).toBe('restaurant-2026-10-25-213000.rimbak');
    const [row] = await live.db.select().from(schema.backupLog);
    expect(row).toMatchObject({ kind: 'local', status: 'ok', fileName: info.name, sizeBytes: info.sizeBytes });
    const status = await backupStatus(live.db, ports.now().getTime());
    expect(status.lastOkAt).toBe(ports.now().getTime());
    expect(status.failingTwoDays).toBe(false);
    expect((await live.db.select().from(schema.auditLog)).map(a => a.action)).toContain('backup.create');
  });

  it('logs a failure, leaves no half-made file, and says what went wrong', async () => {
    const broken: BackupPorts = {
      ...ports,
      zip: {
        zip: async () => {
          throw new Error('disk full');
        },
        unzip: ports.zip.unzip,
      },
    };
    await expect(runLocalBackup(live.db, broken, live, 'a good passphrase', '2026-10-25')).rejects.toThrow('The backup did not work: disk full');
    const [row] = await live.db.select().from(schema.backupLog);
    expect(row).toMatchObject({ status: 'failed', error: 'disk full' });
    expect(await nodeFs.exists(`${ports.dirs.backups}`)).toBe(false);
    expect(await nodeFs.exists(`${ports.dirs.work}/backup`)).toBe(false);
    const status = await backupStatus(live.db, ports.now().getTime());
    expect(status.lastOkAt).toBeNull();
    expect(status.lastAttempt).toMatchObject({ ok: false, error: 'disk full' });
  });

  it('warns after two days of failures, and a success clears it', async () => {
    const DAY = 24 * 3600 * 1000;
    const now = ports.now().getTime();
    await live.db.insert(schema.backupLog).values([
      { kind: 'local', status: 'failed', error: 'x', createdAt: now - 3 * DAY },
      { kind: 'local', status: 'failed', error: 'x', createdAt: now - 1 * DAY },
    ]);
    expect((await backupStatus(live.db, now)).failingTwoDays).toBe(true);
    await live.db.insert(schema.backupLog).values({ kind: 'local', status: 'ok', fileName: 'f', createdAt: now - 100 });
    expect((await backupStatus(live.db, now)).failingTwoDays).toBe(false);
  });

  it('prunes old backups as part of the run', async () => {
    await nodeFs.mkdir(ports.dirs.backups);
    await fsp.writeFile(`${ports.dirs.backups}/restaurant-2026-08-01-0900.rimbak`, 'old');
    await runLocalBackup(live.db, ports, live, 'a good passphrase', '2026-10-25');
    expect(await fsp.readdir(ports.dirs.backups)).toEqual(['restaurant-2026-10-25-213000.rimbak']);
  });

  it('the safety backup before a restore never deletes the backup being restored', async () => {
    // Two backups on the same day: the newer one would normally push the older out.
    let clock = new Date(2026, 9, 25, 9, 0, 0);
    const timed: BackupPorts = { ...ports, now: () => clock };
    await createItem(live.db, { name: 'Rice', baseUnit: 'g' });
    const wanted = await runLocalBackup(live.db, timed, live, 'a good passphrase', '2026-10-25');
    await createItem(live.db, { name: 'Oil', baseUnit: 'ml' });
    clock = new Date(2026, 9, 25, 21, 0, 0);

    const safety = await runLocalBackup(live.db, timed, live, 'a good passphrase', '2026-10-25', { keep: [wanted.name] });
    expect((await listBackups(timed)).map(b => b.name).sort()).toEqual([wanted.name, safety.name].sort());

    const r = await restoreBackup(timed, live, wanted.path, 'a good passphrase');
    const names = (await r.handle.db.select().from(schema.items)).map(i => i.name);
    expect(names).toEqual(['Rice']);
    r.handle.close();
  });

  it('without keep, the newer backup of the same day replaces the older one (the normal rule)', async () => {
    let clock = new Date(2026, 9, 25, 9, 0, 0);
    const timed: BackupPorts = { ...ports, now: () => clock };
    const first = await runLocalBackup(live.db, timed, live, 'a good passphrase', '2026-10-25');
    clock = new Date(2026, 9, 25, 21, 0, 0);
    const second = await runLocalBackup(live.db, timed, live, 'a good passphrase', '2026-10-25');
    expect((await listBackups(timed)).map(b => b.name)).toEqual([second.name]);
    expect(first.name).not.toBe(second.name);
  });

  it('only the owner can back up', async () => {
    setSession({ id: 1, name: 'Bilal', role: 'staff' });
    await expect(runLocalBackup(live.db, ports, live, 'a good passphrase', '2026-10-25')).rejects.toThrow('Only the owner');
    expect(await live.db.select().from(schema.backupLog).where(eq(schema.backupLog.status, 'failed'))).toEqual([]);
  });
});
