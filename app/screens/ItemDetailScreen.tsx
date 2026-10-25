import { StyleSheet, View } from 'react-native';
import { Card, Divider, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, Row, StatusBadge, useColors } from '../../src/features/ui';
import { getItem, setItemActive } from '../../src/services/itemService';
import { spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

function when(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function ItemDetailScreen({ navigation, route }: RootProps<'ItemDetail'>) {
  const { itemId } = route.params;
  const c = useColors();
  const write = useWrite();
  const { data: item, error } = useQuery(db => getItem(db, itemId), [itemId]);

  if (!item) {
    return (
      <Body>
        <ErrorText message={error} />
      </Body>
    );
  }
  const q = (n: number) => formatQty(n, item.baseUnit);

  return (
    <Body>
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="headlineSmall" testID="detail-name">{item.name}</Text>
          <Text testID="detail-qty" variant="displaySmall" style={styles.num}>
            {q(item.qtyBase)}
          </Text>
          <StatusBadge status={item.status} />
          <Text testID="detail-value" style={{ color: c.textSecondary }}>
            {`Value ${formatPKR(item.valuePaisa)} · Avg cost ${
              item.qtyBase > 0 ? `${(item.avgCostPerBase / 100).toFixed(3)} Rs/${item.baseUnit}` : '—'
            }`}
          </Text>
          <Text style={{ color: c.textSecondary }}>
            {`Par ${q(item.parLevel)} · Reorder at ${q(item.reorderPoint)}`}
            {item.shelfLifeDays ? ` · Shelf life ${item.shelfLifeDays} d` : ''}
          </Text>
          {!item.isActive && <Text style={{ color: c.warning }}>⚠ Inactive: hidden from the stock list</Text>}
        </Card.Content>
      </Card>

      <Row>
        <Btn testID="act-issue" mode="contained" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'issue' })}>
          Issue
        </Btn>
        <Btn testID="act-waste" mode="contained-tonal" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'waste' })}>
          Waste
        </Btn>
        <Btn testID="act-adjust" mode="outlined" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'adjust' })}>
          Adjust
        </Btn>
      </Row>
      <Row>
        <Btn testID="act-edit" onPress={() => navigation.navigate('ItemForm', { itemId })}>Edit</Btn>
        <Btn
          testID="act-toggle-active"
          onPress={async () => {
            await write(db => setItemActive(db, itemId, !item.isActive));
          }}>
          {item.isActive ? 'Deactivate' : 'Reactivate'}
        </Btn>
      </Row>

      <Text variant="titleMedium">Supplier prices</Text>
      {item.prices.length === 0 && <Text style={{ color: c.textSecondary }}>No purchases yet.</Text>}
      {item.prices.map(p => (
        <Text key={p.supplierId} testID={`price-${p.supplierName}`} style={styles.num}>
          {`${p.supplierName}: ${(p.pricePerBase / 100).toFixed(3)} Rs/${item.baseUnit} (${p.effectiveDate})`}
        </Text>
      ))}

      <Text variant="titleMedium">Stock history</Text>
      <Divider />
      {item.movements.map(m => (
        <View key={m.id} style={styles.mov} testID={`mov-${m.id}`}>
          <View style={styles.flex}>
            <Text>{`${m.type}${m.isReversal ? ' (reversal)' : ''}`}</Text>
            <Text style={{ color: c.textSecondary }}>{`${when(m.createdAt)}${m.reason ? ` · ${m.reason}` : ''}`}</Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.num}>{`${m.qtyBase > 0 ? '+' : ''}${q(m.qtyBase)}`}</Text>
            <Text style={[styles.num, { color: c.textSecondary }]}>{formatPKR(m.valuePaisa)}</Text>
          </View>
        </View>
      ))}
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
  mov: { flexDirection: 'row', paddingVertical: spacing.sm },
  num: { fontVariant: ['tabular-nums'] },
});
