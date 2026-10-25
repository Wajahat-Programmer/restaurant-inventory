import { addDays, periodRange } from './periods';

export const BACKUP_FORMAT = 1;
export const APP_ID = 'restaurant-inventory';

/** Describes what is inside a backup. Stored as manifest.json beside the data. */
export interface Manifest {
  app: typeof APP_ID;
  format: number;
  appVersion: string;
  /** How many migrations the database had been through. */
  schemaVersion: number;
  createdAt: string;
  dbSha256: string;
  photoCount: number;
}

export type ManifestCheck = { ok: true; manifest: Manifest } | { ok: false; message: string };

/**
 * Decides whether a backup can be restored by this app. A backup from a newer
 * schema is refused (the app would not understand it); an older one is fine
 * because migrations bring it up to date.
 */
export function checkManifest(raw: unknown, currentSchema: number): ManifestCheck {
  const m = raw as Partial<Manifest> | null;
  if (!m || typeof m !== 'object' || m.app !== APP_ID) {
    return { ok: false, message: 'This backup is not from Restaurant Inventory.' };
  }
  if (typeof m.format !== 'number' || m.format > BACKUP_FORMAT) {
    return { ok: false, message: 'This backup was made by a newer version of the app. Update the app first.' };
  }
  if (typeof m.schemaVersion !== 'number' || m.schemaVersion < 1) {
    return { ok: false, message: 'This backup has no valid data version.' };
  }
  if (m.schemaVersion > currentSchema) {
    return { ok: false, message: 'This backup holds data from a newer version of the app. Update the app first.' };
  }
  if (typeof m.dbSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(m.dbSha256)) {
    return { ok: false, message: 'This backup has no checksum for its data.' };
  }
  if (typeof m.createdAt !== 'string' || typeof m.appVersion !== 'string') {
    return { ok: false, message: 'This backup is missing its details.' };
  }
  return { ok: true, manifest: m as Manifest };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** restaurant-2026-10-25-2130.rimbak (local time) */
export function backupFileName(d: Date): string {
  return `restaurant-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.rimbak`;
}

/** Reads the date back out of a name made by backupFileName; null for other files. */
export function backupDate(name: string): string | null {
  const m = /^restaurant-(\d{4}-\d{2}-\d{2})-\d{4}\.rimbak$/.exec(name);
  return m ? m[1] : null;
}

export interface Retention {
  keep: string[];
  remove: string[];
}

/**
 * Keeps the newest backup of each of the last `days` days, plus the newest of
 * each of the `weeks` weeks before that. Everything else can be deleted. Files
 * that are not ours are never touched.
 */
export function retention(names: string[], today: string, days = 7, weeks = 4): Retention {
  const mine = names
    .map(name => ({ name, date: backupDate(name) }))
    .filter((f): f is { name: string; date: string } => f.date !== null)
    .sort((a, b) => (a.name < b.name ? 1 : -1)); // newest first

  const keep = new Set<string>();
  const dailyFrom = addDays(today, -(days - 1));
  const seenDays = new Set<string>();
  const seenWeeks = new Set<string>();
  const weeklyFrom = periodRange('week', addDays(dailyFrom, -1)).from;
  const weeklyUntil = addDays(weeklyFrom, -7 * (weeks - 1));

  for (const f of mine) {
    if (f.date >= dailyFrom) {
      if (!seenDays.has(f.date)) {
        seenDays.add(f.date);
        keep.add(f.name);
      }
      continue;
    }
    const week = periodRange('week', f.date).from;
    if (week <= weeklyFrom && week >= weeklyUntil && !seenWeeks.has(week)) {
      seenWeeks.add(week);
      keep.add(f.name);
    }
  }
  return {
    keep: mine.filter(f => keep.has(f.name)).map(f => f.name),
    remove: mine.filter(f => !keep.has(f.name)).map(f => f.name),
  };
}

/** Whether a scheduled backup is due: none yet, or the last good one is over 24 hours old. */
export function backupDue(lastOkMs: number | null, nowMs: number): boolean {
  return lastOkMs === null || nowMs - lastOkMs >= 24 * 3600 * 1000;
}

/** Notify when backups have failed for two days running. */
export function failingForTwoDays(log: { ok: boolean; at: number }[], nowMs: number): boolean {
  const lastOk = log.filter(l => l.ok).reduce((a, l) => Math.max(a, l.at), 0);
  const failures = log.filter(l => !l.ok && l.at > lastOk);
  return failures.length > 0 && nowMs - Math.min(...failures.map(f => f.at)) >= 2 * 24 * 3600 * 1000;
}
