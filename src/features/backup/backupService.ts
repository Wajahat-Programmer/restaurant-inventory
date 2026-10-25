import { eq, sql } from 'drizzle-orm';
import { Db, migrate, schema } from '../../db/client';
import { migrations } from '../../db/migrations.generated';
import { APP_ID, BACKUP_FORMAT, backupFileName, checkManifest, Manifest, retention } from '../../domain/backup';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from '../../domain/base64';
import { BackupError, decryptBackup, encryptBackup, looksLikeBackup } from '../../domain/crypto';

/** The database file behind a Db, so it can be copied, closed and swapped. */
export interface DbHandle {
  db: Db;
  path: string;
  close: () => void;
}

export interface Fs {
  mkdir: (dir: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  readDir: (dir: string) => Promise<{ name: string; isFile: boolean }[]>;
  readBase64: (path: string) => Promise<string>;
  writeBase64: (path: string, data: string) => Promise<void>;
  copy: (from: string, to: string) => Promise<void>;
  move: (from: string, to: string) => Promise<void>;
  /** Deletes a file or a folder with everything in it; missing is fine. */
  remove: (path: string) => Promise<void>;
  size: (path: string) => Promise<number>;
  sha256: (path: string) => Promise<string>;
}

export interface Zipper {
  zip: (sources: string[], target: string) => Promise<void>;
  unzip: (zipPath: string, targetDir: string) => Promise<void>;
}

export interface BackupPorts {
  fs: Fs;
  zip: Zipper;
  /** Opens a SQLite file at an absolute path. Does not migrate it. */
  openDbFile: (path: string) => Promise<DbHandle>;
  dirs: { backups: string; photos: string; work: string };
  appVersion: string;
  now: () => Date;
}

/** A backup bigger than this is refused: building it needs the whole file in memory. */
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export const SCHEMA_VERSION = migrations.length;

const join = (...p: string[]) => p.join('/').replace(/\/{2,}/g, '/');
const dirname = (p: string) => p.slice(0, p.lastIndexOf('/'));

export interface BackupInfo {
  name: string;
  path: string;
  sizeBytes: number;
}

export async function listBackups(ports: BackupPorts): Promise<BackupInfo[]> {
  if (!(await ports.fs.exists(ports.dirs.backups))) {
    return [];
  }
  const files = (await ports.fs.readDir(ports.dirs.backups)).filter(f => f.isFile && f.name.endsWith('.rimbak'));
  const out: BackupInfo[] = [];
  for (const f of files) {
    const path = join(ports.dirs.backups, f.name);
    out.push({ name: f.name, path, sizeBytes: await ports.fs.size(path) });
  }
  return out.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/**
 * Makes one encrypted backup file: a consistent copy of the database
 * (VACUUM INTO, so no need to stop the app), the photos, and a manifest with
 * the database checksum, zipped and sealed with AES-256-GCM.
 */
export async function createBackup(
  ports: BackupPorts,
  live: DbHandle,
  passphrase: string,
  opts: { iterations?: number } = {},
): Promise<BackupInfo> {
  const { fs, zip, dirs } = ports;
  const work = join(dirs.work, 'backup');
  await fs.remove(work);
  await fs.mkdir(work);
  try {
    const dbCopy = join(work, 'restaurant.db');
    await live.db.run(sql.raw(`VACUUM INTO '${dbCopy.replace(/'/g, "''")}'`));

    let photoCount = 0;
    const sources = [dbCopy];
    if (await fs.exists(dirs.photos)) {
      const photosCopy = join(work, 'photos');
      await fs.mkdir(photosCopy);
      for (const f of await fs.readDir(dirs.photos)) {
        if (f.isFile) {
          await fs.copy(join(dirs.photos, f.name), join(photosCopy, f.name));
          photoCount++;
        }
      }
      sources.push(photosCopy);
    }

    const manifest: Manifest = {
      app: APP_ID,
      format: BACKUP_FORMAT,
      appVersion: ports.appVersion,
      schemaVersion: SCHEMA_VERSION,
      createdAt: ports.now().toISOString(),
      dbSha256: await fs.sha256(dbCopy),
      photoCount,
    };
    const manifestPath = join(work, 'manifest.json');
    await fs.writeBase64(manifestPath, toBase64(utf8Encode(JSON.stringify(manifest))));
    sources.push(manifestPath);

    const zipPath = join(work, 'bundle.zip');
    await zip.zip(sources, zipPath);
    if ((await fs.size(zipPath)) > MAX_BACKUP_BYTES) {
      throw new Error('The data is too big to back up in one file (over 200 MB). Delete old photos first.');
    }

    const rawZip = fromBase64(await fs.readBase64(zipPath));
    const sealed = await encryptBackup(rawZip, passphrase, opts);
    await fs.mkdir(dirs.backups);
    const name = backupFileName(
      ports.now(),
      (await fs.readDir(dirs.backups)).map(f => f.name),
    );
    const path = join(dirs.backups, name);
    await fs.writeBase64(path, toBase64(sealed));
    return { name, path, sizeBytes: sealed.length };
  } finally {
    await fs.remove(work);
  }
}

/**
 * Deletes backups outside the 7 daily + 4 weekly rule. Returns what was removed.
 * Names in `keep` are never deleted: a restore passes the file it is about to
 * read, because the safety backup made just before it is newer and would
 * otherwise push that file out of its day.
 */
export async function pruneBackups(ports: BackupPorts, today: string, keep: string[] = []): Promise<string[]> {
  const files = await listBackups(ports);
  const remove = retention(files.map(f => f.name), today).remove.filter(name => !keep.includes(name));
  for (const name of remove) {
    await ports.fs.remove(join(ports.dirs.backups, name));
  }
  return remove;
}

export interface Restored {
  manifest: Manifest;
  /** The reopened live database. The caller must start using it. */
  handle: DbHandle;
}

async function readManifest(ports: BackupPorts, dir: string): Promise<Manifest> {
  let raw: unknown;
  try {
    raw = JSON.parse(utf8Decode(fromBase64(await ports.fs.readBase64(join(dir, 'manifest.json')))));
  } catch {
    throw new BackupError('not-a-backup', 'This backup has no readable details inside.');
  }
  const check = checkManifest(raw, SCHEMA_VERSION);
  if (!check.ok) {
    throw new BackupError('not-a-backup', check.message);
  }
  return check.manifest;
}

/**
 * Replaces the live data with a backup, without ever leaving the app with
 * nothing: the backup is decrypted, checked (checksum, version, SQLite's own
 * integrity check, migrations) as a separate staged file first. Only then are
 * the photos and the database swapped, with the old ones kept until the new
 * ones are confirmed, and put back if anything fails.
 */
export async function restoreBackup(
  ports: BackupPorts,
  live: DbHandle,
  filePath: string,
  passphrase: string,
): Promise<Restored> {
  const { fs, zip, dirs } = ports;

  const sealed = fromBase64(await fs.readBase64(filePath));
  if (!looksLikeBackup(sealed)) {
    throw new BackupError('not-a-backup', 'This is not a Restaurant Inventory backup file.');
  }
  const plain = await decryptBackup(sealed, passphrase); // wrong passphrase or damage stops here

  const work = join(dirs.work, 'restore');
  await fs.remove(work);
  await fs.mkdir(work);
  const dbDir = dirname(live.path);
  const staged = join(dbDir, 'restore-staged.db');
  const photosOld = `${dirs.photos}.old`;
  const dbOld = `${live.path}.old`;
  let photosSwapped = false;

  try {
    await fs.writeBase64(join(work, 'bundle.zip'), toBase64(plain));
    const unpacked = join(work, 'unpacked');
    await fs.mkdir(unpacked);
    await zip.unzip(join(work, 'bundle.zip'), unpacked);

    const manifest = await readManifest(ports, unpacked);
    const restoredDb = join(unpacked, 'restaurant.db');
    if (!(await fs.exists(restoredDb)) || (await fs.sha256(restoredDb)).toLowerCase() !== manifest.dbSha256.toLowerCase()) {
      throw new BackupError('not-a-backup', 'The data inside this backup does not match its checksum, so it was not restored.');
    }

    // Stage and prove the database before touching anything live.
    await fs.remove(staged);
    await fs.copy(restoredDb, staged);
    const check = await ports.openDbFile(staged);
    try {
      const rows = await check.db.all<[string]>(sql`pragma integrity_check`);
      if (rows.length !== 1 || rows[0][0] !== 'ok') {
        throw new BackupError('not-a-backup', 'The database inside this backup is damaged, so it was not restored.');
      }
      await migrate(check.db);
    } finally {
      check.close();
    }

    // Photos first: nothing else has changed yet if this fails.
    await fs.remove(photosOld);
    const restoredPhotos = join(unpacked, 'photos');
    if (await fs.exists(dirs.photos)) {
      await fs.move(dirs.photos, photosOld);
    }
    photosSwapped = true;
    if (await fs.exists(restoredPhotos)) {
      await fs.move(restoredPhotos, dirs.photos);
    } else {
      await fs.mkdir(dirs.photos);
    }

    // Then the database, keeping the old file until the new one opens.
    live.close();
    await fs.remove(`${live.path}-wal`);
    await fs.remove(`${live.path}-shm`);
    await fs.remove(dbOld);
    await fs.move(live.path, dbOld);
    await fs.move(staged, live.path);
    let handle: DbHandle;
    try {
      handle = await ports.openDbFile(live.path);
      await handle.db.select().from(schema.items).limit(1); // it opens and reads
      await rebasePhotoPaths(handle.db, dirs.photos);
    } catch (e) {
      await fs.remove(live.path);
      await fs.move(dbOld, live.path);
      throw e;
    }
    await fs.remove(dbOld);
    await fs.remove(photosOld);
    return { manifest, handle };
  } catch (e) {
    if (photosSwapped) {
      // Put the previous photos back.
      await fs.remove(dirs.photos);
      if (await fs.exists(photosOld)) {
        await fs.move(photosOld, dirs.photos);
      }
    }
    await fs.remove(staged);
    throw e;
  } finally {
    await fs.remove(work);
  }
}

/**
 * Photo rows store full paths, which differ if the data is restored on another
 * phone. Point each at this phone's photos folder, keeping the file name.
 */
export async function rebasePhotoPaths(db: Db, photosDir: string): Promise<void> {
  const name = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  for (const r of await db.select().from(schema.itemPhotos)) {
    await db
      .update(schema.itemPhotos)
      .set({
        originalPath: join(photosDir, name(r.originalPath)),
        cutoutPath: r.cutoutPath ? join(photosDir, name(r.cutoutPath)) : null,
        thumbPath: join(photosDir, name(r.thumbPath)),
      })
      .where(eq(schema.itemPhotos.id, r.id));
  }
}
