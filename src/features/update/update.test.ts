import { applyUpdate, UpdatePorts } from './applyUpdate';
import {
  ApkInfo,
  checkForUpdate,
  FetchLike,
  GithubRelease,
  hostOf,
  isTrustedUrl,
  parseChecksumFile,
  shouldCheck,
  shouldNotify,
} from './checkForUpdate';

const SHA = 'a'.repeat(64);
const APK_URL = 'https://github.com/Wajahat-Programmer/restaurant-inventory/releases/download/v1.1.0/restaurant-inventory-v1.1.0.apk';

const release = (over: Partial<GithubRelease> = {}): GithubRelease => ({
  tag_name: 'v1.1.0',
  body: 'Fixes counting.',
  published_at: '2026-10-25T10:00:00Z',
  assets: [{ name: 'restaurant-inventory-v1.1.0.apk', browser_download_url: APK_URL, size: 1000, digest: `sha256:${SHA}` }],
  ...over,
});

const feed = (status: number, body: unknown, extra: Record<string, string> = {}): FetchLike => async url => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === 'bad-json') {
      throw new Error('bad json');
    }
    return body;
  },
  text: async () => extra[url] ?? '',
});

const check = (f: FetchLike, current = '1.0.0') => checkForUpdate({ currentVersion: current, fetch: f });

describe('checkForUpdate', () => {
  it('offers a newer release with its notes, size and checksum', async () => {
    const r = await check(feed(200, release()));
    expect(r).toEqual({
      state: 'available',
      current: '1.0.0',
      latest: '1.1.0',
      notes: 'Fixes counting.',
      publishedAt: '2026-10-25T10:00:00Z',
      apk: { name: 'restaurant-inventory-v1.1.0.apk', url: APK_URL, sizeBytes: 1000, sha256: SHA },
    });
  });

  it('says up to date when the release is the same or older', async () => {
    expect(await check(feed(200, release()), '1.1.0')).toEqual({ state: 'up-to-date', current: '1.1.0', latest: '1.1.0' });
    expect(await check(feed(200, release()), '2.0.0')).toMatchObject({ state: 'up-to-date' });
  });

  it('takes the checksum from a .sha256 file when GitHub gives no digest', async () => {
    const sumUrl = `${APK_URL}.sha256`;
    const r = await check(
      feed(
        200,
        release({
          assets: [
            { name: 'restaurant-inventory-v1.1.0.apk', browser_download_url: APK_URL, size: 1000 },
            { name: 'restaurant-inventory-v1.1.0.apk.sha256', browser_download_url: sumUrl, size: 90 },
          ],
        }),
        { [sumUrl]: `${SHA.toUpperCase()}  restaurant-inventory-v1.1.0.apk\n` },
      ),
    );
    expect(r).toMatchObject({ state: 'available', apk: { sha256: SHA } });
  });

  it('refuses a release with no checksum at all', async () => {
    const r = await check(feed(200, release({ assets: [{ name: 'a.apk', browser_download_url: APK_URL, size: 1 }] })));
    expect(r).toMatchObject({ state: 'error', kind: 'bad-release' });
    expect((r as { message: string }).message).toContain('no checksum');
  });

  it('refuses a malformed digest and an unreadable checksum file', async () => {
    const bad = release({ assets: [{ name: 'a.apk', browser_download_url: APK_URL, size: 1, digest: 'sha256:xyz' }] });
    expect(await check(feed(200, bad))).toMatchObject({ kind: 'bad-release' });
    const sumUrl = `${APK_URL}.sha256`;
    const noSum = release({
      assets: [
        { name: 'a.apk', browser_download_url: APK_URL, size: 1 },
        { name: 'a.apk.sha256', browser_download_url: sumUrl, size: 1 },
      ],
    });
    expect(await check(feed(200, noSum, { [sumUrl]: 'not a hash' }))).toMatchObject({ kind: 'bad-release' });
  });

  it('refuses downloads from anywhere but GitHub, and anything not https', async () => {
    for (const url of ['https://evil.example.com/a.apk', 'http://github.com/a.apk', 'https://github.com.evil.com/a.apk', 'ftp://github.com/a.apk']) {
      const r = await check(feed(200, release({ assets: [{ name: 'a.apk', browser_download_url: url, size: 1, digest: `sha256:${SHA}` }] })));
      expect(r).toMatchObject({ state: 'error', kind: 'bad-release' });
    }
  });

  it('can be told to trust a local test server (debug builds only)', async () => {
    const url = 'https://localhost/a.apk';
    const r = await checkForUpdate({
      currentVersion: '1.0.0',
      fetch: feed(200, release({ assets: [{ name: 'a.apk', browser_download_url: url, size: 1, digest: `sha256:${SHA}` }] })),
      extraHosts: ['localhost'],
    });
    expect(r.state).toBe('available');
  });

  it('skips drafts, pre-releases, odd tags and releases without an app file', async () => {
    expect(await check(feed(200, release({ draft: true })))).toMatchObject({ kind: 'no-releases' });
    expect(await check(feed(200, release({ prerelease: true })))).toMatchObject({ kind: 'no-releases' });
    expect(await check(feed(200, release({ tag_name: 'v2.0.0-beta' })))).toMatchObject({ kind: 'bad-release' });
    expect(await check(feed(200, release({ assets: [] })))).toMatchObject({ kind: 'bad-release' });
    expect(await check(feed(200, release({ assets: undefined })))).toMatchObject({ kind: 'bad-release' });
  });

  it('turns every failure into a readable message instead of throwing', async () => {
    expect(await check(feed(404, {}))).toMatchObject({ kind: 'no-releases' });
    expect(await check(feed(403, {}))).toMatchObject({ kind: 'rate-limited' });
    expect(await check(feed(429, {}))).toMatchObject({ kind: 'rate-limited' });
    expect(await check(feed(500, {}))).toMatchObject({ kind: 'server' });
    expect(await check(feed(200, 'bad-json'))).toMatchObject({ kind: 'bad-release' });
    expect(await check(feed(200, null))).toMatchObject({ kind: 'no-releases' });
    const offline = (async () => {
      throw new Error('Network request failed');
    }) as FetchLike;
    expect(await check(offline)).toMatchObject({ kind: 'offline' });
  });

  it('copes with a bad current version without offering updates', async () => {
    expect(await check(feed(200, release()), 'dev')).toMatchObject({ state: 'error', kind: 'bad-release' });
  });
});

