import { open } from '@op-engineering/op-sqlite';
import type { DbHandle } from '../features/backup/backupService';
import { createDb, migrate, SqlExecutor } from './client';

/** The only file that imports the native SQLite module. */
async function connect(name: string, location?: string): Promise<DbHandle> {
  const conn = open(location ? { name, location } : { name });
  // A JS reload mid-transaction can leave the cached native connection inside
  // an open transaction. Roll it back so the next run starts clean. (A real
  // process kill needs no help: SQLite rolls back on its own.)
  await conn.execute('ROLLBACK').catch(() => undefined);
  await conn.execute('PRAGMA foreign_keys = ON');
  const exec: SqlExecutor = async (query, params, method) => {
    const { rawRows } = await conn.executeRaw(query, params as never[]);
    if (method === 'run') {
      return { rows: [] };
    }
    if (method === 'get') {
      return { rows: (rawRows[0] ?? []) as unknown[] };
    }
    return { rows: rawRows as unknown[][] };
  };
  return { db: createDb(exec), path: conn.getDbPath(), close: () => conn.close() };
}

/** The app's own database, migrated and ready. */
export async function openAppDb(name = 'restaurant.db'): Promise<DbHandle> {
  const handle = await connect(name);
  await migrate(handle.db);
  return handle;
}

/** Any SQLite file by absolute path, for checking a restored backup. Not migrated. */
export async function openDbFile(path: string): Promise<DbHandle> {
  const cut = path.lastIndexOf('/');
  return connect(path.slice(cut + 1), path.slice(0, cut));
}
