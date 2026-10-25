import { promises as fsp } from 'fs';
import { Db, schema } from '../../db/client';
import { toBase64, utf8Encode } from '../../domain/base64';
import { APP_ID, Manifest } from '../../domain/backup';
import { BackupError, encryptBackup } from '../../domain/crypto';
import { createItem, listItems } from '../../services/itemService';
import { attachPhoto, listPhotos } from '../../services/photoService';
import { createSupplier, postPurchase } from '../../services/purchaseService';
import { fakeZip, makeTempDir, nodeFs, nodePorts, openDbFile } from '../../../test-utils/nodePorts';
import {
  BackupPorts,
  createBackup,
  DbHandle,
  listBackups,
  pruneBackups,
  restoreBackup,
  SCHEMA_VERSION,
} from './backupService';

const PASS = 'a good passphrase';
const FAST = { iterations: 1000 };

let root: string;
let ports: BackupPorts;
let live: DbHandle;

beforeEach(async () => {
  root = await makeTempDir();
  ports = nodePorts(root);
  await nodeFs.mkdir(`${root}/live`);
  await nodeFs.mkdir(ports.dirs.photos);
  live = await openDbFile(`${root}/live/restaurant.db`, { migrated: true });
});
afterEach(async () => {
  try {
    live.close();
  } catch {
    // already closed by a restore
  }
  await fsp.rm(root, { recursive: true, force: true });
});

const photoFile = async (name: string, text: string) => fsp.writeFile(`${ports.dirs.photos}/${name}`, text);
const photoText = async (name: string) => fsp.readFile(`${ports.dirs.photos}/${name}`, 'utf8');

/** A small restaurant: items, a purchase, and a photo that really exists on disk. */
async function seed(db: Db) {
  const rice = await createItem(db, { name: 'Rice', baseUnit: 'g' });
  await createItem(db, { name: 'Oil', baseUnit: 'ml' }, { qtyBase: 2000, valuePaisa: 40000 });
  const sup = await createSupplier(db, { name: 'Al-Noor' });
  await postPurchase(db, { supplierId: sup, date: '2026-10-25', lines: [{ itemId: rice, qtyBase: 10000, totalPaisa: 100000 }], paidPaisa: 0 });
  await photoFile('item-1-5.jpg', 'ORIGINAL-BYTES');
  await photoFile('item-1-5-thumb.webp', 'THUMB-BYTES');
  await attachPhoto(db, rice, {
    originalPath: `${ports.dirs.photos}/item-1-5.jpg`,
    cutoutPath: null,
    thumbPath: `${ports.dirs.photos}/item-1-5-thumb.webp`,
    width: 10,
    height: 10,
  });
  return rice;
}

const snapshot = async (db: Db) => (await listItems(db, { includeInactive: true })).map(i => [i.name, i.qtyBase, i.valuePaisa]);

describe('backup then restore', () => {
  it('restores the data, the photos and the photo links after the phone has changed', async () => {
    await seed(live.db);
    const before = await snapshot(live.db);
    const info = await createBackup(ports, live, PASS, FAST);
    expect(info.name).toBe('restaurant-2026-10-25-213000.rimbak');
    expect(info.sizeBytes).toBeGreaterThan(1000);

    // The phone loses its data: different items, no photos.
    await createItem(live.db, { name: 'Intruder', baseUnit: 'g' });
    await fsp.rm(ports.dirs.photos, { recursive: true });
    await nodeFs.mkdir(ports.dirs.photos);
    await photoFile('unrelated.txt', 'KEEP-ME-OUT');

    const restored = await restoreBackup(ports, live, info.path, PASS);
    expect(await snapshot(restored.handle.db)).toEqual(before);
    expect(restored.manifest).toMatchObject({ app: 'restaurant-inventory', schemaVersion: SCHEMA_VERSION, photoCount: 2 });
    expect(await photoText('item-1-5.jpg')).toBe('ORIGINAL-BYTES');
    expect(await photoText('item-1-5-thumb.webp')).toBe('THUMB-BYTES');
    await expect(photoText('unrelated.txt')).rejects.toThrow();
    const [p] = await listPhotos(restored.handle.db, 1);
    expect(p.thumbPath).toBe(`${ports.dirs.photos}/item-1-5-thumb.webp`);
    restored.handle.close();
    // No leftovers from the swap.
    expect(await nodeFs.exists(`${live.path}.old`)).toBe(false);
    expect(await nodeFs.exists(`${ports.dirs.photos}.old`)).toBe(false);
    expect(await nodeFs.exists(`${root}/live/restore-staged.db`)).toBe(false);
    expect(await nodeFs.exists(ports.dirs.work + '/restore')).toBe(false);
  });

  it('a safety backup taken in the same second cannot overwrite the backup being restored', async () => {
    await seed(live.db);
    const original = await createBackup(ports, live, PASS, FAST);
    const before = await fsp.readFile(original.path);
    await createItem(live.db, { name: 'Added after', baseUnit: 'g' });
    // The app takes a safety copy of the current data right before restoring.
    const safety = await createBackup(ports, live, PASS, FAST);
    expect(safety.path).not.toBe(original.path);
    expect(Buffer.compare(await fsp.readFile(original.path), before)).toBe(0);
    const r = await restoreBackup(ports, live, original.path, PASS);
    expect((await snapshot(r.handle.db)).map(x => x[0]).sort()).toEqual(['Oil', 'Rice']); // no "Added after"
    r.handle.close();
  });

  it('the backup file holds no readable data', async () => {
    await seed(live.db);
    const info = await createBackup(ports, live, PASS, FAST);
    const bytes = await fsp.readFile(info.path);
    for (const secret of ['Rice', 'Al-Noor', 'ORIGINAL-BYTES', 'SQLite format']) {
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
    }
  });

  it('works when there are no photos at all', async () => {
    await createItem(live.db, { name: 'Rice', baseUnit: 'g' });
    await fsp.rm(ports.dirs.photos, { recursive: true });
    const info = await createBackup(ports, live, PASS, FAST);
    const r = await restoreBackup(ports, live, info.path, PASS);
    expect((await snapshot(r.handle.db)).map(x => x[0])).toEqual(['Rice']);
    expect(await nodeFs.exists(ports.dirs.photos)).toBe(true);
    r.handle.close();
  });

  it('leaves no working files behind after a backup', async () => {
    await seed(live.db);
    await createBackup(ports, live, PASS, FAST);
    expect(await nodeFs.exists(`${ports.dirs.work}/backup`)).toBe(false);
  });
});

