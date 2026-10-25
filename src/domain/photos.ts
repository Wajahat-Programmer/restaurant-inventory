export const MAX_EDGE_PX = 1024;
export const THUMB_EDGE_PX = 256;

export interface Size {
  width: number;
  height: number;
}

/**
 * Fits a photo inside `maxEdge` on its long edge, keeping the aspect ratio.
 * Never upscales. EXIF rotation must be applied first: a rotated photo
 * reports swapped dimensions.
 */
export function fitLongEdge(size: Size, maxEdge: number): Size {
  if (!(size.width > 0) || !(size.height > 0)) {
    throw new RangeError('Photo has no size');
  }
  const long = Math.max(size.width, size.height);
  if (long <= maxEdge) {
    return { width: Math.round(size.width), height: Math.round(size.height) };
  }
  const k = maxEdge / long;
  return {
    width: Math.max(1, Math.round(size.width * k)),
    height: Math.max(1, Math.round(size.height * k)),
  };
}

/** EXIF orientations 5-8 swap width and height once rotated upright. */
export function uprightSize(size: Size, exifOrientation: number): Size {
  return exifOrientation >= 5 && exifOrientation <= 8
    ? { width: size.height, height: size.width }
    : size;
}

/**
 * Fixed names under the photos folder, so a row's paths can always be rebuilt
 * and a half-finished capture is easy to find and delete.
 */
export function photoPaths(dir: string, itemId: number, stamp: number) {
  const base = `${dir}/item-${itemId}-${stamp}`;
  return {
    original: `${base}.jpg`,
    cutout: `${base}-cutout.png`,
    thumb: `${base}-thumb.webp`,
  };
}
