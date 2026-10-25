export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/**
 * Reads "1.2.3" or "v1.2.3". Anything else (a pre-release like 1.2.3-beta, a
 * date, a typo) returns null: we only ever publish plain releases, so an odd
 * tag must never be offered as an update.
 */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d{1,4})\.(\d{1,2})\.(\d{1,2})$/.exec(text.trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}

export function formatVersion(v: Version): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function compareVersions(a: Version, b: Version): -1 | 0 | 1 {
  for (const k of ['major', 'minor', 'patch'] as const) {
    if (a[k] !== b[k]) {
      return a[k] < b[k] ? -1 : 1;
    }
  }
  return 0;
}

/**
 * Android's versionCode must grow with every release. This keeps it in step
 * with the version: 1.2.3 -> 10203. Minor and patch stay under 100.
 */
export function versionCode(v: Version): number {
  return v.major * 10000 + v.minor * 100 + v.patch;
}

/** Whether `latest` is a newer release than `current`. */
export function isNewer(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  return !!l && !!c && compareVersions(l, c) > 0;
}
