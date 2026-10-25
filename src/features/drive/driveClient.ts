import { md5 } from '@noble/hashes/legacy.js';
import { toHex } from '../../domain/base64';
import { retention } from '../../domain/backup';

/**
 * Talks to Google Drive's REST API using only the hidden app-data folder
 * (scope drive.appdata): no other app, and not even the owner in the Drive
 * website, can see these files, and the app cannot see anything else in Drive.
 * It needs an access token; getting one is the sign-in library's job.
 */

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

export interface HttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: { get: (name: string) => string | null };
}

export interface HttpInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array;
}

export type Http = (url: string, init?: HttpInit) => Promise<HttpResponse>;

export interface DriveFile {
  id: string;
  name: string;
  sizeBytes: number;
  createdTime: string;
}

export class DriveError extends Error {
  constructor(
    public kind: 'auth' | 'quota' | 'offline' | 'server' | 'mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function call(http: Http, url: string, init: HttpInit): Promise<HttpResponse> {
  let res: HttpResponse;
  try {
    res = await http(url, init);
  } catch {
    throw new DriveError('offline', 'Could not reach Google Drive. Check the internet connection.');
  }
  if (res.ok) {
    return res;
  }
  if (res.status === 401) {
    throw new DriveError('auth', 'Google Drive sign-in has expired. Connect Google Drive again.');
  }
  if (res.status === 403 || res.status === 429) {
    const body = await res.text().catch(() => '');
    throw new DriveError(
      'quota',
      /storageQuotaExceeded|quota/i.test(body)
        ? 'Your Google Drive is full.'
        : 'Google Drive refused the request. Try again later.',
    );
  }
  throw new DriveError('server', `Google Drive answered with an error (${res.status}).`);
}

export function md5Hex(bytes: Uint8Array): string {
  return toHex(md5(bytes));
}

/**
 * Uploads in two steps (start a resumable session, then send the bytes) and
 * then asks Drive what it stored: the size and MD5 must equal ours, so a
 * truncated upload is caught instead of trusted.
 */
export async function uploadBackup(http: Http, token: string, name: string, bytes: Uint8Array): Promise<DriveFile> {
  const start = await call(http, `${UPLOAD}?uploadType=resumable`, {
    method: 'POST',
    headers: {
      ...auth(token),
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': 'application/octet-stream',
      'X-Upload-Content-Length': String(bytes.length),
    },
    body: JSON.stringify({ name, parents: ['appDataFolder'] }),
  });
  const session = start.headers.get('Location');
  if (!session) {
    throw new DriveError('server', 'Google Drive did not start the upload.');
  }
  const put = await call(http, session, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
    body: bytes,
  });
  const created = (await put.json()) as { id?: string };
  if (!created.id) {
    throw new DriveError('server', 'Google Drive did not confirm the upload.');
  }

  const check = await call(http, `${FILES}/${created.id}?fields=id,name,size,md5Checksum,createdTime`, {
    headers: auth(token),
  });
  const meta = (await check.json()) as { size?: string; md5Checksum?: string; createdTime?: string };
  if (Number(meta.size) !== bytes.length || meta.md5Checksum?.toLowerCase() !== md5Hex(bytes)) {
    // Do not keep a damaged copy that looks like a good one.
    await deleteFile(http, token, created.id).catch(() => undefined);
    throw new DriveError('mismatch', 'The copy in Google Drive does not match, so it was removed. Try again.');
  }
  return { id: created.id, name, sizeBytes: bytes.length, createdTime: meta.createdTime ?? '' };
}

export async function listDriveBackups(http: Http, token: string): Promise<DriveFile[]> {
  const url = `${FILES}?spaces=appDataFolder&pageSize=100&orderBy=createdTime%20desc&fields=files(id,name,size,createdTime)`;
  const res = await call(http, url, { headers: auth(token) });
  const body = (await res.json()) as { files?: { id: string; name: string; size?: string; createdTime?: string }[] };
  return (body.files ?? []).map(f => ({
    id: f.id,
    name: f.name,
    sizeBytes: Number(f.size ?? 0),
    createdTime: f.createdTime ?? '',
  }));
}

export async function deleteFile(http: Http, token: string, id: string): Promise<void> {
  await call(http, `${FILES}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: auth(token) });
}

/** Applies the same 7 daily + 4 weekly rule as local backups to what is in Drive. */
export async function pruneDrive(http: Http, token: string, today: string): Promise<string[]> {
  const files = await listDriveBackups(http, token);
  const { remove } = retention(files.map(f => f.name), today);
  const doomed = files.filter(f => remove.includes(f.name));
  for (const f of doomed) {
    await deleteFile(http, token, f.id);
  }
  return doomed.map(f => f.name);
}
