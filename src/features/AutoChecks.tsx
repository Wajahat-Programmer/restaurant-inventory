import { useEffect } from 'react';
import { AppState } from 'react-native';
import { backupDue } from '../domain/backup';
import { allowed } from '../services/session';
import { alerts } from '../services/forecastService';
import { getSetting, setSetting } from '../services/settingsService';
import { loadBackupPassphrase, backupPorts } from './backup/devicePorts';
import { backupStatus, runLocalBackup } from './backup/runBackup';
import { useDbHost } from './DbProvider';
import { notifyAlerts, notifyBackupFailing, notifyUpdate } from './notify/notify';
import { installedVersion, timedFetch } from './update/devicePorts';
import { getDevFeed } from './update/devFeed';
import { claimAnnouncement, runUpdateCheck } from './update/updateController';
import { todayISO } from './ui';

/**
 * Quiet jobs that run when the app opens or comes back to the front:
 * look for an app update, remind about stock alerts (once a day), and make the
 * daily backup if one is due. Each is best effort and never interrupts the
 * person; a failure is logged and tried again next time.
 */
export function AutoChecks() {
  const { handle } = useDbHost();

  useEffect(() => {
    if (!handle) {
      return;
    }
    const { db } = handle;
    let running = false;

    const run = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        const today = todayISO();

        const update = await runUpdateCheck(
          db,
          {
            fetch: timedFetch,
            currentVersion: installedVersion,
            now: Date.now,
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

        if (allowed('manage')) {
          const pass = await loadBackupPassphrase();
          const last = await getSetting(db, 'backup.lastOkAt');
          if (pass && backupDue(last ? Number(last) : null, Date.now())) {
            const version = (await installedVersion()) ?? '0.0.0';
            await runLocalBackup(db, backupPorts(version), handle, pass, today).catch(() => undefined);
          }
          if ((await backupStatus(db, Date.now())).failingTwoDays && (await getSetting(db, 'backup.warnedOn')) !== today) {
            await notifyBackupFailing();
            await setSetting(db, 'backup.warnedOn', today);
          }
        }
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
