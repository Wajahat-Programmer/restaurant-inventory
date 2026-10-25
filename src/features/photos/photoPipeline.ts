import { MAX_EDGE_PX, photoPaths, THUMB_EDGE_PX } from '../../domain/photos';
import { PhotoFiles } from '../../services/photoService';

export interface Resized {
  /** Where the file ended up (the resizer chooses its own temp name). */
  path: string;
  width: number;
  height: number;
}

/** Everything the pipeline needs from the device, so it can be tested without one. */
export interface PhotoPorts {
  photosDir: string;
  now: () => number;
  mkdir: (dir: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
  move: (from: string, to: string) => Promise<void>;
  /** Fixes EXIF rotation and fits the long edge; never upscales. */
  resize: (
    srcPath: string,
    maxEdge: number,
    format: 'JPEG' | 'WEBP',
    quality: number,
  ) => Promise<Resized>;
  /** Null when the segmentation module is not on this build. */
  segment: ((input: string, output: string) => Promise<unknown>) | null;
}

export interface PhotoResult extends PhotoFiles {
  /** True when the cutout could not be made and the plain photo is used. */
  usedFallback: boolean;
}

/**
 * Turns a raw camera file into the three stored files:
 *   1. resize to 1024 px and fix EXIF orientation  -> original.jpg
 *   2. segment on-device to a transparent PNG       -> cutout.png (optional)
 *   3. 256 px WebP thumbnail (of the cutout if any) -> thumb.webp
 * If any required step fails, every file made so far is deleted and the error
 * is rethrown, so a failed capture leaves nothing behind.
 */
export async function processPhoto(
  ports: PhotoPorts,
  itemId: number,
  rawPath: string,
): Promise<PhotoResult> {
  const paths = photoPaths(ports.photosDir, itemId, ports.now());
  const made: string[] = [];
  const keep = async (path: string) => {
    made.push(path);
    return path;
  };

  try {
    await ports.mkdir(ports.photosDir);

    const resized = await ports.resize(rawPath, MAX_EDGE_PX, 'JPEG', 85);
    await ports.move(resized.path, await keep(paths.original));

    let cutoutPath: string | null = null;
    if (ports.segment) {
      try {
        await ports.segment(paths.original, await keep(paths.cutout));
        cutoutPath = paths.cutout;
      } catch {
        // Model missing, still downloading, or no subject: keep the plain photo.
        made.splice(made.indexOf(paths.cutout), 1);
        await ports.remove(paths.cutout).catch(() => undefined);
      }
    }

    const thumb = await ports.resize(cutoutPath ?? paths.original, THUMB_EDGE_PX, 'WEBP', 80);
    await ports.move(thumb.path, await keep(paths.thumb));

    await ports.remove(rawPath).catch(() => undefined);
    return {
      originalPath: paths.original,
      cutoutPath,
      thumbPath: paths.thumb,
      width: resized.width,
      height: resized.height,
      usedFallback: cutoutPath === null,
    };
  } catch (e) {
    await Promise.all(made.map(p => ports.remove(p).catch(() => undefined)));
    throw e;
  }
}

/**
 * Makes the cutout for a photo that was saved without one (the model was not
 * ready yet). Throws with the native reason if it is still not available, and
 * leaves no files behind in that case.
 */
export async function addCutout(
  ports: PhotoPorts,
  originalPath: string,
): Promise<{ cutoutPath: string; thumbPath: string }> {
  if (!ports.segment) {
    throw new Error('The cutout feature is not available on this phone');
  }
  // Names derived from the original never collide with the files already
  // stored for this photo (its old thumbnail in particular).
  const base = originalPath.replace(/\.jpg$/, '');
  const cutoutPath = `${base}-cutout.png`;
  const thumbPath = `${base}-cutout-thumb.webp`;
  const made: string[] = [];
  try {
    made.push(cutoutPath); // a failed attempt may leave a partial file
    await ports.segment(originalPath, cutoutPath);
    const thumb = await ports.resize(cutoutPath, THUMB_EDGE_PX, 'WEBP', 80);
    await ports.move(thumb.path, thumbPath);
    made.push(thumbPath);
  } catch (e) {
    // Only what this call made: never the photo's existing files.
    await Promise.all(made.map(p => ports.remove(p).catch(() => undefined)));
    throw e;
  }
  return { cutoutPath, thumbPath };
}
