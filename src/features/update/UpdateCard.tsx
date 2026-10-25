import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, ProgressBar, Switch, Text } from 'react-native-paper';
import { useDb } from '../DbProvider';
import { useQuery, useWrite } from '../data';
import { getSetting, setSetting } from '../../services/settingsService';
import { Btn, useColors } from '../ui';
import { spacing } from '../../theme/tokens';
import { applyUpdate } from './applyUpdate';
import { UpdateCheck } from './checkForUpdate';
import { installedVersion, timedFetch, updatePorts } from './devicePorts';
import { getDevFeed } from './devFeed';
import { runUpdateCheck } from './updateController';

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const when = (ms: string) => {
  if (!ms) {
    return 'never';
  }
  const d = new Date(Number(ms));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Settings card: what is installed, a button to look for a new version, and the install step. */
export function UpdateCard() {
  const c = useColors();
  const db = useDb();
  const write = useWrite();
  const { data } = useQuery(async d => ({
    version: await installedVersion(),
    last: await getSetting(d, 'update.lastCheck'),
    auto: (await getSetting(d, 'update.autoCheck')) === '1',
  }));
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    setMessage(null);
    const r = await runUpdateCheck(
      db,
      {
        fetch: timedFetch,
        currentVersion: installedVersion,
        now: Date.now,
        ...(__DEV__ ? await getDevFeed() : {}),
      },
      { manual: true },
    );
    setChecking(false);
    if (r.state !== 'skipped') {
      setResult(r);
    }
  };

  const install = async () => {
    if (result?.state !== 'available') {
      return;
    }
    setMessage(null);
    setProgress(0);
    const r = await applyUpdate(updatePorts, result.apk, setProgress);
    setProgress(null);
    if (r.state === 'needs-permission') {
      setMessage('Allow Restaurant Inventory to install apps on the screen that just opened, come back, and tap Install again.');
    } else if (r.state === 'failed') {
      setMessage(`✖ ${r.message}`);
    } else {
      setMessage('Android is asking you to confirm the update. Tap Update there.');
    }
  };

  return (
    <Card testID="update-card">
      <Card.Content style={styles.gap}>
        <Text variant="titleMedium">App updates</Text>
        <Text testID="update-version">{`Installed version: ${data?.version ?? 'unknown'}`}</Text>
        <Text testID="update-last" style={{ color: c.textSecondary }}>{`Last checked: ${when(data?.last ?? '')}`}</Text>

        <Btn testID="check-updates" mode="contained" icon="update" loading={checking} disabled={checking || progress !== null} onPress={check}>
          Check for updates
        </Btn>

        {result?.state === 'up-to-date' && (
          <Text testID="update-status" style={{ color: c.success }}>{`✓ You have the latest version (${result.latest}).`}</Text>
        )}
        {result?.state === 'error' && (
          <Text testID="update-status" style={{ color: c.danger }}>{`✖ ${result.message}`}</Text>
        )}
        {result?.state === 'available' && (
          <View style={styles.gap}>
            <Text testID="update-status" style={{ color: c.warning }}>
              {`⚠ Version ${result.latest} is available (you have ${result.current}). ${mb(result.apk.sizeBytes)}`}
            </Text>
            {!!result.notes && <Text testID="update-notes">{result.notes}</Text>}
            {progress !== null && <ProgressBar testID="update-progress" progress={progress} />}
            <Btn testID="install-update" mode="contained-tonal" icon="download" disabled={progress !== null} onPress={install}>
              {progress === null ? 'Download and install' : `Downloading ${Math.round(progress * 100)}%`}
            </Btn>
          </View>
        )}
        {!!message && <Text testID="update-message">{message}</Text>}

        <View style={styles.row}>
          <Text style={styles.flex}>Check automatically (at most every 6 hours)</Text>
          <Switch
            testID="update-auto"
            value={data?.auto ?? true}
            onValueChange={async on => {
              await write(d => setSetting(d, 'update.autoCheck', on ? '1' : '0'));
            }}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
