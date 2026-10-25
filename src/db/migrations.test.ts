import { sql } from 'drizzle-orm';
import { Db, migrate, schema } from './client';
import { migrations } from './migrations.generated';
import { createTestDb } from './testing';

/** Raw rows come back as arrays through the proxy driver; tag is column 0. */
async function appliedTags(db: Db): Promise<string[]> {
  const rows = await db.all<string[]>(sql`select tag from __migrations order by applied_at, tag`);
  return rows.map(r => r[0]);
}

describe('migrations', () => {
  it('upgrades a database created by the first version without losing data', async () => {
    expect(migrations.length).toBeGreaterThanOrEqual(2);
    const db = await createTestDb(1); // schema as first shipped

    await db.run(sql`insert into items (name, base_unit) values ('Rice', 'g')`);
    await db.run(sql`insert into suppliers (name) values ('Al-Noor')`);
    await db.run(
      sql`insert into item_prices (item_id, supplier_id, price_per_base, effective_date) values (1, 1, 20, '2026-10-01')`,
    );

    await migrate(db);

    const prices = await db
      .select({ price: schema.itemPrices.pricePerBase, purchaseId: schema.itemPrices.purchaseId })
      .from(schema.itemPrices);
    expect(prices).toEqual([{ price: 20, purchaseId: null }]);
    expect(await appliedTags(db)).toEqual(migrations.map(m => m.tag));
  });

  it('backfills the cash book from purchases and payments made before it existed', async () => {
    const db = await createTestDb(2); // schema as of M1
    await db.run(sql`insert into suppliers (name) values ('Al-Noor')`);
    await db.run(sql`insert into purchases (supplier_id, date, total_paisa, paid_paisa, status) values (1, '2026-10-01', 9000, 5000, 'POSTED')`);
    await db.run(sql`insert into purchases (supplier_id, date, total_paisa, paid_paisa, status) values (1, '2026-10-02', 9000, 7000, 'VOID')`);
    await db.run(sql`insert into purchases (supplier_id, date, total_paisa, paid_paisa, status) values (1, '2026-10-03', 9000, 0, 'POSTED')`);
    await db.run(sql`insert into supplier_payments (supplier_id, date, amount_paisa, method) values (1, '2026-10-04', 300, 'bank')`);

    await migrate(db);

    const rows = await db
      .select({
        date: schema.cashEntries.date,
        direction: schema.cashEntries.direction,
        amount: schema.cashEntries.amountPaisa,
        source: schema.cashEntries.source,
        method: schema.cashEntries.method,
      })
      .from(schema.cashEntries)
      .orderBy(schema.cashEntries.date);
    // The voided and the unpaid purchase add nothing.
    expect(rows).toEqual([
      { date: '2026-10-01', direction: 'OUT', amount: 5000, source: 'purchase', method: 'cash' },
      { date: '2026-10-04', direction: 'OUT', amount: 300, source: 'supplier_payment', method: 'bank' },
    ]);
  });

  it('is safe to run again and applies each migration once', async () => {
    const db = await createTestDb();
    await migrate(db);
    await migrate(db);
    expect(await appliedTags(db)).toHaveLength(migrations.length);
  });

  it('a failing migration rolls back completely and is not recorded', async () => {
    const db = await createTestDb(1);
    // Force a failure on the next migration by pre-creating its new column.
    await db.run(sql`alter table item_prices add column purchase_id integer`);
    await expect(migrate(db)).rejects.toThrow();
    expect(await appliedTags(db)).toEqual([migrations[0].tag]);
  });
});