describe('a bad restore changes nothing', () => {
  async function backedUp() {
    await seed(live.db);
    const info = await createBackup(ports, live, PASS, FAST);
    await createItem(live.db, { name: 'Added later', baseUnit: 'g' });
    await photoFile('later.jpg', 'LATER');
    return info;
  }
  const untouched = async () => {
    expect((await snapshot(live.db)).map(x => x[0]).sort()).toEqual(['Added later', 'Oil', 'Rice']);
    expect(await photoText('later.jpg')).toBe('LATER');
    expect(await nodeFs.exists(`${ports.dirs.photos}.old`)).toBe(false);
  };

  it('a wrong passphrase', async () => {
    const info = await backedUp();
    await expect(restoreBackup(ports, live, info.path, 'not the passphrase')).rejects.toThrow('Wrong passphrase');
    await untouched();
  });

  it('a damaged file', async () => {
    const info = await backedUp();
    const bytes = await fsp.readFile(info.path);
    bytes[bytes.length - 20] = (bytes[bytes.length - 20] + 1) % 256;
    await fsp.writeFile(info.path, bytes);
    await expect(restoreBackup(ports, live, info.path, PASS)).rejects.toBeInstanceOf(BackupError);
    await untouched();
  });

  it('a file that is not a backup', async () => {
    await backedUp();
    await fsp.writeFile(`${root}/holiday.rimbak`, 'x'.repeat(500));
    await expect(restoreBackup(ports, live, `${root}/holiday.rimbak`, PASS)).rejects.toThrow('not a Restaurant Inventory backup');
    await untouched();
  });

  /** A well-formed, correctly encrypted backup with whatever manifest and database we choose. */
  async function craft(manifest: Partial<Manifest>, mutateDb?: (path: string) => Promise<void>) {
    const dir = `${root}/craft`;
    await nodeFs.mkdir(dir);
    const dbPath = `${dir}/restaurant.db`;
    const h = await openDbFile(dbPath, { migrated: true });
    await createItem(h.db, { name: 'Crafted', baseUnit: 'g' });
    h.close();
    if (mutateDb) {
      await mutateDb(dbPath);
    }
    const full: Manifest = {
      app: APP_ID,
      format: 1,
      appVersion: '9.9.9',
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      dbSha256: await nodeFs.sha256(dbPath),
      photoCount: 0,
      ...manifest,
    };
    await nodeFs.writeBase64(`${dir}/manifest.json`, toBase64(utf8Encode(JSON.stringify(full))));
    await fakeZip.zip([dbPath, `${dir}/manifest.json`], `${dir}/bundle.zip`);
    const file = `${root}/crafted.rimbak`;
    await fsp.writeFile(file, encryptBackup(await fsp.readFile(`${dir}/bundle.zip`), PASS, FAST));
    return file;
  }

  it('data that does not match its checksum', async () => {
    await backedUp();
    const file = await craft({ dbSha256: 'f'.repeat(64) });
    await expect(restoreBackup(ports, live, file, PASS)).rejects.toThrow('does not match its checksum');
    await untouched();
  });

  it('a backup from a newer version of the app', async () => {
    await backedUp();
    const file = await craft({ schemaVersion: SCHEMA_VERSION + 1 });
    await expect(restoreBackup(ports, live, file, PASS)).rejects.toThrow('newer version');
    await untouched();
  });

  it('a backup of someone elses app', async () => {
    await backedUp();
    const file = await craft({ app: 'other-app' as never });
    await expect(restoreBackup(ports, live, file, PASS)).rejects.toThrow('not from Restaurant Inventory');
    await untouched();
  });

  it('a database that fails its integrity check', async () => {
    await backedUp();
    const file = await craft({}, async p => {
      const bytes = await fsp.readFile(p);
      bytes.fill(0xff, 4096, 8192); // scribble over a page of data
      await fsp.writeFile(p, bytes);
    });
    // The checksum is of the damaged file, so it passes; SQLite's own check must catch it.
    await expect(restoreBackup(ports, live, file, PASS)).rejects.toThrow();
    await untouched();
  });

  it('puts everything back if the restored database cannot be opened afterwards', async () => {
    const info = await backedUp();
    let opens = 0;
    const flaky: BackupPorts = {
      ...ports,
      openDbFile: async p => {
        // 1st open = the staged check, 2nd = the live file after the swap.
        if (++opens === 2) {
          throw new Error('cannot open');
        }
        return openDbFile(p);
      },
    };
    await expect(restoreBackup(flaky, live, info.path, PASS)).rejects.toThrow('cannot open');
    const reopened = await openDbFile(live.path);
    expect((await snapshot(reopened.db)).map(x => x[0]).sort()).toEqual(['Added later', 'Oil', 'Rice']);
    reopened.close();
    expect(await photoText('later.jpg')).toBe('LATER');
  });
});

