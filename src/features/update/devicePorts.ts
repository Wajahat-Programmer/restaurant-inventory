import { CachesDirectoryPath, downloadFile, hash, mkdir, stat, unlink } from '@dr.pogodin/react-native-fs';
import NativeAppUpdate from '../../native/NativeAppUpdate';
import { UpdatePorts } from './applyUpdate';
import { FetchLike } from './checkForUpdate';

const TIMEOUT_MS = 15000;

/** fetch with a timeout, so a dead connection fails in seconds instead of hanging. */
export const timedFetch: FetchLike = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: init?.headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** The installed version, or null when the native module is missing (tests). */
export async function installedVersion(): Promise<string | null> {
  return (await NativeAppUpdate?.getVersion())?.name ?? null;
}

const UPDATES_DIR = `${CachesDirectoryPath}/updates`;

/** The real phone: GitHub download into cache/updates, SHA-256 from the file, Android installer. */
export const updatePorts: UpdatePorts = {
  apkPath: `${UPDATES_DIR}/update.apk`,
  canInstall: async () => (await NativeAppUpdate?.canInstall()) ?? false,
  openInstallSettings: async () => {
    await NativeAppUpdate?.openInstallSettings();
  },
  async download(url, to, onProgress) {
    await mkdir(UPDATES_DIR);
    const job = downloadFile({
      fromUrl: url,
      toFile: to,
      progressInterval: 250,
      progress: p => onProgress(p.contentLength > 0 ? p.bytesWritten / p.contentLength : 0),
    });
    const res = await job.promise;
    if (res.statusCode !== 200) {
      throw new Error(`The server answered ${res.statusCode}`);
    }
  },
  fileSize: async path => Number((await stat(path)).size),
  sha256: path => hash(path, 'sha256'),
  install: async path => {
    if (!NativeAppUpdate) {
      throw new Error('Installing updates is not available in this build');
    }
    await NativeAppUpdate.installApk(path);
  },
  remove: path => unlink(path),
};
