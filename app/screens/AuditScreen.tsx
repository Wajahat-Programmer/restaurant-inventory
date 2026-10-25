import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '../../src/features/data';
import { Body, ErrorText, useColors } from '../../src/features/ui';
import { listAudit } from '../../src/services/auditService';
import { spacing } from '../../src/theme/tokens';

const LABEL: Record<string, string> = {
  login: 'Signed in',
  'login.biometric': 'Signed in with fingerprint',
  'login.failed': 'Wrong PIN',
  'lock.setup': 'Turned the PIN lock on',
  'lock.off': 'Turned the PIN lock off',
  'pin.change': 'Changed a PIN',
  'pin.reset': 'Reset the owner PIN',
  'user.add': 'Added a person',
  'user.remove': 'Removed a person',
  'purchase.void': 'Cancelled a purchase',
  'sale.void': 'Cancelled a sale',
  'expense.add': 'Added an expense',
  'expense.void': 'Cancelled an expense',
  'cash.manual': 'Manual cash entry',
  'stock.adjust': 'Adjusted stock',
  'count.post': 'Posted a stock count',
  'recipe.update': 'Changed a dish',
  'import.items': 'Imported items',
  'import.suppliers': 'Imported suppliers',
  'import.recipes': 'Imported dishes',
  'backup.create': 'Made a backup',
  'backup.restore': 'Restored a backup',
};

const stamp = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function AuditScreen() {
  const c = useColors();
  const { data, error } = useQuery(db => listAudit(db, 200));
  return (
    <Body>
      <ErrorText message={error} />
      {data?.length === 0 && <Text style={{ color: c.textSecondary }}>Nothing recorded yet.</Text>}
      {(data ?? []).map(a => (
        <View key={a.id} style={styles.row} testID={`audit-${a.action}`}>
          <Text>{LABEL[a.action] ?? a.action}</Text>
          <Text style={{ color: c.textSecondary }}>{`${a.actor} · ${stamp(a.createdAt)}`}</Text>
        </View>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({ row: { paddingVertical: spacing.sm } });