describe('older backups', () => {
  it('a backup made before later migrations is brought up to date and keeps its data', async () => {
    const dir = `${root}/old`;
    await nodeFs.mkdir(dir);
    const dbPath = `${dir}/restaurant.db`;
    const h = await openDbFile(dbPath, { migrated: 1 }); // first version of the schema only
    await h.db.insert(schema.items).values({ name: 'Old rice', baseUnit: 'g' });
    h.close();
    const manifest: Manifest = {
      app: APP_ID,
      format: 1,
      appVersion: '0.1.0',
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      dbSha256: await nodeFs.sha256(dbPath),
      photoCount: 0,
    };
    await nodeFs.writeBase64(`${dir}/manifest.json`, toBase64(utf8Encode(JSON.stringify(manifest))));
    await fakeZip.zip([dbPath, `${dir}/manifest.json`], `${dir}/bundle.zip`);
    const file = `${root}/old.rimbak`;
    await fsp.writeFile(file, encryptBackup(await fsp.readFile(`${dir}/bundle.zip`), PASS, FAST));

    const r = await restoreBackup(ports, live, file, PASS);
    expect((await snapshot(r.handle.db)).map(x => x[0])).toEqual(['Old rice']);
    // The newest tables exist, so the app can use it straight away.
    expect(await r.handle.db.select().from(schema.cashEntries)).toEqual([]);
    expect(await r.handle.db.select().from(schema.users)).toEqual([]);
    r.handle.close();
  });
});

describe('listing and pruning', () => {
  it('lists newest first, with sizes, and ignores other files', async () => {
    await nodeFs.mkdir(ports.dirs.backups);
    for (const n of ['restaurant-2026-10-23-0900.rimbak', 'restaurant-2026-10-25-0900.rimbak', 'notes.txt']) {
      await fsp.writeFile(`${ports.dirs.backups}/${n}`, 'abc');
    }
    const list = await listBackups(ports);
    expect(list.map(b => b.name)).toEqual(['restaurant-2026-10-25-0900.rimbak', 'restaurant-2026-10-23-0900.rimbak']);
    expect(list[0].sizeBytes).toBe(3);
    expect(await listBackups(nodePorts(`${root}/nowhere`))).toEqual([]);
  });

  it('removes only the backups that fall outside the 7 daily and 4 weekly rule', async () => {
    await nodeFs.mkdir(ports.dirs.backups);
    const names = ['restaurant-2026-10-25-0900.rimbak', 'restaurant-2026-10-25-2100.rimbak', 'restaurant-2026-08-01-0900.rimbak', 'keep-me.txt'];
    for (const n of names) {
      await fsp.writeFile(`${ports.dirs.backups}/${n}`, 'x');
    }
    expect(await pruneBackups(ports, '2026-10-25')).toEqual(['restaurant-2026-10-25-0900.rimbak', 'restaurant-2026-08-01-0900.rimbak']);
    expect((await fsp.readdir(ports.dirs.backups)).sort()).toEqual(['keep-me.txt', 'restaurant-2026-10-25-2100.rimbak']);
  });
});
