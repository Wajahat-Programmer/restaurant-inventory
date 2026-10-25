import { Db } from '../../db/client';
import { attachPhoto, PhotoFiles, PhotoRow, setCutout } from '../../services/photoService';
import { addCutout, PhotoPorts, processPhoto, PhotoResult } from './photoPipeline';

/**
 * Processes a raw camera file and records it for the item. If the database
 * write fails, the files already made are deleted, so a failed save never
 * leaves orphan files behind.
 */
export async function savePhoto(
  db: Db,
  ports: PhotoPorts,
  itemId: number,
  rawPath: string,
): Promise<PhotoResult> {
  const result = await processPhoto(ports, itemId, rawPath);
  const files: PhotoFiles = {
    originalPath: result.originalPath,
    cutoutPath: result.cutoutPath,
    thumbPath: result.thumbPath,
    width: result.width,
    height: result.height,
  };
  try {
    await attachPhoto(db, itemId, files);
  } catch (e) {
    const stored = [files.originalPath, files.cutoutPath, files.thumbPath];
    await Promise.all(
      stored.filter((p): p is string => !!p).map(p => ports.remove(p).catch(() => undefined)),
    );
    throw e;
  }
  return result;
}

/** Retries the cutout for a saved photo. Throws the reason if still not ready. */
export async function retryCutout(db: Db, ports: PhotoPorts, photo: PhotoRow): Promise<void> {
  const made = await addCutout(ports, photo.originalPath);
  try {
    const oldThumb = await setCutout(db, photo.id, made.cutoutPath, made.thumbPath);
    await ports.remove(oldThumb).catch(() => undefined);
  } catch (e) {
    await Promise.all(
      [made.cutoutPath, made.thumbPath].map(p => ports.remove(p).catch(() => undefined)),
    );
    throw e;
  }
}
