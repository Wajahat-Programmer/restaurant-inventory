import { Queryable } from '../../db/client';
import { isNewer } from '../../domain/version';
import { getSetting, setSetting } from '../../services/settingsService';
import { checkForUpdate, FetchLike, shouldCheck, shouldNotify, UpdateCheck } from './checkForUpdate';

/** What the controller needs from the outside world, so it can be tested without a phone. */
export interface UpdateEnv {
  fetch: FetchLike;
  /** The installed version, or null if it cannot be read. */
  currentVersion: () => Promise<string | null>;
  now: () => number;
  /** A test feed and the local hosts it may download from. Debug builds only. */
  feedUrl?: string;
  extraHosts?: string[];
}

export type CheckOutcome = UpdateCheck | { state: 'skipped'; reason: 'off' | 'recent' };

/**
 * Looks for a new version and remembers the answer. A check the owner asks for
 * always runs; an automatic one runs only if the setting is on and the last
 * check was over 6 hours ago.
 */
export async function runUpdateCheck(
  db: Queryable,
  env: UpdateEnv,
  opts: { manual: boolean },
): Promise<CheckOutcome> {
  if (!opts.manual) {
    if ((await getSetting(db, 'update.autoCheck')) !== '1') {
      return { state: 'skipped', reason: 'off' };
    }
    const last = await getSetting(db, 'update.lastCheck');
    if (!shouldCheck(last ? Number(last) : null, env.now())) {
      return { state: 'skipped', reason: 'recent' };
    }
  }

  const current = await env.currentVersion();
  if (!current) {
    return { state: 'error', kind: 'bad-release', message: 'This build cannot tell which version is installed.' };
  }
  const result = await checkForUpdate({
    currentVersion: current,
    fetch: env.fetch,
    feedUrl: env.feedUrl,
    extraHosts: env.extraHosts,
  });

  // Count the attempt even when it failed, so a dead connection is not retried on every launch.
  await setSetting(db, 'update.lastCheck', String(env.now()));
  if (result.state === 'available') {
    await setSetting(db, 'update.available', result.latest);
  } else if (result.state === 'up-to-date') {
    await setSetting(db, 'update.available', '');
  }
  return result;
}

/** The newer version found earlier, if it is still newer than what is installed. */
export async function knownUpdate(db: Queryable, current: string | null): Promise<string | null> {
  const v = await getSetting(db, 'update.available');
  return v && current && isNewer(v, current) ? v : null;
}

/** True once per version: the owner is told about a release a single time, not on every launch. */
export async function claimAnnouncement(db: Queryable, latest: string): Promise<boolean> {
  const done = await getSetting(db, 'update.notified');
  if (!shouldNotify(latest, done || null)) {
    return false;
  }
  await setSetting(db, 'update.notified', latest);
  return true;
}
