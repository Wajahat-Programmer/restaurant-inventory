import { open } from '@op-engineering/op-sqlite';
import { createDb, Db, migrate, SqlExecutor } from './client';

/** The only file that imports the native SQLite module. */
export async function openAppDb(name = 'restaurant.db'): Promise<Db> {
  const conn = open({ name });
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
  const db = createDb(exec);
  await migrate(db);
  return db;
}
