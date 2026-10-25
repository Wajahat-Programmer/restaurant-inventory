import Database from 'better-sqlite3';
import { createDb, Db, migrate, SqlExecutor } from './client';

/** Fresh in-memory database with all migrations applied. Tests only. */
export async function createTestDb(): Promise<Db> {
  const sqlite = new Database(':memory:');
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
  await migrate(db);
  return db;
}
