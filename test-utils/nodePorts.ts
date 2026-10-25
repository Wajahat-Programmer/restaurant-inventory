import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDb, migrate, SqlExecutor } from '../src/db/client';
import { BackupPorts, DbHandle, Fs, Zipper } from '../src/features/backup/backupService';

/** Real files on the real disk (a temp folder), for backup tests. */
export const nodeFs: Fs = {
  mkdir: async d => {
    await fsp.mkdir(d, { recursive: true });
  },
  exists: async p => {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  },
  readDir: async d => (await fsp.readdir(d, { withFileTypes: true })).map(e => ({ name: e.name, isFile: e.isFile() })),
  readBase64: async p => (await fsp.readFile(p)).toString('base64'),
  writeBase64: async (p, data) => fsp.writeFile(p, Buffer.from(data, 'base64')),
  copy: async (a, b) => fsp.copyFile(a, b),
  move: async (a, b) => fsp.rename(a, b),
  remove: async p => fsp.rm(p, { recursive: true, force: true }),
  size: async p => (await fsp.stat(p)).size,
  sha256: async p => createHash('sha256').update(await fsp.readFile(p)).digest('hex'),
};

interface Entry {
  rel: string;
  b64: string;
}

async function collect(path: string, rel: string, out: Entry[]): Promise<void> {
  const st = await fsp.stat(path);
  if (st.isDirectory()) {
    for (const name of await fsp.readdir(path)) {
      await collect(join(path, name), `${rel}/${name}`, out);
    }
  } else {
    out.push({ rel, b64: (await fsp.readFile(path)).toString('base64') });
  }
}

/**
 * Stand-in for the zip library: one JSON file holding every file. The backup
 * logic only needs "pack these paths" and "unpack them again".
 */
export const fakeZip: Zipper = {
  async zip(sources, target) {
    const entries: Entry[] = [];
    for (const s of sources) {
      await collect(s, s.slice(s.lastIndexOf('/') + 1).replace(/^.*[\\]/, ''), entries);
    }
    await fsp.writeFile(target, JSON.stringify(entries));
  },
  async unzip(zipPath, targetDir) {
    const entries = JSON.parse(await fsp.readFile(zipPath, 'utf8')) as Entry[];
    for (const e of entries) {
      const to = join(targetDir, e.rel);
      await fsp.mkdir(join(to, '..'), { recursive: true });
      await fsp.writeFile(to, Buffer.from(e.b64, 'base64'));
    }
  },
};

/** Opens (and creates) a SQLite file; `migrated` applies the migrations. */
export async function openDbFile(path: string, opts: { migrated?: boolean | number } = {}): Promise<DbHandle> {
  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  const exec: SqlExecutor = async (query, params, method) => {
    const stmt = sqlite.prepare(query);
    if (method === 'run') {
      stmt.run(...params);
      return { rows: [] };
    }
    stmt.raw(true);
    if (method === 'get') {
      const row = stmt.get(...params);
      return { rows: row ? (row as unknown[]) : [] };
    }
    return { rows: stmt.all(...params) as unknown[][] };
  };
  const db = createDb(exec);
  if (opts.migrated) {
    await migrate(db, typeof opts.migrated === 'number' ? opts.migrated : undefined);
  }
  return { db, path: path.replace(/\\/g, '/'), close: () => sqlite.close() };
}

export async function makeTempDir(): Promise<string> {
  return (await fsp.mkdtemp(join(tmpdir(), 'ri-backup-'))).replace(/\\/g, '/');
}

export function nodePorts(root: string, over: Partial<BackupPorts> = {}): BackupPorts {
  return {
    fs: nodeFs,
    zip: fakeZip,
    openDbFile: p => openDbFile(p),
    dirs: { backups: `${root}/backups`, photos: `${root}/photos`, work: `${root}/work` },
    appVersion: '1.0.0',
    now: () => new Date(2026, 9, 25, 21, 30),
    ...over,
  };
}
