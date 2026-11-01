import { useIsFocused } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';
import { Camera, useCameraDevice, useCameraPermission, useCodeScanner } from 'react-native-vision-camera';
import { normalizeBarcode } from '../../src/domain/barcode';
import { useDb } from '../../src/features/DbProvider';
import { CODE_TYPES, useScanStore } from '../../src/features/scan/scanStore';
import { Btn, useColors } from '../../src/features/ui';
import { findItemByBarcode } from '../../src/services/itemService';
import { fontSize, spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

/**
 * Scans a barcode. `find` opens the item that has it (or offers to add one);
 * `fill` hands the number back to the item form that asked for it.
 */
export default function ScanScreen({ navigation, route }: RootProps<'Scan'>) {
  const { mode } = route.params;
  const c = useColors();
  const db = useDb();
  const focused = useIsFocused();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const deliver = useScanStore(s => s.deliver);
  const handled = useRef(false);
  const [asked, setAsked] = useState(false);
  const [typed, setTyped] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [unknown, setUnknown] = useState<string | null>(null);

  const accept = async (raw: string) => {
    if (handled.current) {
      return; // a barcode is read many times a second while it is in view
    }
    const code = normalizeBarcode(raw);
    if (!code) {
      setProblem('That does not look like a barcode. Try again or type the number.');
      return;
    }
    handled.current = true;
    setProblem(null);
    if (mode === 'fill') {
      deliver(code);
      navigation.goBack();
      return;
    }
    const item = await findItemByBarcode(db, code);
    if (item) {
      navigation.replace('ItemDetail', { itemId: item.id });
    } else {
      setUnknown(code);
    }
  };

  const scanner = useCodeScanner({
    codeTypes: [...CODE_TYPES],
    onCodeScanned: codes => {
      const value = codes.find(k => k.value)?.value;
      if (value) {
        accept(value);
      }
    },
  });

  if (!hasPermission) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text variant="titleMedium">Camera access</Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          {asked
            ? '✖ Camera permission was not granted. You can allow it in the phone settings, or type the number below.'
            : 'Allow the camera to read barcodes. Nothing is sent anywhere.'}
        </Text>
        <Btn testID="allow-camera" mode="contained" onPress={async () => { await requestPermission(); setAsked(true); }}>
          Allow camera
        </Btn>
        {asked && (
          <Btn testID="open-settings" onPress={() => Linking.openSettings()}>
            Open settings
          </Btn>
        )}
        {asked && <TypeIt typed={typed} setTyped={setTyped} onGo={() => accept(typed)} />}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {device ? (
        <Camera style={StyleSheet.absoluteFill} device={device} isActive={focused && !unknown} codeScanner={scanner} />
      ) : (
        <Text testID="no-camera" style={[styles.text, { color: c.textPrimary, backgroundColor: c.background }]}>
          ✖ No camera was found on this phone. Type the number instead.
        </Text>
      )}
      <View pointerEvents="none" style={styles.guideWrap}>
        <View style={[styles.guide, { borderColor: c.accent }]} testID="scan-guide" />
        <Text style={[styles.tip, { backgroundColor: c.surface, color: c.textPrimary }]}>
          Hold the barcode inside the frame. It is read by itself.
        </Text>
      </View>
      <View style={[styles.bottom, { backgroundColor: c.surface }]}>
        {unknown ? (
          <View style={styles.gap} testID="scan-unknown">
            <Text variant="titleMedium">{`No item has barcode ${unknown}`}</Text>
            <Btn
              testID="scan-add-new"
              mode="contained"
              onPress={() => navigation.replace('ItemForm', { barcode: unknown })}>
              Add a new item with this barcode
            </Btn>
            <Btn testID="scan-again" onPress={() => { handled.current = false; setUnknown(null); }}>
              Scan again
            </Btn>
          </View>
        ) : (
          <>
            {problem && <Text style={{ color: c.danger }}>{`✖ ${problem}`}</Text>}
            <TypeIt typed={typed} setTyped={setTyped} onGo={() => accept(typed)} />
          </>
        )}
      </View>
    </View>
  );
}

function TypeIt({ typed, setTyped, onGo }: { typed: string; setTyped: (s: string) => void; onGo: () => void }) {
  return (
    <View style={styles.row}>
      <TextInput
        testID="scan-typed"
        mode="outlined"
        style={styles.flex}
        label="Or type the number"
        keyboardType="number-pad"
        value={typed}
        onChangeText={setTyped}
      />
      <Btn testID="scan-go" mode="contained-tonal" disabled={typed.trim().length < 3} onPress={onGo}>
        Go
      </Btn>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: 'black' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  text: { fontSize: fontSize.md, textAlign: 'center' },
  guideWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  guide: { width: '78%', height: 150, borderWidth: 3, borderStyle: 'dashed', borderRadius: spacing.md },
  tip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: spacing.sm, textAlign: 'center', marginHorizontal: spacing.lg },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.md, gap: spacing.sm },
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