describe('helpers', () => {
  it('reads hosts and trusts only https GitHub hosts', () => {
    expect(hostOf('https://github.com/x/y')).toBe('github.com');
    expect(hostOf('https://GitHub.com:443/x')).toBe('github.com');
    expect(hostOf('http://github.com/x')).toBeNull();
    expect(isTrustedUrl('https://objects.githubusercontent.com/abc')).toBe(true);
    expect(isTrustedUrl('https://github.com@evil.com/abc')).toBe(false);
  });

  it('parses checksum files', () => {
    expect(parseChecksumFile(`${SHA}  file.apk\n`)).toBe(SHA);
    expect(parseChecksumFile('')).toBeNull();
    expect(parseChecksumFile('abc')).toBeNull();
  });

  it('throttles automatic checks and tells you about each version once', () => {
    const H = 3600 * 1000;
    expect(shouldCheck(null, 0)).toBe(true);
    expect(shouldCheck(0, 5 * H)).toBe(false);
    expect(shouldCheck(0, 6 * H)).toBe(true);
    expect(shouldNotify('1.1.0', null)).toBe(true);
    expect(shouldNotify('1.1.0', '1.1.0')).toBe(false);
    expect(shouldNotify('1.2.0', '1.1.0')).toBe(true);
  });
});

describe('applyUpdate', () => {
  const apk: ApkInfo = { name: 'a.apk', url: APK_URL, sizeBytes: 1000, sha256: SHA };

  function phone(over: Partial<UpdatePorts> = {}) {
    const log: string[] = [];
    const files = new Set<string>();
    const ports: UpdatePorts = {
      apkPath: '/cache/updates/app.apk',
      canInstall: async () => true,
      openInstallSettings: async () => void log.push('settings'),
      download: async (_u, to, onProgress) => {
        files.add(to);
        onProgress(0.5);
        onProgress(1);
        log.push('download');
      },
      fileSize: async () => 1000,
      sha256: async () => SHA,
      install: async () => void log.push('install'),
      remove: async p => void files.delete(p),
      ...over,
    };
    return { ports, log, files };
  }

  it('downloads, verifies, then installs, reporting progress', async () => {
    const { ports, log } = phone();
    const seen: number[] = [];
    expect(await applyUpdate(ports, apk, f => seen.push(f))).toEqual({ state: 'installing' });
    expect(log).toEqual(['download', 'install']);
    expect(seen).toEqual([0.5, 1]);
  });

  it('asks for the install permission first and downloads nothing without it', async () => {
    const { ports, log } = phone({ canInstall: async () => false });
    expect(await applyUpdate(ports, apk)).toEqual({ state: 'needs-permission' });
    expect(log).toEqual(['settings']);
  });

  it('deletes a file with the wrong checksum and never installs it', async () => {
    const { ports, log, files } = phone({ sha256: async () => 'b'.repeat(64) });
    const r = await applyUpdate(ports, apk);
    expect(r).toMatchObject({ state: 'failed', step: 'checksum' });
    expect(log).not.toContain('install');
    expect(files.size).toBe(0);
  });

  it('deletes a file of the wrong size', async () => {
    const { ports, log, files } = phone({ fileSize: async () => 999 });
    expect(await applyUpdate(ports, apk)).toMatchObject({ state: 'failed', step: 'size' });
    expect(log).not.toContain('install');
    expect(files.size).toBe(0);
  });

  it('compares the checksum without caring about letter case', async () => {
    const { ports } = phone({ sha256: async () => SHA.toUpperCase() });
    expect((await applyUpdate(ports, apk)).state).toBe('installing');
  });

  it('cleans up a failed download', async () => {
    const { ports, files } = phone({
      download: async (_u, to) => {
        files.add(to);
        throw new Error('connection lost');
      },
    });
    const r = await applyUpdate(ports, apk);
    expect(r).toMatchObject({ state: 'failed', step: 'download' });
    expect((r as { message: string }).message).toContain('connection lost');
    expect(files.size).toBe(0);
  });

  it('reports an install that Android refuses to start', async () => {
    const { ports } = phone({
      install: async () => {
        throw new Error('no installer');
      },
    });
    expect(await applyUpdate(ports, apk)).toMatchObject({ state: 'failed', step: 'install' });
  });

  it('removes any leftover download before starting', async () => {
    const { ports, files } = phone();
    files.add(ports.apkPath);
    let removedFirst = false;
    const remove = ports.remove;
    ports.remove = async p => {
      removedFirst = removedFirst || files.has(p);
      await remove(p);
    };
    await applyUpdate(ports, apk);
    expect(removedFirst).toBe(true);
  });
});
