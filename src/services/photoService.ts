import { and, desc, eq } from 'drizzle-orm';
import { Db, inTransaction, Queryable, schema } from '../db/client';
import { must, ValidationError } from './errors';

const { itemPhotos } = schema;

export interface PhotoFiles {
  originalPath: string;
  /** Null when segmentation was unavailable and the cropped original is used. */
  cutoutPath: string | null;
  thumbPath: string;
  width: number;
  height: number;
}

export interface PhotoRow extends PhotoFiles {
  id: number;
  itemId: number;
  isPrimary: boolean;
}

/** Records a captured photo. The first photo of an item becomes its primary. */
export async function attachPhoto(
  db: Db,
  itemId: number,
  files: PhotoFiles,
): Promise<number> {
  if (!files.originalPath || !files.thumbPath) {
    throw new ValidationError('Photo files are missing');
  }
  return inTransaction(db, async tx => {
    must(
      (await tx.select({ id: schema.items.id }).from(schema.items).where(eq(schema.items.id, itemId)))[0],
      'Item not found',
    );
    const existing = await tx
      .select({ id: itemPhotos.id })
      .from(itemPhotos)
      .where(eq(itemPhotos.itemId, itemId));
    const [row] = await tx
      .insert(itemPhotos)
      .values({ itemId, ...files, isPrimary: existing.length === 0 })
      .returning({ id: itemPhotos.id });
    return row.id;
  });
}

export async function listPhotos(q: Queryable, itemId: number): Promise<PhotoRow[]> {
  return q
    .select()
    .from(itemPhotos)
    .where(eq(itemPhotos.itemId, itemId))
    .orderBy(desc(itemPhotos.isPrimary), desc(itemPhotos.id))
    .then(rows =>
      rows.map(r => ({
        id: r.id,
        itemId: r.itemId,
        originalPath: r.originalPath,
        cutoutPath: r.cutoutPath,
        thumbPath: r.thumbPath,
        width: r.width ?? 0,
        height: r.height ?? 0,
        isPrimary: r.isPrimary,
      })),
    );
}

/** Exactly one primary photo per item. */
export async function setPrimaryPhoto(db: Db, photoId: number): Promise<void> {
  await inTransaction(db, async tx => {
    const [p] = await tx.select().from(itemPhotos).where(eq(itemPhotos.id, photoId));
    must(p, 'Photo not found');
    await tx.update(itemPhotos).set({ isPrimary: false }).where(eq(itemPhotos.itemId, p.itemId));
    await tx.update(itemPhotos).set({ isPrimary: true }).where(eq(itemPhotos.id, photoId));
  });
}

/**
 * Deletes the row and returns the file paths so the caller can remove them.
 * If the primary goes, the newest remaining photo is promoted.
 */
export async function deletePhoto(db: Db, photoId: number): Promise<string[]> {
  return inTransaction(db, async tx => {
    const [p] = await tx.select().from(itemPhotos).where(eq(itemPhotos.id, photoId));
    must(p, 'Photo not found');
    await tx.delete(itemPhotos).where(eq(itemPhotos.id, photoId));
    if (p.isPrimary) {
      const [next] = await tx
        .select({ id: itemPhotos.id })
        .from(itemPhotos)
        .where(and(eq(itemPhotos.itemId, p.itemId)))
        .orderBy(desc(itemPhotos.id))
        .limit(1);
      if (next) {
        await tx.update(itemPhotos).set({ isPrimary: true }).where(eq(itemPhotos.id, next.id));
      }
    }
    return [p.originalPath, p.cutoutPath, p.thumbPath].filter((x): x is string => !!x);
  });
}
