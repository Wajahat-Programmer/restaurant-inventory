import { formatVersion, isNewer, parseVersion } from '../../domain/version';

export const REPO = 'Wajahat-Programmer/restaurant-inventory';
export const FEED_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Where release files may be downloaded from. Anything else is refused. */
export const TRUSTED_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  /** GitHub reports "sha256:<hex>" for assets. */
  digest?: string | null;
}

export interface GithubRelease {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  assets?: ReleaseAsset[];
}

export interface ApkInfo {
  name: string;
  url: string;
  sizeBytes: number;
  sha256: string;
}

export type UpdateCheck =
  | { state: 'up-to-date'; current: string; latest: string }
  | {
      state: 'available';
      current: string;
      latest: string;
      notes: string;
      publishedAt: string | null;
      apk: ApkInfo;
    }
  | {
      state: 'error';
      kind: 'offline' | 'rate-limited' | 'no-releases' | 'bad-release' | 'server';
      message: string;
    };

export interface FetchLike {
  (url: string, init?: { headers?: Record<string, string>; signal?: unknown }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
    text: () => Promise<string>;
  }>;
}

const HEX64 = /^[a-f0-9]{64}$/i;

export function hostOf(url: string): string | null {
  const m = /^https:\/\/([^/:?#]+)(?::\d+)?(?:[/?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** `https` and on the allowed list; nothing else is ever downloaded. */
export function isTrustedUrl(url: string, extraHosts: string[] = []): boolean {
  const host = hostOf(url);
  return !!host && [...TRUSTED_HOSTS, ...extraHosts].includes(host);
}

function parseDigest(d: string | null | undefined): string | null {
  const m = /^sha256:([a-f0-9]{64})$/i.exec(d ?? '');
  return m ? m[1].toLowerCase() : null;
}

/** First 64-hex token of a "<hash>  <filename>" checksum file. */
export function parseChecksumFile(text: string): string | null {
  const token = text.trim().split(/\s+/)[0] ?? '';
  return HEX64.test(token) ? token.toLowerCase() : null;
}

export interface CheckOptions {
  currentVersion: string;
  fetch: FetchLike;
  feedUrl?: string;
  /** Extra hosts to trust, for testing against a local server in debug builds only. */
  extraHosts?: string[];
}

/**
 * Asks the release feed for the newest version and decides if it is an update.
 * Never throws: every failure becomes a readable `error` result.
 */
export async function checkForUpdate(opts: CheckOptions): Promise<UpdateCheck> {
  const err = (kind: Extract<UpdateCheck, { state: 'error' }>['kind'], message: string): UpdateCheck => ({
    state: 'error',
    kind,
    message,
  });
  let res;
  try {
    res = await opts.fetch(opts.feedUrl ?? FEED_URL, { headers: { Accept: 'application/vnd.github+json' } });
  } catch {
    return err('offline', 'Could not reach the update server. Check the internet connection and try again.');
  }
  if (res.status === 404) {
    return err('no-releases', 'No release has been published yet.');
  }
  if (res.status === 403 || res.status === 429) {
    return err('rate-limited', 'The update server is busy. Try again in an hour.');
  }
  if (!res.ok) {
    return err('server', `The update server answered with an error (${res.status}).`);
  }

  let rel: GithubRelease;
  try {
    rel = (await res.json()) as GithubRelease;
  } catch {
    return err('bad-release', 'The update server sent something unreadable.');
  }
  if (!rel || typeof rel.tag_name !== 'string' || rel.draft || rel.prerelease) {
    return err('no-releases', 'No release has been published yet.');
  }
  const latest = parseVersion(rel.tag_name);
  const current = parseVersion(opts.currentVersion);
  if (!latest || !current) {
    return err('bad-release', `The latest release has an unusual version (${rel.tag_name}), so it was not offered.`);
  }
  const latestText = formatVersion(latest);
  if (!isNewer(latestText, opts.currentVersion)) {
    return { state: 'up-to-date', current: formatVersion(current), latest: latestText };
  }

  const assets = rel.assets ?? [];
  const apk = assets.find(a => /\.apk$/i.test(a.name));
  if (!apk) {
    return err('bad-release', `Version ${latestText} has no app file attached, so it cannot be installed yet.`);
  }
  if (!isTrustedUrl(apk.browser_download_url, opts.extraHosts)) {
    return err('bad-release', 'The release points at an untrusted download address, so it was not offered.');
  }

  let sha = parseDigest(apk.digest);
  if (!sha) {
    const sum = assets.find(a => a.name === `${apk.name}.sha256`);
    if (sum && isTrustedUrl(sum.browser_download_url, opts.extraHosts)) {
      try {
        const r = await opts.fetch(sum.browser_download_url);
        sha = r.ok ? parseChecksumFile(await r.text()) : null;
      } catch {
        sha = null;
      }
    }
  }
  if (!sha) {
    return err('bad-release', `Version ${latestText} has no checksum, so it was not offered. This protects you from a damaged file.`);
  }

  return {
    state: 'available',
    current: formatVersion(current),
    latest: latestText,
    notes: (rel.body ?? '').trim(),
    publishedAt: rel.published_at ?? null,
    apk: { name: apk.name, url: apk.browser_download_url, sizeBytes: apk.size, sha256: sha },
  };
}

/** Check at most once per interval unless the owner asked for it. */
export function shouldCheck(lastCheckMs: number | null, nowMs: number, intervalHours = 6): boolean {
  return lastCheckMs === null || nowMs - lastCheckMs >= intervalHours * 3600 * 1000;
}

/** Tell the owner about each new version once, not on every launch. */
export function shouldNotify(latest: string, alreadyNotified: string | null): boolean {
  return latest !== alreadyNotified;
}
