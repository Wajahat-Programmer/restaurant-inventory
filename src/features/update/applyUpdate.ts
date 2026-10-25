import { ApkInfo } from './checkForUpdate';

/** The device side of an update, so the steps can be tested without a phone. */
export interface UpdatePorts {
  /** Where the downloaded file is kept until it is installed. */
  apkPath: string;
  canInstall: () => Promise<boolean>;
  openInstallSettings: () => Promise<void>;
  download: (url: string, to: string, onProgress: (fraction: number) => void) => Promise<void>;
  fileSize: (path: string) => Promise<number>;
  sha256: (path: string) => Promise<string>;
  install: (path: string) => Promise<void>;
  remove: (path: string) => Promise<void>;
}

export type ApplyResult =
  | { state: 'installing' }
  | { state: 'needs-permission' }
  | { state: 'failed'; step: 'download' | 'size' | 'checksum' | 'install'; message: string };

/**
 * Downloads the new version, proves it is the file that was published
 * (size and SHA-256), and only then hands it to Android to install. A file
 * that fails any check is deleted, so a damaged or swapped download is never
 * installed. Android itself also refuses an update signed by a different key.
 */
export async function applyUpdate(
  ports: UpdatePorts,
  apk: ApkInfo,
  onProgress: (fraction: number) => void = () => undefined,
): Promise<ApplyResult> {
  if (!(await ports.canInstall())) {
    await ports.openInstallSettings();
    return { state: 'needs-permission' };
  }

  const discard = () => ports.remove(ports.apkPath).catch(() => undefined);
  await discard();

  try {
    await ports.download(apk.url, ports.apkPath, onProgress);
  } catch (e) {
    await discard();
    return { state: 'failed', step: 'download', message: `The download did not finish. ${reason(e)}` };
  }

  const size = await ports.fileSize(ports.apkPath).catch(() => -1);
  if (apk.sizeBytes > 0 && size !== apk.sizeBytes) {
    await discard();
    return { state: 'failed', step: 'size', message: 'The downloaded file is the wrong size, so it was deleted. Try again.' };
  }

  const hash = await ports.sha256(ports.apkPath).catch(() => '');
  if (hash.toLowerCase() !== apk.sha256.toLowerCase()) {
    await discard();
    return { state: 'failed', step: 'checksum', message: 'The downloaded file does not match the published checksum, so it was deleted and not installed.' };
  }

  try {
    await ports.install(ports.apkPath);
  } catch (e) {
    return { state: 'failed', step: 'install', message: `Android could not start the install. ${reason(e)}` };
  }
  return { state: 'installing' };
}

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
