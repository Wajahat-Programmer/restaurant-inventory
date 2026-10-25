import { CachesDirectoryPath, copyFile, exists, mkdir, readFile, writeFile } from '@dr.pogodin/react-native-fs';
import { errorCodes, isErrorWithCode, keepLocalCopy, pick, types } from '@react-native-documents/picker';
import Share from 'react-native-share';

const asPath = (uri: string) => uri.replace(/^file:\/\//, '');

/** Writes text to a file in the cache folder and returns its path. */
export async function saveText(fileName: string, text: string): Promise<string> {
  const dir = `${CachesDirectoryPath}/exports`;
  await mkdir(dir);
  const path = `${dir}/${fileName}`;
  await writeFile(path, text, 'utf8');
  return path;
}

export const readText = (path: string) => readFile(path, 'utf8');

/** Opens the phone's share sheet for a file. Returns false if the person closed it. */
export async function shareFile(path: string, mime: string): Promise<boolean> {
  try {
    await Share.open({ url: `file://${path}`, type: mime, failOnCancel: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lets the person choose any file. The phone hands back a content address, so
 * it is copied into the app's cache first. Null if they closed the picker.
 */
export async function pickFile(opts: { copyTo?: string } = {}): Promise<{ path: string; name: string } | null> {
  try {
    const [file] = await pick({ type: [types.allFiles] });
    const name = file.name ?? 'file';
    const [copy] = await keepLocalCopy({ files: [{ uri: file.uri, fileName: name }], destination: 'cachesDirectory' });
    if (copy.status !== 'success') {
      throw new Error(copy.copyError ?? 'The file could not be read');
    }
    let path = asPath(copy.localUri);
    if (opts.copyTo) {
      await mkdir(opts.copyTo.slice(0, opts.copyTo.lastIndexOf('/')));
      if (await exists(opts.copyTo)) {
        throw new Error('A file with this name is already in the backups list');
      }
      await copyFile(path, opts.copyTo);
      path = opts.copyTo;
    }
    return { path, name };
  } catch (e) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) {
      return null;
    }
    throw e;
  }
}
