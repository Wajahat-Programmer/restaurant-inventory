import { open } from '@op-engineering/op-sqlite';
import { createDb, Db, migrate, SqlExecutor } from './client';

/** The only file that imports the native SQLite module. */
export async function openAppDb(name = 'restaurant.db'): Promise<Db> {
  const conn = open({ name });
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
  const db = createDb(exec);
  await migrate(db);
  return db;
}
