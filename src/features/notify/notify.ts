import notifee, { AndroidImportance, AuthorizationStatus } from '@notifee/react-native';

const CHANNEL_ID = 'alerts';

async function ensureChannel(): Promise<string> {
  return notifee.createChannel({ id: CHANNEL_ID, name: 'Alerts and updates', importance: AndroidImportance.DEFAULT });
}

/**
 * Shows a local notification (no server involved). Quietly does nothing if
 * the phone has notifications turned off for the app.
 * `tag` replaces an earlier notification with the same tag instead of piling up.
 */
export async function notify(title: string, body: string, tag: string): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    if (settings.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
      return false;
    }
    await notifee.displayNotification({
      id: tag,
      title,
      body,
      android: { channelId: await ensureChannel(), pressAction: { id: 'default' }, smallIcon: 'ic_launcher' },
    });
    return true;
  } catch {
    return false;
  }
}

export const notifyUpdate = (version: string) =>
  notify('Update available', `Version ${version} of Restaurant Inventory is ready. Open Settings to install it.`, 'update');

export const notifyBackupFailing = () =>
  notify('Backups are failing', 'The last two days of backups did not work. Open Data and backup to see why.', 'backup');

export const notifyAlerts = (messages: string[]) =>
  messages.length
    ? notify(
        messages.length === 1 ? 'Needs attention' : `${messages.length} things need attention`,
        messages.slice(0, 3).join('\n'),
        'alerts',
      )
    : Promise.resolve(false);
