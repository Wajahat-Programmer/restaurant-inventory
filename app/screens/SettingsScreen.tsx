import { StyleSheet, View } from 'react-native';
import { Card, SegmentedButtons, Text } from 'react-native-paper';
import { useQuery, useWrite } from '../../src/features/data';
import { isThemeSetting, useThemeStore } from '../../src/features/themeStore';
import { installedVersion } from '../../src/features/update/devicePorts';
import { UpdateCard } from '../../src/features/update/UpdateCard';
import { Body, Btn, ErrorText, Row, useColors } from '../../src/features/ui';
import { getIntSetting, getSetting, setSetting } from '../../src/services/settingsService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

/** A number with minus and plus buttons, big enough to hit with wet hands. */
function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  testID: string;
}) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.flex}>{label}</Text>
      <Btn testID={`${testID}-minus`} mode="outlined" disabled={value <= min} onPress={() => onChange(value - 1)}>
        －
      </Btn>
      <Text testID={testID} variant="titleMedium" style={styles.value}>
        {value}
      </Text>
      <Btn testID={`${testID}-plus`} mode="outlined" disabled={value >= max} onPress={() => onChange(value + 1)}>
        ＋
      </Btn>
    </View>
  );
}

export default function SettingsScreen({ navigation }: RootProps<'Settings'>) {
  const c = useColors();
  const write = useWrite();
  const { data, error } = useQuery(async db => ({
    theme: await getSetting(db, 'theme'),
    lead: await getIntSetting(db, 'forecast.leadDays', 0, 60),
    review: await getIntSetting(db, 'forecast.reviewDays', 1, 60),
    version: await installedVersion(),
  }));

  const save = (key: 'theme' | 'forecast.leadDays' | 'forecast.reviewDays', value: string) =>
    write(db => setSetting(db, key, value));

  return (
    <Body>
      <ErrorText message={error} />

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Appearance</Text>
          <SegmentedButtons
            value={data?.theme ?? 'system'}
            onValueChange={v => {
              if (isThemeSetting(v)) {
                useThemeStore.getState().set(v);
              }
              save('theme', v);
            }}
            buttons={[
              { value: 'system', label: 'Phone', testID: 'theme-system' },
              { value: 'light', label: 'Light', testID: 'theme-light' },
              { value: 'dark', label: 'Dark', testID: 'theme-dark' },
            ]}
          />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Ordering suggestions</Text>
          <Text style={{ color: c.textSecondary }}>
            Suggested orders cover the days until a delivery arrives plus the days until you next order, with a safety margin.
          </Text>
          <Stepper testID="lead-days" label="Days for a delivery to arrive" value={data?.lead ?? 2} min={0} max={60} onChange={n => save('forecast.leadDays', String(n))} />
          <Stepper testID="review-days" label="Days between orders" value={data?.review ?? 7} min={1} max={60} onChange={n => save('forecast.reviewDays', String(n))} />
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Security and data</Text>
          <Row>
            <Btn testID="open-security" mode="contained-tonal" icon="lock" onPress={() => navigation.navigate('Security')}>
              PIN lock and people
            </Btn>
          </Row>
          <Row>
            <Btn testID="open-data" mode="contained-tonal" icon="database" onPress={() => navigation.navigate('Data')}>
              Export, import, backup
            </Btn>
          </Row>
          <Row>
            <Btn testID="open-audit" mode="contained-tonal" icon="history" onPress={() => navigation.navigate('Audit')}>
              Who did what
            </Btn>
          </Row>
        </Card.Content>
      </Card>

      <UpdateCard />

      <Text testID="about" style={{ color: c.textSecondary }}>
        {`Restaurant Inventory ${data?.version ?? ''}. Works without internet. Your data stays on this phone.`}
      </Text>
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  flex: { flex: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  value: { minWidth: 32, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
