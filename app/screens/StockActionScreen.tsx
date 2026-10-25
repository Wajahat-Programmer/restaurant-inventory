import { useState } from 'react';
import { SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { formatQty, parseQty, toBase } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText } from '../../src/features/ui';
import { getItem } from '../../src/services/itemService';
import {
  adjustStock,
  issueToKitchen,
  recordWaste,
  WASTE_REASONS,
  WasteReason,
} from '../../src/services/stockService';
import { RootProps } from '../navigation/types';

const TITLE = {
  issue: 'Issue to kitchen',
  waste: 'Record wastage',
  adjust: 'Adjust stock',
} as const;

export default function StockActionScreen({ navigation, route }: RootProps<'StockAction'>) {
  const { itemId, kind } = route.params;
  const write = useWrite();
  const { data: item } = useQuery(db => getItem(db, itemId), [itemId]);

  const [qtyText, setQtyText] = useState('');
  const [unit, setUnit] = useState('base');
  const [reason, setReason] = useState<WasteReason>('spoiled');
  const [direction, setDirection] = useState<'add' | 'remove'>('remove');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return <Body><Text>Loading…</Text></Body>;
  }

  const factor = unit === 'base' ? 1 : item.packs.find(p => p.packName === unit)?.factorToBase ?? 1;
  const parsed = parseQty(qtyText);
  const qtyBase = parsed === null ? null : toBase(parsed, factor);

  const submit = async () => {
    setError(null);
    if (qtyBase === null) {
      setError('Enter a quantity more than 0, like 2 or 1.5');
      return;
    }
    const res = await write(db => {
      if (kind === 'issue') {
        return issueToKitchen(db, { itemId, qtyBase, note });
      }
      if (kind === 'waste') {
        return recordWaste(db, { itemId, qtyBase, reason, note });
      }
      return adjustStock(db, {
        itemId,
        deltaBase: direction === 'add' ? qtyBase : -qtyBase,
        note,
      });
    });
    if (res.ok) {
      navigation.goBack();
    } else {
      setError(res.error);
    }
  };

  return (
    <Body>
      <Text variant="titleLarge">{`${TITLE[kind]}: ${item.name}`}</Text>
      <Text testID="action-onhand">{`On hand: ${formatQty(item.qtyBase, item.baseUnit)}`}</Text>

      {kind === 'adjust' && (
        <SegmentedButtons
          value={direction}
          onValueChange={v => setDirection(v as 'add' | 'remove')}
          buttons={[
            { value: 'add', label: '＋ Add', testID: 'dir-add' },
            { value: 'remove', label: '－ Remove', testID: 'dir-remove' },
          ]}
        />
      )}

      <TextInput
        mode="outlined"
        testID="field-qty"
        label={`Quantity (${unit === 'base' ? item.baseUnit : unit})`}
        keyboardType="decimal-pad"
        value={qtyText}
        onChangeText={setQtyText}
      />
      {item.packs.length > 0 && (
        <SegmentedButtons
          value={unit}
          onValueChange={setUnit}
          buttons={[
            { value: 'base', label: item.baseUnit, testID: 'unit-base' },
            ...item.packs.map(p => ({ value: p.packName, label: p.packName, testID: `unit-${p.packName}` })),
          ]}
        />
      )}
      {qtyBase !== null && unit !== 'base' && (
        <Text testID="action-converted">{`= ${formatQty(qtyBase, item.baseUnit)}`}</Text>
      )}

      {kind === 'waste' && (
        <SegmentedButtons
          value={reason}
          onValueChange={v => setReason(v as WasteReason)}
          buttons={WASTE_REASONS.map(r => ({ value: r, label: r, testID: `reason-${r}` }))}
        />
      )}

      <TextInput
        mode="outlined"
        testID="field-note"
        label={kind === 'adjust' ? 'Note (required)' : 'Note (optional)'}
        value={note}
        onChangeText={setNote}
      />
      <ErrorText message={error} />
      <Btn testID="submit-action" mode="contained" onPress={submit}>
        Save
      </Btn>
    </Body>
  );
}
