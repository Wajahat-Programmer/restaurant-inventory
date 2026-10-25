import { md5 } from '@noble/hashes/legacy.js';
import { schema } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { toBase64, toHex, utf8Encode } from '../../domain/base64';
import { setSession } from '../../services/session';
import { getSetting } from '../../services/settingsService';
import { Http, HttpResponse } from './driveClient';
import { DriveSyncPorts, uploadLatestToDrive } from './driveSync';

const bytes = utf8Encode('sealed');
const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}): HttpResponse => ({
  ok: status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: n => headers[n] ?? null },
});

/** A tiny fake Drive holding a list of file names. */
function fakeDrive(existing: string[] = [], corrupt = false) {
  const uploads: string[] = [];
  const http: Http = async (url, init) => {
    if (url.includes('uploadType=resumable')) {
      uploads.push(JSON.parse(init!.body as string).name as string);
      return res(200, {}, { Location: 'https://upload.example/s' });
    }
    if (url === 'https://upload.example/s') {
      return res(200, { id: 'NEW' });
    }
    if (url.includes('/files/NEW?fields')) {
      return res(200, { size: String(corrupt ? 1 : bytes.length), md5Checksum: toHex(md5(bytes)), createdTime: 't' });
    }
    if (url.includes('spaces=appDataFolder')) {
      return res(200, { files: existing.map((n, i) => ({ id: `F${i}`, name: n, size: '6', createdTime: 't' })) });
    }
    return res(204);
  };
  return { http, uploads };
}

const NAME = 'restaurant-2026-10-25-213000.rimbak';
const ports = (http: Http, backups: string[] = [NAME]): DriveSyncPorts => ({
  http,
  token: async () => 'tok',
  localBackups: async () => backups.map(name => ({ name, path: `/b/${name}`, sizeBytes: 6 })),
  readBase64: async () => toBase64(bytes),
  now: () => 1234,
});

beforeEach(() => setSession(null));

describe('uploadLatestToDrive', () => {
  it('sends the newest local backup, logs it, and remembers when', async () => {
    const db = await createTestDb();
    const d = fakeDrive();
    expect(await uploadLatestToDrive(db, ports(d.http), '2026-10-25')).toBe(NAME);
    expect(d.uploads).toEqual([NAME]);
    const [row] = await db.select().from(schema.backupLog);
    expect(row).toMatchObject({ kind: 'drive', status: 'ok', driveFileId: 'NEW' });
    expect(await getSetting(db, 'drive.lastOkAt')).toBe('1234');
  });

  it('does not send a file that Drive already has', async () => {
    const db = await createTestDb();
    const d = fakeDrive([NAME]);
    expect(await uploadLatestToDrive(db, ports(d.http), '2026-10-25')).toBeNull();
    expect(d.uploads).toEqual([]);
  });

  it('logs a failure when the copy in Drive does not match, and throws', async () => {
    const db = await createTestDb();
    await expect(uploadLatestToDrive(db, ports(fakeDrive([], true).http), '2026-10-25')).rejects.toThrow('does not match');
    const [row] = await db.select().from(schema.backupLog);
    expect(row).toMatchObject({ kind: 'drive', status: 'failed' });
    expect(await getSetting(db, 'drive.lastOkAt')).toBe('');
  });

  it('says so when there is no local backup, and is owner-only', async () => {
    const db = await createTestDb();
    await expect(uploadLatestToDrive(db, ports(fakeDrive().http, []), '2026-10-25')).rejects.toThrow('no backup on this phone');
    setSession({ id: 1, name: 'Bilal', role: 'staff' });
    await expect(uploadLatestToDrive(db, ports(fakeDrive().http), '2026-10-25')).rejects.toThrow('Only the owner');
  });
});
