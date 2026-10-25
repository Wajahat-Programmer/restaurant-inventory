import { desc } from 'drizzle-orm';
import { Db, schema } from '../../db/client';
import { failingForTwoDays } from '../../domain/backup';
import { audit } from '../../services/auditService';
import { ValidationError } from '../../services/errors';
import { requirePermission } from '../../services/session';
import { getSetting, setSetting } from '../../services/settingsService';
import { BackupInfo, BackupPorts, createBackup, DbHandle, pruneBackups } from './backupService';

const { backupLog } = schema;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One backup attempt, start to finish: make the file, record the result (good
 * or bad, so failures are visible), remember when it last worked, and tidy
 * up old backups. Never leaves a half-made file.
 */
export async function runLocalBackup(
  db: Db,
  ports: BackupPorts,
  live: DbHandle,
  passphrase: string,
  today: string,
): Promise<BackupInfo> {
  requirePermission('manage');
  try {
    const info = await createBackup(ports, live, passphrase);
    await db.insert(backupLog).values({ kind: 'local', status: 'ok', fileName: info.name, sizeBytes: info.sizeBytes });
    await setSetting(db, 'backup.lastOkAt', String(ports.now().getTime()));
    await audit(db, 'backup.create', 'backup', null, { file: info.name, bytes: info.sizeBytes });
    await pruneBackups(ports, today);
    return info;
  } catch (e) {
    await db.insert(backupLog).values({ kind: 'local', status: 'failed', error: message(e).slice(0, 300) });
    throw new ValidationError(`The backup did not work: ${message(e)}`);
  }
}

export interface BackupStatus {
  lastOkAt: number | null;
  lastAttempt: { ok: boolean; at: number; error: string | null } | null;
  /** True when attempts have failed for two days with no success since. */
  failingTwoDays: boolean;
}

export async function backupStatus(db: Db, nowMs: number): Promise<BackupStatus> {
  const last = await getSetting(db, 'backup.lastOkAt');
  const log = await db.select().from(backupLog).orderBy(desc(backupLog.id)).limit(50);
  const attempts = log.map(l => ({ ok: l.status === 'ok', at: l.createdAt }));
  return {
    lastOkAt: last ? Number(last) : null,
    lastAttempt: log[0] ? { ok: log[0].status === 'ok', at: log[0].createdAt, error: log[0].error } : null,
    failingTwoDays: failingForTwoDays(attempts, nowMs),
  };
}
