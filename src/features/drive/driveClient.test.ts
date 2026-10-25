import { md5 } from '@noble/hashes/legacy.js';
import { toHex, utf8Encode } from '../../domain/base64';
import {
  deleteFile,
  DriveError,
  Http,
  HttpInit,
  HttpResponse,
  listDriveBackups,
  md5Hex,
  pruneDrive,
  uploadBackup,
} from './driveClient';

const bytes = utf8Encode('encrypted backup bytes');
const GOOD_MD5 = toHex(md5(bytes));

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: n => headers[n] ?? null },
  };
}

type Call = { url: string; init?: HttpInit };

/** A fake Drive: answers by URL and records every call. */
function drive(handlers: Array<(c: Call) => HttpResponse | undefined>) {
  const calls: Call[] = [];
  const http: Http = async (url, init) => {
    const c = { url, init };
    calls.push(c);
    for (const h of handlers) {
      const r = h(c);
      if (r) {
        return r;
      }
    }
    return res(500);
  };
  return { http, calls };
}

const startOk = (c: Call) => (c.url.includes('uploadType=resumable') ? res(200, {}, { Location: 'https://upload.example/session1' }) : undefined);
const putOk = (c: Call) => (c.url === 'https://upload.example/session1' ? res(200, { id: 'F1' }) : undefined);
const metaOk = (size = bytes.length, sum = GOOD_MD5) => (c: Call) =>
  c.url.includes('/files/F1?fields') ? res(200, { size: String(size), md5Checksum: sum, createdTime: '2026-10-25T10:00:00Z' }) : undefined;

describe('uploadBackup', () => {
  it('starts a session in the hidden app folder, sends the bytes, and verifies size and checksum', async () => {
    const { http, calls } = drive([startOk, putOk, metaOk()]);
    const f = await uploadBackup(http, 'tok', 'restaurant-2026-10-25-2130.rimbak', bytes);
    expect(f).toEqual({ id: 'F1', name: 'restaurant-2026-10-25-2130.rimbak', sizeBytes: bytes.length, createdTime: '2026-10-25T10:00:00Z' });

    const [start, put, check] = calls;
    expect(start.init?.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Upload-Content-Length': String(bytes.length) });
    expect(JSON.parse(start.init?.body as string)).toEqual({ name: 'restaurant-2026-10-25-2130.rimbak', parents: ['appDataFolder'] });
    expect(put.init).toMatchObject({ method: 'PUT', body: bytes });
    expect(check.url).toContain('md5Checksum');
  });

  it('deletes and reports an upload whose stored copy does not match', async () => {
    const wrongSize = drive([startOk, putOk, metaOk(bytes.length - 1), c => (c.init?.method === 'DELETE' ? res(204) : undefined)]);
    await expect(uploadBackup(wrongSize.http, 'tok', 'a.rimbak', bytes)).rejects.toMatchObject({ kind: 'mismatch' });
    expect(wrongSize.calls.some(c => c.init?.method === 'DELETE' && c.url.endsWith('/F1'))).toBe(true);

    const wrongSum = drive([startOk, putOk, metaOk(bytes.length, 'f'.repeat(32)), c => (c.init?.method === 'DELETE' ? res(204) : undefined)]);
    await expect(uploadBackup(wrongSum.http, 'tok', 'a.rimbak', bytes)).rejects.toMatchObject({ kind: 'mismatch' });
  });

  it('turns failures into readable errors', async () => {
    const err = async (h: Array<(c: Call) => HttpResponse | undefined>) => {
      try {
        await uploadBackup(drive(h).http, 'tok', 'a.rimbak', bytes);
      } catch (e) {
        return e as DriveError;
      }
      throw new Error('did not fail');
    };
    expect(await err([() => res(401)])).toMatchObject({ kind: 'auth', message: expect.stringContaining('expired') });
    expect(await err([() => res(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } })])).toMatchObject({ kind: 'quota', message: 'Your Google Drive is full.' });
    expect(await err([() => res(429, 'slow down')])).toMatchObject({ kind: 'quota' });
    expect(await err([() => res(503)])).toMatchObject({ kind: 'server' });
    expect(await err([() => res(200, {}, {})])).toMatchObject({ kind: 'server', message: expect.stringContaining('did not start') });
    expect(await err([startOk, () => res(200, {})])).toMatchObject({ kind: 'server', message: expect.stringContaining('did not confirm') });
    const offline: Http = async () => {
      throw new Error('Network request failed');
    };
    await expect(uploadBackup(offline, 'tok', 'a.rimbak', bytes)).rejects.toMatchObject({ kind: 'offline' });
  });
});

describe('listing, deleting and pruning', () => {
  const files = [
    { id: 'a', name: 'restaurant-2026-10-25-0900.rimbak', size: '10', createdTime: 't1' },
    { id: 'b', name: 'restaurant-2026-10-25-2100.rimbak', size: '20', createdTime: 't2' },
    { id: 'c', name: 'restaurant-2026-08-01-0900.rimbak', size: '30', createdTime: 't3' },
  ];
  const lister = (c: Call) => (c.url.includes('spaces=appDataFolder') ? res(200, { files }) : undefined);

  it('lists only the hidden folder, with sizes as numbers', async () => {
    const { http, calls } = drive([lister]);
    const list = await listDriveBackups(http, 'tok');
    expect(list.map(f => [f.id, f.sizeBytes])).toEqual([['a', 10], ['b', 20], ['c', 30]]);
    expect(calls[0].url).toContain('spaces=appDataFolder');
    expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('an empty answer is an empty list', async () => {
    expect((await listDriveBackups(drive([() => res(200, {})]).http, 'tok'))).toEqual([]);
  });

  it('deletes by id, encoding it', async () => {
    const { http, calls } = drive([() => res(204)]);
    await deleteFile(http, 'tok', 'a/b');
    expect(calls[0]).toMatchObject({ url: expect.stringContaining('/files/a%2Fb'), init: { method: 'DELETE' } });
  });

  it('prunes with the same 7 daily and 4 weekly rule as local backups', async () => {
    const deleted: string[] = [];
    const { http } = drive([lister, c => (c.init?.method === 'DELETE' ? (deleted.push(c.url.split('/').pop() as string), res(204)) : undefined)]);
    expect(await pruneDrive(http, 'tok', '2026-10-25')).toEqual(['restaurant-2026-10-25-0900.rimbak', 'restaurant-2026-08-01-0900.rimbak']);
    expect(deleted.sort()).toEqual(['a', 'c']);
  });

  it('md5 matches the known test vector', () => {
    expect(md5Hex(utf8Encode('abc'))).toBe('900150983cd24fb0d6963f7d28e17f72');
  });
});
