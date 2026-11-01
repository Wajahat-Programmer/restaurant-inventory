import { useEffect } from 'react';
import { AppState } from 'react-native';
import { backupDue } from '../domain/backup';
import { allowed } from '../services/session';
import { alerts } from '../services/forecastService';
import { getSetting, setSetting } from '../services/settingsService';
import { loadBackupPassphrase, backupPorts } from './backup/devicePorts';
import type { DbHandle } from './backup/backupService';
import { backupStatus, runLocalBackup } from './backup/runBackup';
import { driveConfigured, driveSyncPorts } from './drive/driveDevice';
import { uploadLatestToDrive } from './drive/driveSync';
import { useDbHost } from './DbProvider';
import { notifyAlerts, notifyBackupFailing, notifyUpdate } from './notify/notify';
import { installedVersion, timedFetch } from './update/devicePorts';
import { getDevFeed } from './update/devFeed';
import { claimAnnouncement, runUpdateCheck } from './update/updateController';
import { todayISO } from './ui';

const HOUR = 3600 * 1000;

/**
 * Quiet jobs that run when the app opens or comes back to the front:
 * look for an app update, remind about stock alerts (once a day), and make the
 * daily backup if one is due. Each is best effort and never interrupts the
 * person; a failure is logged and tried again next time.
 */
export async function runAutoChecks(handle: DbHandle, now = Date.now()): Promise<void> {
  const { db } = handle;
  const today = todayISO(new Date(now));

  const update = await runUpdateCheck(
    db,
    {
      fetch: timedFetch,
      currentVersion: installedVersion,
      now: () => now,
      ...(__DEV__ ? await getDevFeed() : {}),
    },
    { manual: false },
  );
  if (update.state === 'available' && allowed('manage') && (await claimAnnouncement(db, update.latest))) {
    await notifyUpdate(update.latest);
  }

  if (allowed('record') && (await getSetting(db, 'alerts.lastNotified')) !== today) {
    const list = await alerts(db, today);
    if (list.length) {
      await notifyAlerts(list.map(a => a.message));
    }
    await setSetting(db, 'alerts.lastNotified', today);
  }

  if (!allowed('manage')) {
    return;
  }
  const pass = await loadBackupPassphrase();
  const lastBackup = await getSetting(db, 'backup.lastOkAt');
  if (pass && backupDue(lastBackup ? Number(lastBackup) : null, now)) {
    const version = (await installedVersion()) ?? '0.0.0';
    await runLocalBackup(db, backupPorts(version), handle, pass, today).catch(() => undefined);
  }

  // Google Drive: a day between good copies, and an hour between attempts, so being
  // offline does not call Google (and log a failure) every time the app comes forward.
  if (driveConfigured() && (await getSetting(db, 'drive.enabled')) === '1') {
    const lastDrive = await getSetting(db, 'drive.lastOkAt');
    const lastTry = Number(await getSetting(db, 'drive.lastTryAt')) || 0;
    if (backupDue(lastDrive ? Number(lastDrive) : null, now) && now - lastTry >= HOUR) {
      await setSetting(db, 'drive.lastTryAt', String(now));
      const version = (await installedVersion()) ?? '0.0.0';
      await uploadLatestToDrive(db, driveSyncPorts(backupPorts(version)), today).catch(() => undefined);
    }
  }

  if ((await backupStatus(db, now)).failingTwoDays && (await getSetting(db, 'backup.warnedOn')) !== today) {
    await notifyBackupFailing();
    await setSetting(db, 'backup.warnedOn', today);
  }
}

/** Runs the quiet jobs now, and again each time the app comes to the front. */
export function AutoChecks() {
  const { handle } = useDbHost();

  useEffect(() => {
    if (!handle) {
      return;
    }
    let running = false;
    const run = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        await runAutoChecks(handle);
      } catch {
        // Best effort: never let a background check bother the person.
      } finally {
        running = false;
      }
    };
    run();
    const sub = AppState.addEventListener('change', s => s === 'active' && run());
    return () => sub.remove();
  }, [handle]);

  return null;
}
