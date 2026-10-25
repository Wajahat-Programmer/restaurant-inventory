import { downloadFile, readFile, stat } from '@dr.pogodin/react-native-fs';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { BackupPorts, listBackups } from '../backup/backupService';
import { DRIVE_WEB_CLIENT_ID } from './config';
import { DRIVE_SCOPE, DriveError, DriveFile, Http } from './driveClient';
import { DriveSyncPorts } from './driveSync';

export const driveConfigured = () => DRIVE_WEB_CLIENT_ID.length > 0;

let configured = false;
function configure() {
  if (!driveConfigured()) {
    throw new DriveError('auth', 'Google Drive is not set up in this build yet.');
  }
  if (!configured) {
    GoogleSignin.configure({ webClientId: DRIVE_WEB_CLIENT_ID, scopes: [DRIVE_SCOPE] });
    configured = true;
  }
}

/** Opens Google's own sign-in screen. Returns the account's email, or null if closed. */
export async function connectDrive(): Promise<string | null> {
  configure();
  await GoogleSignin.hasPlayServices();
  const r = await GoogleSignin.signIn();
  return r.type === 'success' ? r.data.user.email : null;
}

export async function disconnectDrive(): Promise<void> {
  configure();
  await GoogleSignin.signOut();
}

async function accessToken(): Promise<string> {
  configure();
  const r = await GoogleSignin.signInSilently();
  if (r.type !== 'success') {
    throw new DriveError('auth', 'Google Drive is not connected. Connect it again in Data.');
  }
  return (await GoogleSignin.getTokens()).accessToken;
}

export const fetchHttp: Http = (url, init) => fetch(url, init as RequestInit) as unknown as ReturnType<Http>;

export function driveSyncPorts(ports: BackupPorts): DriveSyncPorts {
  return {
    http: fetchHttp,
    token: accessToken,
    localBackups: () => listBackups(ports),
    readBase64: path => readFile(path, 'base64'),
    now: Date.now,
  };
}

/** Downloads one Drive backup into the local backups folder so it can be restored like any other. */
export async function downloadFromDrive(file: DriveFile, toPath: string): Promise<void> {
  const token = await accessToken();
  const res = await downloadFile({
    fromUrl: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    toFile: toPath,
    headers: { Authorization: `Bearer ${token}` },
  }).promise;
  if (res.statusCode !== 200) {
    throw new DriveError('server', `Google Drive answered with an error (${res.statusCode}).`);
  }
  if (Number((await stat(toPath)).size) !== file.sizeBytes) {
    throw new DriveError('mismatch', 'The download was incomplete. Try again.');
  }
}

export { accessToken as driveAccessToken };
