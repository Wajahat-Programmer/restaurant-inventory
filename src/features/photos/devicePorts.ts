import ImageResizer from '@bam.tech/react-native-image-resizer';
import {
  DocumentDirectoryPath,
  moveFile,
  mkdir,
  unlink,
} from '@dr.pogodin/react-native-fs';
import NativeCutout from '../../native/NativeCutout';
import { PhotoPorts } from './photoPipeline';

/** Strips the file:// prefix the camera and resizer use; native code wants a path. */
const asPath = (uri: string) => uri.replace(/^file:\/\//, '');

/** The real device: files in app storage, the native resizer, ML Kit. */
export const devicePorts: PhotoPorts = {
  photosDir: `${DocumentDirectoryPath}/photos`,
  now: Date.now,
  mkdir: dir => mkdir(dir),
  remove: path => unlink(asPath(path)),
  move: (from, to) => moveFile(asPath(from), to),
  async resize(srcPath, maxEdge, format, quality) {
    const r = await ImageResizer.createResizedImage(
      srcPath,
      maxEdge,
      maxEdge,
      format,
      quality,
      0,
      null,
      false,
      { mode: 'contain', onlyScaleDown: true },
    );
    return { path: asPath(r.path), width: r.width, height: r.height };
  },
  segment: NativeCutout
    ? (input, output) => NativeCutout!.removeBackground(asPath(input), asPath(output))
    : null,
};

/**
 * Asks Play services to download the segmentation model. Called once at
 * start-up so the first photo does not have to wait for it. Never throws.
 */
export function prepareCutoutModel(): void {
  NativeCutout?.prepare().catch(() => undefined);
}
