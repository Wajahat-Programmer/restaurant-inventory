import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { drizzle, SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrations } from './migrations.generated';
import * as schema from './schema';

export { schema };

/**
 * The app talks to SQLite through this one async function, so the same code
 * runs on op-sqlite (device) and better-sqlite3 (Jest). Drizzle's sqlite-proxy
 * driver awaits transaction callbacks; its op-sqlite driver does not.
 * Rows come back as arrays of column values.
 */
export type SqlExecutor = (
  query: string,
  params: unknown[],
  method: 'run' | 'all' | 'get' | 'values',
) => Promise<{ rows: unknown[] | unknown[][] }>;

export type Db = SqliteRemoteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Anything that can run queries: the db or a transaction. */
export type Queryable = Db | Tx;

export function createDb(exec: SqlExecutor): Db {
  return drizzle(
    async (query, params, method) => {
      const r = await exec(query, params, method);
      return { rows: r.rows as any[] };
    },
    { schema },
  );
}

/** Bookkeeping table, kept out of schema.ts so drizzle-kit never migrates it. */
const appliedMigrations = sqliteTable('__migrations', {
  tag: text('tag').primaryKey(),
  appliedAt: integer('applied_at').notNull(),
});

/**
 * Applies pending migrations in order, each in its own transaction, recording
 * them in __migrations. Safe to call on every launch.
 */
export async function migrate(db: Db, upTo = migrations.length): Promise<void> {
  await db.run(
    sql`create table if not exists __migrations (tag text primary key, applied_at integer not null)`,
  );
  // Typed select, not db.all(): the proxy driver returns raw arrays for the latter.
  const done = new Set(
    (await db.select({ tag: appliedMigrations.tag }).from(appliedMigrations)).map(
      r => r.tag,
    ),
  );
  for (const m of migrations.slice(0, upTo)) {
    if (done.has(m.tag)) {
      continue;
    }
    await db.transaction(async tx => {
      for (const stmt of m.statements) {
        await tx.run(sql.raw(stmt));
      }
      await tx
        .insert(appliedMigrations)
        .values({ tag: m.tag, appliedAt: Date.now() });
    });
  }
}

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` in one transaction, one at a time. A single connection cannot
 * interleave two transactions, so writes are queued behind each other.
 * Everything inside either commits together or rolls back together.
 */
export function inTransaction<T>(
  db: Db,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const run = chain.then(() => db.transaction(fn));
  chain = run.catch(() => undefined);
  return run;
}
