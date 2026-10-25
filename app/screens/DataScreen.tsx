import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { parseCsv } from '../../src/domain/csv';
import { periodRange } from '../../src/domain/periods';
import { BackupError } from '../../src/domain/crypto';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { backupPorts, forgetBackupPassphrase, loadBackupPassphrase, saveBackupPassphrase } from '../../src/features/backup/devicePorts';
import { BackupInfo, listBackups, restoreBackup } from '../../src/features/backup/backupService';
import { backupStatus, runLocalBackup } from '../../src/features/backup/runBackup';
import { useQuery, useWrite } from '../../src/features/data';
import { useDb, useDbHost } from '../../src/features/DbProvider';
import { pickFile, readText, saveText, shareFile } from '../../src/features/files/fileTools';
import {
  ITEM_COLUMNS,
  previewItems,
  previewRecipes,
  previewSuppliers,
  Preview,
  TEMPLATES,
} from '../../src/features/importExport/csvImport';
import { DriveFile, listDriveBackups } from '../../src/features/drive/driveClient';
import { connectDrive, disconnectDrive, downloadFromDrive, driveAccessToken, driveConfigured, driveSyncPorts, fetchHttp } from '../../src/features/drive/driveDevice';
import { uploadLatestToDrive } from '../../src/features/drive/driveSync';
import { installedVersion } from '../../src/features/update/devicePorts';
import { Body, Btn, ErrorText, Select, todayISO, useColors } from '../../src/features/ui';
import { audit } from '../../src/services/auditService';
import { getSetting, setSetting } from '../../src/services/settingsService';
import { EXPORTS, ExportKind, exportCsv } from '../../src/services/exportService';
import { existingNames, importItems, importRecipes, importSuppliers } from '../../src/services/importService';
import { spacing } from '../../src/theme/tokens';

type ImportKind = 'items' | 'suppliers' | 'recipes';

const IMPORTS: { kind: ImportKind; label: string }[] = [
  { kind: 'items', label: 'Items (with opening stock)' },
  { kind: 'suppliers', label: 'Suppliers' },
  { kind: 'recipes', label: 'Dishes and recipes' },
];

