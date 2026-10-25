import { Db } from '../../db/client';
import { createTestDb } from '../../db/testing';
import { getSetting, setSetting } from '../../services/settingsService';
import { FetchLike } from './checkForUpdate';
import { claimAnnouncement, knownUpdate, runUpdateCheck, UpdateEnv } from './updateController';

const SHA = 'c'.repeat(64);
const H = 3600 * 1000;

let db: Db;
beforeEach(async () => {
  db = await createTestDb();
});

function env(latestTag: string | null, over: Partial<UpdateEnv> = {}) {
  let calls = 0;
  const f: FetchLike = async () => {
    calls++;
    if (latestTag === null) {
      throw new Error('offline');
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: latestTag,
        body: 'Notes',
        assets: [
          {
            name: 'app.apk',
            browser_download_url: `https://github.com/x/y/releases/download/${latestTag}/app.apk`,
            size: 10,
            digest: `sha256:${SHA}`,
          },
        ],
      }),
      text: async () => '',
    };
  };
  const e: UpdateEnv = { fetch: f, currentVersion: async () => '1.0.0', now: () => 1_000_000_000, ...over };
  return { e, calls: () => calls };
}

describe('runUpdateCheck', () => {
  it('finds an update, remembers it and when it looked', async () => {
    const { e } = env('v1.1.0');
    const r = await runUpdateCheck(db, e, { manual: true });
    expect(r).toMatchObject({ state: 'available', latest: '1.1.0' });
    expect(await getSetting(db, 'update.available')).toBe('1.1.0');
    expect(await getSetting(db, 'update.lastCheck')).toBe('1000000000');
  });

  it('clears the remembered update once the app is up to date', async () => {
    await setSetting(db, 'update.available', '1.1.0');
    const r = await runUpdateCheck(db, env('v1.0.0').e, { manual: true });
    expect(r.state).toBe('up-to-date');
    expect(await getSetting(db, 'update.available')).toBe('');
  });

  it('keeps what it knew when the check fails, but still counts the attempt', async () => {
    await setSetting(db, 'update.available', '1.1.0');
    const r = await runUpdateCheck(db, env(null).e, { manual: true });
    expect(r).toMatchObject({ state: 'error', kind: 'offline' });
    expect(await getSetting(db, 'update.available')).toBe('1.1.0');
    expect(await getSetting(db, 'update.lastCheck')).toBe('1000000000');
  });

  it('an automatic check is throttled to once every 6 hours', async () => {
    const { e, calls } = env('v1.1.0');
    expect((await runUpdateCheck(db, e, { manual: false })).state).toBe('available');
    expect(await runUpdateCheck(db, { ...e, now: () => 1_000_000_000 + 5 * H }, { manual: false })).toEqual({ state: 'skipped', reason: 'recent' });
    expect(calls()).toBe(1);
    expect((await runUpdateCheck(db, { ...e, now: () => 1_000_000_000 + 6 * H }, { manual: false })).state).toBe('available');
    expect(calls()).toBe(2);
  });

  it('an automatic check respects the off switch, a manual one does not', async () => {
    await setSetting(db, 'update.autoCheck', '0');
    const { e, calls } = env('v1.1.0');
    expect(await runUpdateCheck(db, e, { manual: false })).toEqual({ state: 'skipped', reason: 'off' });
    expect(calls()).toBe(0);
    expect((await runUpdateCheck(db, e, { manual: true })).state).toBe('available');
  });

  it('a manual check ignores the throttle', async () => {
    const { e, calls } = env('v1.1.0');
    await runUpdateCheck(db, e, { manual: true });
    await runUpdateCheck(db, e, { manual: true });
    expect(calls()).toBe(2);
  });

  it('says so when it cannot read the installed version', async () => {
    const r = await runUpdateCheck(db, env('v1.1.0', { currentVersion: async () => null }).e, { manual: true });
    expect(r).toMatchObject({ state: 'error' });
    expect((r as { message: string }).message).toContain('which version is installed');
  });
});

describe('remembering and announcing', () => {
  it('only remembers an update that is still newer than the installed version', async () => {
    await setSetting(db, 'update.available', '1.1.0');
    expect(await knownUpdate(db, '1.0.0')).toBe('1.1.0');
    expect(await knownUpdate(db, '1.1.0')).toBeNull(); // updated since
    expect(await knownUpdate(db, '2.0.0')).toBeNull();
    expect(await knownUpdate(db, null)).toBeNull();
    await setSetting(db, 'update.available', '');
    expect(await knownUpdate(db, '1.0.0')).toBeNull();
  });

  it('announces each version once', async () => {
    expect(await claimAnnouncement(db, '1.1.0')).toBe(true);
    expect(await claimAnnouncement(db, '1.1.0')).toBe(false);
    expect(await claimAnnouncement(db, '1.2.0')).toBe(true);
  });
});
