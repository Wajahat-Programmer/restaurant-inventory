import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { formatQty, parseQty } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, todayISO, useColors } from '../../src/features/ui';
import {
  CountLineRow,
  getCount,
  openCountId,
  postCount,
  setCounted,
  startCount,
} from '../../src/services/stockService';
import { spacing } from '../../src/theme/tokens';

function CountLine({ line, onError }: { line: CountLineRow; onError: (m: string | null) => void }) {
  const c = useColors();
  const write = useWrite();
  const [text, setText] = useState(line.countedQty === null ? '' : String(line.countedQty));
  const v = line.variance;

  const save = async () => {
    onError(null);
    const qty = text.trim() === '' ? null : parseQty(text, { allowZero: true });
    if (text.trim() !== '' && qty === null) {
      onError(`${line.itemName}: enter a quantity like 2 or 1.5`);
      return;
    }
    const res = await write(db => setCounted(db, line.lineId, qty));
    if (!res.ok) {
      onError(res.error);
    }
  };

  return (
    <Card testID={`count-line-${line.itemName}`}>
      <Card.Content style={styles.line}>
        <View style={styles.flex}>
          <Text variant="titleMedium">{line.itemName}</Text>
          <Text style={{ color: c.textSecondary }}>{`System: ${formatQty(line.systemQty, line.baseUnit)}`}</Text>
          {v !== null && (
            <Text
              testID={`variance-${line.itemName}`}
              style={{ color: v === 0 ? c.success : c.warning }}>
              {v === 0 ? '✓ Matches' : `${v > 0 ? '＋' : '－'} ${formatQty(Math.abs(v), line.baseUnit)} ${v > 0 ? 'more' : 'less'}`}
            </Text>
          )}
        </View>
        <TextInput
          mode="outlined"
          style={styles.input}
          testID={`counted-${line.itemName}`}
          label={`Counted (${line.baseUnit})`}
          keyboardType="decimal-pad"
          value={text}
          onChangeText={setText}
          onBlur={save}
        />
      </Card.Content>
    </Card>
  );
}

export default function CountScreen() {
  const c = useColors();
  const write = useWrite();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data } = useQuery(async db => {
    const id = await openCountId(db);
    return id === null ? null : getCount(db, id);
  });

  const start = async () => {
    setError(null);
    setMessage(null);
    const res = await write(db => startCount(db, todayISO()));
    if (!res.ok) {
      setError(res.error);
    }
  };

  const post = async (countId: number) => {
    setError(null);
    const res = await write(db => postCount(db, countId));
    if (res.ok) {
      setMessage(`Count posted: ${res.value} item${res.value === 1 ? '' : 's'} adjusted.`);
    } else {
      setError(res.error);
    }
  };

  if (!data) {
    return (
      <Body>
        <Text variant="titleMedium">Stock count</Text>
        <Text style={{ color: c.textSecondary }}>
          Count what is physically on the shelf. Differences become adjustments in the ledger.
        </Text>
        {message && <Text testID="count-message">{`✓ ${message}`}</Text>}
        <ErrorText message={error} />
        <Btn testID="start-count" mode="contained" onPress={start}>
          Start a stock count
        </Btn>
      </Body>
    );
  }

  const counted = data.lines.filter(l => l.countedQty !== null).length;
  return (
    <Body>
      <Text variant="titleMedium" testID="count-progress">
        {`Count ${data.date}: ${counted} of ${data.lines.length} counted`}
      </Text>
      <ErrorText message={error} />
      {data.lines.map(l => (
        <CountLine key={`${l.lineId}-${l.countedQty}`} line={l} onError={setError} />
      ))}
      <Btn testID="post-count" mode="contained" onPress={() => post(data.id)}>
        Post count and adjust stock
      </Btn>
    </Body>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  input: { width: 120 },
});
