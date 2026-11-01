import { createTestDb } from './testing';
import { exclusive, inTransaction, schema, writesIdle } from './client';

describe('the write queue', () => {
  it('a read waits for a write that is in progress, so it never sees half of it', async () => {
    const db = await createTestDb();
    let release!: () => void;
    const hold = new Promise<void>(r => (release = r));
    const seen: string[] = [];

    const write = inTransaction(db, async tx => {
      await tx.insert(schema.categories).values({ name: 'Half done' });
      seen.push('written, not committed');
      await hold;
      seen.push('committing');
    });
    const read = writesIdle().then(async () => {
      seen.push('read');
      return db.select().from(schema.categories);
    });

    await new Promise(r => setTimeout(r, 20));
    expect(seen).toEqual(['written, not committed']); // the read has not started
    release();
    const rows = await read;
    await write;
    expect(seen).toEqual(['written, not committed', 'committing', 'read']);
    expect(rows.map(r => r.name)).toEqual(['Half done']);
  });

  it('an exclusive job runs between writes, never inside one', async () => {
    const db = await createTestDb();
    const order: string[] = [];
    const first = inTransaction(db, async tx => {
      await tx.insert(schema.categories).values({ name: 'A' });
      await new Promise(r => setTimeout(r, 15));
      order.push('first write done');
    });
    const job = exclusive(async () => {
      order.push('exclusive');
    });
    const second = inTransaction(db, async () => {
      order.push('second write');
    });
    await Promise.all([first, job, second]);
    expect(order).toEqual(['first write done', 'exclusive', 'second write']);
  });

  it('a failed write does not block the ones after it', async () => {
    const db = await createTestDb();
    await expect(inTransaction(db, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(inTransaction(db, async () => 5)).resolves.toBe(5);
    await expect(writesIdle()).resolves.toBeUndefined();
  });
});