const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const stamp = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function DataScreen() {
  const c = useColors();
  const db = useDb();
  const write = useWrite();
  const auth = useAuth();
  const { handle, replace } = useDbHost();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => {
    setNote(null);
    setError(message(e));
  };

  /* ------------------------------ export ------------------------------ */
  const month = periodRange('month', todayISO());
  const [exportKind, setExportKind] = useState<ExportKind>('items');
  const [from, setFrom] = useState(month.from);
  const [to, setTo] = useState(todayISO());
  const needsRange = EXPORTS.find(e => e.kind === exportKind)?.needsRange ?? false;

  const runExport = async () => {
    setError(null);
    try {
      const out = await exportCsv(db, exportKind, from, to);
      const path = await saveText(out.fileName, out.text);
      await shareFile(path, 'text/csv');
      setNote(`✓ ${out.fileName} is ready to share or save.`);
    } catch (e) {
      fail(e);
    }
  };

  /* ------------------------------ import ------------------------------ */
  const [importKind, setImportKind] = useState<ImportKind>('items');
  const [preview, setPreview] = useState<{ kind: ImportKind; p: Preview<unknown> } | null>(null);

  const template = async () => {
    try {
      const name = `${importKind}-template.csv`;
      await shareFile(await saveText(name, TEMPLATES[importKind]), 'text/csv');
    } catch (e) {
      fail(e);
    }
  };

  const chooseCsv = async () => {
    setError(null);
    setNote(null);
    setPreview(null);
    try {
      const file = await pickFile();
      if (!file) {
        return;
      }
      const rows = parseCsv(await readText(file.path));
      const names = await existingNames(db);
      const p =
        importKind === 'items'
          ? previewItems(rows, { names: names.items, barcodes: names.barcodes })
          : importKind === 'suppliers'
          ? previewSuppliers(rows, names.suppliers)
          : previewRecipes(rows, names.itemIds, names.recipes);
      setPreview({ kind: importKind, p: p as Preview<unknown> });
    } catch (e) {
      fail(e);
    }
  };

  const commitImport = async () => {
    if (!preview || preview.p.valid.length === 0) {
      return;
    }
    setError(null);
    const rows = preview.p.valid as never[];
    const res = await write(d =>
      preview.kind === 'items' ? importItems(d, rows) : preview.kind === 'suppliers' ? importSuppliers(d, rows) : importRecipes(d, rows),
    );
    if (res.ok) {
      setNote(`✓ Imported ${res.value} ${preview.kind === 'recipes' ? 'dishes' : preview.kind}.`);
      setPreview(null);
    } else {
      fail(res.error);
    }
  };

  /* ------------------------------ backup ------------------------------ */
  const [driveTick, setDriveTick] = useState(0);
  const { data, error: loadError } = useQuery(async d => ({
    hasPass: !!(await loadBackupPassphrase()),
    status: await backupStatus(d, Date.now()),
    version: (await installedVersion()) ?? '0.0.0',
    driveAccount: await getSetting(d, 'drive.account'),
    driveLastOkAt: await getSetting(d, 'drive.lastOkAt'),
  }), [driveTick]);
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [restoring, setRestoring] = useState<BackupInfo | null>(null);
  const [restorePass, setRestorePass] = useState('');

  const ports = () => backupPorts(data?.version ?? '0.0.0');
  const refreshList = async () => setBackups(await listBackups(ports()));

  const savePass = async () => {
    setError(null);
    if (pass1.trim().length < 8) {
      return fail('The backup passphrase must be at least 8 characters.');
    }
    if (pass1 !== pass2) {
      return fail('The two passphrases are not the same.');
    }
    try {
      await saveBackupPassphrase(pass1);
      setPass1('');
      setPass2('');
      setNote('✓ Passphrase saved on this phone. Write it down: you need it to restore on a new phone.');
      await write(async d => audit(d, 'backup.passphrase', 'backup', null));
    } catch (e) {
      fail(e);
    }
  };

  const backupNow = async () => {
    setError(null);
    setBusy('Backing up… this can take a few seconds.');
    try {
      const pass = await loadBackupPassphrase();
      if (!pass || !handle) {
        throw new Error('Set a backup passphrase first.');
      }
      const info = await runLocalBackup(db, ports(), handle, pass, todayISO());
      setNote(`✓ Backup saved: ${info.name} (${mb(info.sizeBytes)})`);
      await refreshList();
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const confirmRestore = async () => {
    if (!restoring || !handle) {
      return;
    }
    setError(null);
    setBusy('Restoring… do not close the app.');
    try {
      // A safety copy of what is on the phone now, so a mistaken restore can be undone.
      await runLocalBackup(db, ports(), handle, restorePass, todayISO(), { keep: [restoring.name] });
      const r = await restoreBackup(ports(), handle, restoring.path, restorePass);
      replace(r.handle);
      await audit(r.handle.db, 'backup.restore', 'backup', null, { file: restoring.name });
      await auth.refresh();
      setRestoring(null);
      setRestorePass('');
      setNote(`✓ Restored from ${restoring.name}. A safety copy of the earlier data was saved first.`);
      await refreshList();
    } catch (e) {
      fail(e instanceof BackupError ? e.message : e);
    }
    setBusy(null);
  };

  const restoreFromFile = async () => {
    setError(null);
    try {
      const target = `${ports().dirs.backups}/restaurant-imported-${Date.now()}.rimbak`;
      const file = await pickFile({ copyTo: target });
      if (file) {
        await refreshList();
        setNote('✓ The file was added to the list below. Choose Restore on it.');
      }
    } catch (e) {
      fail(e);
    }
  };

  /* ----------------------------- google drive ----------------------------- */
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const driveAccount = data?.driveAccount ?? '';

  const driveConnect = async () => {
    setError(null);
    try {
      const email = await connectDrive();
      if (email) {
        await setSetting(db, 'drive.account', email);
        await setSetting(db, 'drive.enabled', '1');
        await write(async d => audit(d, 'drive.connect', 'backup', null, { account: email }));
        setDriveTick(t => t + 1);
        setNote(`✓ Connected to Google Drive as ${email}. Backups are sent there daily.`);
      }
    } catch (e) {
      fail(e);
    }
  };

  const driveDisconnect = async () => {
    try {
      await disconnectDrive().catch(() => undefined);
      await setSetting(db, 'drive.enabled', '0');
      await setSetting(db, 'drive.account', '');
      setDriveFiles([]);
      setDriveTick(t => t + 1);
      setNote('Google Drive disconnected. Copies already in Drive stay there.');
    } catch (e) {
      fail(e);
    }
  };

  const driveSendNow = async () => {
    setError(null);
    setBusy('Sending to Google Drive…');
    try {
      const pass = await loadBackupPassphrase();
      if (!pass || !handle) {
        throw new Error('Set a backup passphrase first.');
      }
      await runLocalBackup(db, ports(), handle, pass, todayISO());
      const sent = await uploadLatestToDrive(db, driveSyncPorts(ports()), todayISO());
      setNote(sent ? `✓ ${sent} is now in Google Drive.` : '✓ Google Drive already has the latest backup.');
      setDriveTick(t => t + 1);
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  const driveList = async () => {
    setError(null);
    try {
      setDriveFiles(await listDriveBackups(fetchHttp, await driveAccessToken()));
    } catch (e) {
      fail(e);
    }
  };

  const driveGet = async (f: DriveFile) => {
    setError(null);
    setBusy('Downloading from Google Drive…');
    try {
      await downloadFromDrive(f, `${ports().dirs.backups}/${f.name}`);
      await refreshList();
      setNote(`✓ ${f.name} was added to the list on this phone. Choose Restore on it.`);
    } catch (e) {
      fail(e);
    }
    setBusy(null);
  };

  return (
    <Body>
      <ErrorText message={error ?? loadError} />
      {note && <Text testID="data-note">{note}</Text>}
      {busy && <Text testID="data-busy" style={{ color: c.warning }}>{busy}</Text>}

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Export to a spreadsheet</Text>
          <Select testID="export-kind" label="What to export" value={exportKind} options={EXPORTS.map(e => ({ value: e.kind, label: e.label }))} onChange={setExportKind} />
          {needsRange && (
            <View style={styles.row}>
              <TextInput mode="outlined" style={styles.flex} testID="export-from" label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} />
              <TextInput mode="outlined" style={styles.flex} testID="export-to" label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} />
            </View>
          )}
          <Btn testID="export-run" mode="contained" icon="file-export" onPress={runExport}>
            Export and share
          </Btn>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Import from a spreadsheet</Text>
          <Text style={{ color: c.textSecondary }}>
            Download the template, fill it in (Excel or Google Sheets, save as CSV), then choose the file. You see every problem before anything is added.
          </Text>
          <Select testID="import-kind" label="What to import" value={importKind} options={IMPORTS.map(i => ({ value: i.kind, label: i.label }))} onChange={k => { setImportKind(k); setPreview(null); }} />
          <View style={styles.row}>
            <Btn testID="import-template" onPress={template}>
              Get template
            </Btn>
            <Btn testID="import-pick" mode="contained-tonal" icon="file-import" onPress={chooseCsv}>
              Choose file
            </Btn>
          </View>
          {preview && (
            <View style={styles.gap} testID="import-preview">
              {preview.p.fatal ? (
                <Text style={{ color: c.danger }}>{`✖ ${preview.p.fatal}`}</Text>
              ) : (
                <>
                  <Text testID="import-summary">
                    {`${preview.p.valid.length} ready to import${preview.p.errors.length ? `, ${preview.p.errors.length} with problems` : ''}.`}
                  </Text>
                  {preview.p.errors.slice(0, 15).map(e => (
                    <Text key={`${e.line}-${e.message}`} style={{ color: c.danger }}>{`✖ Line ${e.line}: ${e.message}`}</Text>
                  ))}
                  {preview.p.errors.length > 15 && <Text>{`…and ${preview.p.errors.length - 15} more.`}</Text>}
                  {preview.p.valid.length > 0 && (
                    <Btn testID="import-commit" mode="contained" onPress={commitImport}>
                      {preview.p.errors.length
                        ? `Import ${preview.p.valid.length} good rows, skip the rest`
                        : `Import ${preview.p.valid.length} rows`}
                    </Btn>
                  )}
                </>
              )}
            </View>
          )}
          {importKind === 'items' && <Text style={{ color: c.textSecondary }}>{`Columns: ${ITEM_COLUMNS.map(i => i.label).join(', ')}.`}</Text>}
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Backup and restore</Text>
          <Text style={{ color: c.textSecondary }}>
            A backup holds everything: items, stock, sales, money and photos. It is locked with your passphrase, so only you can open it.
          </Text>

          {!data?.hasPass ? (
            <>
              <TextInput mode="outlined" testID="field-pass1" label="Backup passphrase (at least 8 characters)" secureTextEntry value={pass1} onChangeText={setPass1} />
              <TextInput mode="outlined" testID="field-pass2" label="Type it again" secureTextEntry value={pass2} onChangeText={setPass2} />
              <Text style={{ color: c.warning }}>⚠ Write this passphrase down. Without it a backup cannot be opened, and nobody can recover it for you.</Text>
              <Btn testID="save-passphrase" mode="contained" onPress={savePass}>
                Save passphrase
              </Btn>
            </>
          ) : (
            <>
              <Text testID="backup-last">
                {data.status.lastOkAt ? `Last good backup: ${stamp(data.status.lastOkAt)}` : 'No backup yet.'}
              </Text>
              {data.status.failingTwoDays && (
                <Text testID="backup-failing" style={{ color: c.danger }}>
                  ✖ Backups have failed for two days. Check free space on the phone and back up again.
                </Text>
              )}
              <Btn testID="backup-now" mode="contained" icon="cloud-upload" disabled={!!busy} onPress={backupNow}>
                Back up now
              </Btn>
              <Btn
                testID="forget-passphrase"
                textColor={c.danger}
                onPress={async () => {
                  await forgetBackupPassphrase();
                  setNote('Passphrase forgotten on this phone. Automatic backups stop until you set one again.');
                }}>
                Forget the saved passphrase
              </Btn>
            </>
          )}

          <Btn testID="backups-list" icon="refresh" onPress={refreshList}>
            Show backups on this phone
          </Btn>
          {backups.map(b => (
            <View key={b.name} style={styles.row} testID={`backup-${b.name}`}>
              <View style={styles.flex}>
                <Text>{b.name}</Text>
                <Text style={{ color: c.textSecondary }}>{mb(b.sizeBytes)}</Text>
              </View>
              <Btn onPress={() => shareFile(b.path, 'application/octet-stream')}>Share</Btn>
              <Btn testID={`restore-${b.name}`} textColor={c.danger} onPress={() => { setRestoring(b); setError(null); }}>
                Restore
              </Btn>
            </View>
          ))}
          <Btn testID="restore-from-file" icon="folder-open" onPress={restoreFromFile}>
            Add a backup file from elsewhere
          </Btn>

          <Text variant="titleSmall">Google Drive</Text>
          {!driveConfigured() ? (
            <Text testID="drive-not-set-up" style={{ color: c.textSecondary }}>
              Google Drive backup is not set up in this build. It needs a Google Cloud sign-in key (see the manual, Backup chapter). Local backups work without it.
            </Text>
          ) : !driveAccount ? (
            <>
              <Text style={{ color: c.textSecondary }}>
                Keep a second copy in your own Google Drive. It goes in a hidden app folder that only this app can see, still locked with your passphrase.
              </Text>
              <Btn testID="drive-connect" icon="google-drive" onPress={driveConnect}>
                Connect Google Drive
              </Btn>
            </>
          ) : (
            <>
              <Text testID="drive-account">{`✓ Connected: ${driveAccount}`}</Text>
              <Text testID="drive-last">
                {data?.driveLastOkAt ? `Last copy sent: ${stamp(Number(data.driveLastOkAt))}` : 'Nothing sent to Drive yet.'}
              </Text>
              <Btn testID="drive-send" icon="cloud-upload" disabled={!!busy} onPress={driveSendNow}>
                Send a backup to Drive now
              </Btn>
              <Btn testID="drive-list" icon="refresh" onPress={driveList}>
                Show backups in Drive
              </Btn>
              {driveFiles.map(f => (
                <View key={f.id} style={styles.row} testID={`drive-file-${f.name}`}>
                  <View style={styles.flex}>
                    <Text>{f.name}</Text>
                    <Text style={{ color: c.textSecondary }}>{mb(f.sizeBytes)}</Text>
                  </View>
                  <Btn disabled={!!busy} onPress={() => driveGet(f)}>Download</Btn>
                </View>
              ))}
              <Btn testID="drive-disconnect" textColor={c.danger} onPress={driveDisconnect}>
                Disconnect Google Drive
              </Btn>
            </>
          )}

          {restoring && (
            <View style={[styles.gap, styles.warn, { borderColor: c.danger }]} testID="restore-panel">
              <Text variant="titleSmall" style={{ color: c.danger }}>{`✖ Replace everything with ${restoring.name}?`}</Text>
              <Text>
                All current items, stock, sales and money on this phone will be replaced by what is in the backup. A safety backup of the current data is made first.
              </Text>
              <TextInput mode="outlined" testID="field-restore-pass" label="Passphrase of this backup" secureTextEntry value={restorePass} onChangeText={setRestorePass} />
              <View style={styles.row}>
                <Btn testID="cancel-restore" onPress={() => setRestoring(null)}>
                  Cancel
                </Btn>
                <Btn testID="confirm-restore" mode="contained" disabled={!restorePass || !!busy} onPress={confirmRestore}>
                  Replace my data
                </Btn>
              </View>
            </View>
          )}
        </Card.Content>
      </Card>
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  warn: { borderWidth: 2, borderRadius: spacing.sm, padding: spacing.md },
});
