import { useIsFocused } from '@react-navigation/native';
import { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useWrite } from '../../src/features/data';
import { devicePorts } from '../../src/features/photos/devicePorts';
import { savePhoto } from '../../src/features/photos/savePhoto';
import { Btn, ErrorText, useColors } from '../../src/features/ui';
import { fontSize, spacing } from '../../src/theme/tokens';
import { RootProps } from '../navigation/types';

/** Keeps the owner honest about how to get a clean cutout. */
const TIP = 'One item on a plain surface. Items that touch merge into one.';

export default function PhotoCaptureScreen({ navigation, route }: RootProps<'ItemPhoto'>) {
  const { itemId } = route.params;
  const c = useColors();
  const write = useWrite();
  const focused = useIsFocused();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const camera = useRef<Camera>(null);
  const taking = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  if (!hasPermission) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text variant="titleMedium">Camera access</Text>
        <Text style={[styles.text, { color: c.textSecondary }]}>
          {asked
            ? '✖ Camera permission was not granted. You can allow it in the phone settings.'
            : 'Allow the camera to take photos of your items. Photos stay on this phone.'}
        </Text>
        <Btn
          testID="allow-camera"
          mode="contained"
          onPress={async () => {
            await requestPermission();
            setAsked(true);
          }}>
          Allow camera
        </Btn>
        {asked && (
          <Btn testID="open-settings" onPress={() => Linking.openSettings()}>
            Open settings
          </Btn>
        )}
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text testID="no-camera">✖ No camera was found on this phone.</Text>
      </View>
    );
  }

  const capture = async () => {
    if (taking.current) {
      return; // ignore a second tap while a photo is being taken or processed
    }
    taking.current = true;
    setError(null);
    try {
      // The camera must stay active until the shot is taken.
      const shot = await camera.current?.takePhoto({ flash: 'off' });
      if (!shot) {
        throw new Error('The camera did not return a photo');
      }
      setBusy(true);
      const res = await write(db => savePhoto(db, devicePorts, itemId, shot.path));
      if (res.ok) {
        navigation.goBack();
        return;
      }
      setError(res.error);
    } catch (e) {
      setError(`Could not save the photo: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(false);
    taking.current = false;
  };

  return (
    <View style={styles.fill}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={focused && !busy}
        photo
      />
      <View pointerEvents="none" style={styles.guideWrap}>
        <View style={[styles.guide, { borderColor: c.accent }]} testID="framing-guide" />
        <Text style={[styles.tip, { backgroundColor: c.surface, color: c.textPrimary }]}>{TIP}</Text>
      </View>
      <View style={styles.bottom}>
        {busy ? (
          <View style={[styles.busy, { backgroundColor: c.surface }]} testID="photo-busy">
            <ActivityIndicator />
            <Text>Cutting out the item…</Text>
          </View>
        ) : (
          <>
            <ErrorText message={error} />
            <Btn testID="take-photo" mode="contained" icon="camera" onPress={capture}>
              Take photo
            </Btn>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  text: { fontSize: fontSize.md },
  guideWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  guide: { width: '70%', aspectRatio: 1, borderWidth: 3, borderRadius: spacing.md, borderStyle: 'dashed' },
  tip: { padding: spacing.sm, borderRadius: spacing.sm, marginHorizontal: spacing.lg, textAlign: 'center' },
  bottom: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.xl, gap: spacing.sm },
  busy: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', justifyContent: 'center', padding: spacing.md, borderRadius: spacing.sm },
});
