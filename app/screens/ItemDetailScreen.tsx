import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Divider, Text } from 'react-native-paper';
import { formatPKR } from '../../src/domain/money';
import { formatQty } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { devicePorts } from '../../src/features/photos/devicePorts';
import { ItemPhoto } from '../../src/features/photos/ItemPhoto';
import { retryCutout } from '../../src/features/photos/savePhoto';
import { Body, Btn, ErrorText, Row, StatusBadge, useColors } from '../../src/features/ui';
import { deletePhoto, listPhotos, setPrimaryPhoto } from '../../src/services/photoService';
import { getItem, setItemActive } from '../../src/services/itemService';
import { allowed } from '../../src/services/session';
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
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { data, error } = useQuery(async db => ({
    item: await getItem(db, itemId),
    photos: await listPhotos(db, itemId),
  }), [itemId]);
  const item = data?.item;
  const photos = data?.photos ?? [];
  const main = photos.find(p => p.isPrimary);

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

      <View style={styles.photoRow}>
        <ItemPhoto path={main ? main.cutoutPath ?? main.originalPath : null} size={160} testID="main-photo" />
        <View style={styles.flex}>
          <Btn testID="add-photo" mode="contained-tonal" icon="camera" onPress={() => navigation.navigate('ItemPhoto', { itemId })}>
            {main ? 'Add another photo' : 'Add photo'}
          </Btn>
          {main && main.cutoutPath === null && (
            <>
              <Text testID="photo-fallback" style={{ color: c.warning }}>
                ⚠ No cutout yet, showing the plain photo. The cutout model downloads on first use and needs internet.
              </Text>
              <Btn
                testID="retry-cutout"
                icon="content-cut"
                onPress={async () => {
                  setPhotoError(null);
                  try {
                    await write(db => retryCutout(db, devicePorts, main));
                  } catch (e) {
                    setPhotoError(`Cutout not ready: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}>
                Retry cutout
              </Btn>
            </>
          )}
        </View>
      </View>
      {photos.length > 1 && (
        <View style={styles.thumbs}>
          {photos.map(p => (
            <View key={p.id} style={styles.thumb} testID={`photo-${p.id}`}>
              <ItemPhoto path={p.thumbPath} size={72} />
              <Text style={{ color: c.textSecondary }}>{p.isPrimary ? '★ Main' : ''}</Text>
              {!p.isPrimary && (
                <Btn
                  testID={`photo-main-${p.id}`}
                  compact
                  onPress={async () => {
                    await write(db => setPrimaryPhoto(db, p.id));
                  }}>
                  Make main
                </Btn>
              )}
            </View>
          ))}
        </View>
      )}
      {photos.length > 0 && (
        <Btn
          testID="delete-photo"
          textColor={c.danger}
          onPress={async () => {
            setPhotoError(null);
            const target = main ?? photos[0];
            const res = await write(db => deletePhoto(db, target.id));
            if (res.ok) {
              await Promise.all(res.value.map(f => devicePorts.remove(f).catch(() => undefined)));
            } else {
              setPhotoError(res.error);
            }
          }}>
          Delete main photo
        </Btn>
      )}
      <ErrorText message={photoError} />

      <Row>
        <Btn testID="act-issue" mode="contained" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'issue' })}>
          Issue
        </Btn>
        <Btn testID="act-waste" mode="contained-tonal" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'waste' })}>
          Waste
        </Btn>
        {allowed('adjust') && (
          <Btn testID="act-adjust" mode="outlined" onPress={() => navigation.navigate('StockAction', { itemId, kind: 'adjust' })}>
            Adjust
          </Btn>
        )}
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
  photoRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { alignItems: 'center' },
  flex: { flex: 1 },
  right: { alignItems: 'flex-end' },
  mov: { flexDirection: 'row', paddingVertical: spacing.sm },
  num: { fontVariant: ['tabular-nums'] },
});
