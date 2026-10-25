import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { countVariance } from '../../src/domain/stockStatus';
import { formatQty, parseQty } from '../../src/domain/units';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, todayISO, useColors } from '../../src/features/ui';
import {
  CountLineRow,
  getCount,
  openCountId,
  postCount,
  startCount,
} from '../../src/services/stockService';
import { spacing } from '../../src/theme/tokens';

/** Typed text for a line, or the saved value if the user has not touched it. */
function shown(line: CountLineRow, drafts: Record<number, string>): string {
  return drafts[line.lineId] ?? (line.countedQty === null ? '' : String(line.countedQty));
}

function CountLine({
  line,
  text,
  onChange,
}: {
  line: CountLineRow;
  text: string;
  onChange: (t: string) => void;
}) {
  const c = useColors();
  const qty = text.trim() === '' ? null : parseQty(text, { allowZero: true });
  const v = qty === null ? null : countVariance(line.systemQty, qty);
  const invalid = text.trim() !== '' && qty === null;

  return (
    <Card testID={`count-line-${line.itemName}`}>
      <Card.Content style={styles.line}>
        <View style={styles.flex}>
          <Text variant="titleMedium">{line.itemName}</Text>
          <Text style={{ color: c.textSecondary }}>{`System: ${formatQty(line.systemQty, line.baseUnit)}`}</Text>
          {invalid && <Text style={{ color: c.danger }}>✖ Enter a number like 2 or 1.5</Text>}
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
          error={invalid}
          onChangeText={onChange}
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
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const { data } = useQuery(async db => {
    const id = await openCountId(db);
    return id === null ? null : getCount(db, id);
  });

  const start = async () => {
    setError(null);
    setMessage(null);
    setDrafts({});
    const res = await write(db => startCount(db, todayISO()));
    if (!res.ok) {
      setError(res.error);
    }
  };

  const post = async (countId: number, lines: CountLineRow[]) => {
    setError(null);
    const entries: { lineId: number; countedQty: number | null }[] = [];
    for (const l of lines) {
      const t = shown(l, drafts).trim();
      const qty = t === '' ? null : parseQty(t, { allowZero: true });
      if (t !== '' && qty === null) {
        setError(`${l.itemName}: enter a quantity like 2 or 1.5`);
        return;
      }
      entries.push({ lineId: l.lineId, countedQty: qty });
    }
    const res = await write(db => postCount(db, countId, entries));
    if (res.ok) {
      setDrafts({});
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

  const counted = data.lines.filter(l => shown(l, drafts).trim() !== '').length;
  return (
    <Body>
      <Text variant="titleMedium" testID="count-progress">
        {`Count ${data.date}: ${counted} of ${data.lines.length} counted`}
      </Text>
      <ErrorText message={error} />
      {data.lines.map(l => (
        <CountLine
          key={l.lineId}
          line={l}
          text={shown(l, drafts)}
          onChange={t => setDrafts(d => ({ ...d, [l.lineId]: t }))}
        />
      ))}
      <Btn testID="post-count" mode="contained" onPress={() => post(data.id, data.lines)}>
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
