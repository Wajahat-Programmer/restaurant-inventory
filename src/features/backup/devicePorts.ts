import {
  copyFile,
  CachesDirectoryPath,
  DocumentDirectoryPath,
  exists,
  hash,
  mkdir,
  moveFile,
  readDir,
  readFile,
  stat,
  unlink,
  writeFile,
} from '@dr.pogodin/react-native-fs';
import { getGenericPassword, resetGenericPassword, setGenericPassword } from 'react-native-keychain';
import { unzip, zip } from 'react-native-zip-archive';
import { openDbFile } from '../../db/opsqlite';
import { devicePorts as photoPorts } from '../photos/devicePorts';
import { BackupPorts, Fs, Zipper } from './backupService';

const fs: Fs = {
  mkdir: path => mkdir(path),
  exists: path => exists(path),
  readDir: async dir => (await readDir(dir)).map(e => ({ name: e.name, isFile: e.isFile() })),
  readBase64: path => readFile(path, 'base64'),
  writeBase64: (path, data) => writeFile(path, data, 'base64'),
  copy: (from, to) => copyFile(from, to),
  move: (from, to) => moveFile(from, to),
  remove: async path => {
    if (await exists(path)) {
      await unlink(path); // removes a folder with everything in it
    }
  },
  size: async path => Number((await stat(path)).size),
  sha256: path => hash(path, 'sha256'),
};

const zipper: Zipper = {
  zip: async (sources, target) => {
    await zip(sources, target);
  },
  unzip: async (zipPath, targetDir) => {
    await unzip(zipPath, targetDir);
  },
};

/** The real phone. `appVersion` is passed in because it comes from the native side. */
export function backupPorts(appVersion: string): BackupPorts {
  return {
    fs,
    zip: zipper,
    openDbFile,
    dirs: {
      backups: `${DocumentDirectoryPath}/backups`,
      photos: photoPorts.photosDir,
      work: `${CachesDirectoryPath}/work`,
    },
    appVersion,
    now: () => new Date(),
  };
}

/* The backup passphrase lives in the Android Keystore, so the daily automatic
   backup can run without asking, and nothing readable is kept in the database. */

const SERVICE = 'restaurant-inventory.backup';

export async function saveBackupPassphrase(passphrase: string): Promise<void> {
  const ok = await setGenericPassword('backup', passphrase, { service: SERVICE });
  if (!ok) {
    throw new Error('The phone would not store the passphrase safely.');
  }
}

export async function loadBackupPassphrase(): Promise<string | null> {
  const r = await getGenericPassword({ service: SERVICE });
  return r ? r.password : null;
}

export async function forgetBackupPassphrase(): Promise<void> {
  await resetGenericPassword({ service: SERVICE });
}
