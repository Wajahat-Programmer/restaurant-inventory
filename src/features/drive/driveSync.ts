import { Db, schema } from '../../db/client';
import { fromBase64 } from '../../domain/base64';
import { audit } from '../../services/auditService';
import { requirePermission } from '../../services/session';
import { setSetting } from '../../services/settingsService';
import { BackupInfo } from '../backup/backupService';
import { Http, listDriveBackups, pruneDrive, uploadBackup } from './driveClient';

export interface DriveSyncPorts {
  http: Http;
  /** A fresh access token, or throws when the person is not signed in. */
  token: () => Promise<string>;
  /** Local backups, newest first. */
  localBackups: () => Promise<BackupInfo[]>;
  readBase64: (path: string) => Promise<string>;
  now: () => number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Copies the newest local backup to Drive unless Drive already has that file,
 * then tidies Drive with the same 7 daily + 4 weekly rule. Every attempt is
 * logged; a failure never touches the local backups.
 * Returns the file name sent, or null when nothing needed sending.
 */
export async function uploadLatestToDrive(db: Db, ports: DriveSyncPorts, today: string): Promise<string | null> {
  requirePermission('manage');
  try {
    const latest = (await ports.localBackups())[0];
    if (!latest) {
      throw new Error('There is no backup on this phone to send yet.');
    }
    const token = await ports.token();
    const onDrive = await listDriveBackups(ports.http, token);
    if (onDrive.some(f => f.name === latest.name)) {
      return null;
    }
    const file = await uploadBackup(ports.http, token, latest.name, fromBase64(await ports.readBase64(latest.path)));
    await db.insert(schema.backupLog).values({
      kind: 'drive',
      status: 'ok',
      fileName: file.name,
      sizeBytes: file.sizeBytes,
      driveFileId: file.id,
    });
    await setSetting(db, 'drive.lastOkAt', String(ports.now()));
    await audit(db, 'backup.drive', 'backup', null, { file: file.name, bytes: file.sizeBytes });
    await pruneDrive(ports.http, token, today).catch(() => undefined);
    return file.name;
  } catch (e) {
    await db.insert(schema.backupLog).values({ kind: 'drive', status: 'failed', error: message(e).slice(0, 300) });
    throw e;
  }
}
