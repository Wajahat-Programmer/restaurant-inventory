import { compareVersions, formatVersion, isNewer, parseVersion, versionCode } from './version';

describe('versions', () => {
  it('reads plain versions with or without a v', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion('v10.0.1')).toEqual({ major: 10, minor: 0, patch: 1 });
    expect(parseVersion(' v1.0.0 ')).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  it('refuses anything that is not a plain release', () => {
    for (const bad of ['', '1.2', '1.2.3.4', '1.2.3-beta', 'v1.2.3+build', 'latest', '1.x.3', '01.2.300', '-1.0.0']) {
      expect(parseVersion(bad)).toBeNull();
    }
  });

  it('compares numerically, not as text', () => {
    const v = (s: string) => parseVersion(s)!;
    expect(compareVersions(v('1.2.3'), v('1.2.3'))).toBe(0);
    expect(compareVersions(v('1.2.10'), v('1.2.9'))).toBe(1);
    expect(compareVersions(v('1.10.0'), v('1.9.9'))).toBe(1);
    expect(compareVersions(v('2.0.0'), v('10.0.0'))).toBe(-1);
  });

  it('isNewer is strict and safe with odd input', () => {
    expect(isNewer('v1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
    expect(isNewer('nonsense', '1.0.0')).toBe(false);
    expect(isNewer('1.0.1', 'nonsense')).toBe(false);
  });

  it('keeps the Android version code growing with the version', () => {
    expect(versionCode({ major: 1, minor: 2, patch: 3 })).toBe(10203);
    expect(versionCode({ major: 1, minor: 0, patch: 10 })).toBeGreaterThan(versionCode({ major: 1, minor: 0, patch: 9 }));
    expect(versionCode({ major: 1, minor: 1, patch: 0 })).toBeGreaterThan(versionCode({ major: 1, minor: 0, patch: 99 }));
    expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
  });
});
