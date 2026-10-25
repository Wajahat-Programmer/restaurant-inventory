import { Image, StyleSheet, View } from 'react-native';
import { Icon } from 'react-native-paper';
import { useColors } from '../ui';

export const toUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

/** Item photo, or a plain placeholder glyph when there is none. */
export function ItemPhoto({
  path,
  size,
  testID,
}: {
  path: string | null;
  size: number;
  testID?: string;
}) {
  const c = useColors();
  const box = { width: size, height: size, borderRadius: size / 8 };
  return (
    <View
      testID={testID}
      style={[styles.box, box, { backgroundColor: c.background, borderColor: c.outline }]}>
      {path ? (
        <Image
          source={{ uri: toUri(path) }}
          style={styles.img}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon source="image-off-outline" size={size / 2} color={c.textSecondary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
});
