import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Icon, Text } from 'react-native-paper';
import { Block, Chapter, MANUAL } from '../../src/features/guide/manual';
import { manualHtml } from '../../src/features/guide/manualHtml';
import { useTour } from '../../src/features/guide/TourProvider';
import { useQuery } from '../../src/features/data';
import { sharePdf } from '../../src/features/reports/pdfDevice';
import { installedVersion } from '../../src/features/update/devicePorts';
import { Body, Btn, ErrorText, todayISO, useColors } from '../../src/features/ui';
import { MIN_TOUCH_TARGET, spacing } from '../../src/theme/tokens';
import { useRootNav } from '../navigation/useRootNav';

function BlockView({ block }: { block: Block }) {
  const c = useColors();
  switch (block.type) {
    case 'h':
      return (
        <Text variant="titleSmall" style={styles.heading}>
          {block.text}
        </Text>
      );
    case 'steps':
    case 'list':
      return (
        <View style={styles.items}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <Text style={[styles.bullet, { color: c.primary }]}>{block.type === 'steps' ? `${i + 1}.` : '•'}</Text>
              <Text style={styles.itemText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case 'tip':
      return (
        <Text style={[styles.note, { borderColor: c.info }]}>{`Tip. ${block.text}`}</Text>
      );
    case 'warn':
      return (
        <Text style={[styles.note, { borderColor: c.warning }]}>{`⚠ Important. ${block.text}`}</Text>
      );
    default:
      return <Text>{block.text}</Text>;
  }
}

function ChapterView({ chapter, open, onToggle }: { chapter: Chapter; open: boolean; onToggle: () => void }) {
  const c = useColors();
  return (
    <Card testID={`chapter-${chapter.id}`}>
      <Pressable
        testID={`chapter-toggle-${chapter.id}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={styles.chapterHead}>
        <View style={styles.flex}>
          <Text variant="titleMedium">{chapter.title}</Text>
          <Text style={{ color: c.textSecondary }}>{chapter.summary}</Text>
        </View>
        <Icon source={open ? 'chevron-up' : 'chevron-down'} size={24} color={c.textSecondary} />
      </Pressable>
      {open && (
        <Card.Content style={styles.chapterBody}>
          {chapter.blocks.map((b, i) => (
            <BlockView key={i} block={b} />
          ))}
        </Card.Content>
      )}
    </Card>
  );
}

export default function HelpScreen() {
  const c = useColors();
  const nav = useRootNav();
  const tour = useTour();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery(async () => ({ version: (await installedVersion()) ?? '1.0.0' }));

  const sharePdfManual = async () => {
    setBusy(true);
    setNote(null);
    setError(null);
    try {
      const html = manualHtml(MANUAL, { version: data?.version ?? '1.0.0', date: todayISO() });
      await sharePdf(html, 'Restaurant-Inventory-Manual.pdf');
      setNote('✓ The manual PDF is ready. Choose where to send or save it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make the PDF.');
    }
    setBusy(false);
  };

  return (
    <Body>
      <ErrorText message={error} />
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Guided tour</Text>
          <Text style={{ color: c.textSecondary }}>A two-minute walk through the main screens, pointing at each thing and explaining it.</Text>
          <Btn
            testID="help-tour"
            mode="contained"
            icon="map-marker-path"
            onPress={() => {
              nav.navigate('Tabs', { screen: 'Home' });
              tour.start();
            }}>
            Start the guided tour
          </Btn>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Manual as a PDF</Text>
          <Text style={{ color: c.textSecondary }}>Every chapter below in one document you can send or print.</Text>
          <Btn testID="help-pdf" mode="contained-tonal" icon="file-pdf-box" disabled={busy} onPress={sharePdfManual}>
            Share the manual as PDF
          </Btn>
          {note && <Text testID="help-note">{note}</Text>}
        </Card.Content>
      </Card>

      <Text variant="titleMedium" accessibilityRole="header">
        Manual
      </Text>
      {MANUAL.map(ch => (
        <ChapterView key={ch.id} chapter={ch} open={openId === ch.id} onToggle={() => setOpenId(openId === ch.id ? null : ch.id)} />
      ))}
      <Text testID="help-version" style={{ color: c.textSecondary }}>{`Restaurant Inventory ${data?.version ?? ''}`}</Text>
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xs },
  heading: { marginTop: spacing.sm },
  items: { gap: spacing.xs },
  item: { flexDirection: 'row', gap: spacing.sm },
  bullet: { width: 24, textAlign: 'right' },
  itemText: { flex: 1 },
  note: { borderLeftWidth: 4, paddingLeft: spacing.sm, paddingVertical: spacing.xs },
  chapterHead: { minHeight: MIN_TOUCH_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  chapterBody: { gap: spacing.sm, paddingBottom: spacing.md },
});
