import { useIsFocused } from '@react-navigation/native';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { poseFor } from '../../domain/tilt';
import { useColors } from '../ui';
import { toUri, ItemPhoto } from './ItemPhoto';
import { useReduceMotion, useTilt } from './useTilt';

/**
 * An item photo with a 2.5D look: the cut-out floats over the page with a soft
 * shadow in its own shape, and turns a little as the phone is leaned. Without a
 * cut-out, with the switch off, or with "reduce motion" on, it is the plain picture.
 */
export function Photo25D({
  path,
  cutoutPath,
  size,
  enabled,
  testID,
}: {
  path: string | null;
  cutoutPath: string | null;
  size: number;
  enabled: boolean;
  testID?: string;
}) {
  const c = useColors();
  const focused = useIsFocused();
  const reduceMotion = useReduceMotion();
  const live = enabled && !!cutoutPath;
  const { x, y } = useTilt(live && focused && reduceMotion === false);

  if (!live) {
    return <ItemPhoto path={path} size={size} testID={testID} />;
  }

  const max = poseFor(1, 1, size);
  const range = [-1, 1];
  const turnY = x.interpolate({ inputRange: range, outputRange: [`${-max.rotateYDeg}deg`, `${max.rotateYDeg}deg`] });
  const turnX = y.interpolate({ inputRange: range, outputRange: [`${-max.rotateXDeg}deg`, `${max.rotateXDeg}deg`] });
  const shadowX = x.interpolate({ inputRange: range, outputRange: [poseFor(-1, 0, size).shadowX, poseFor(1, 0, size).shadowX] });
  const shadowY = y.interpolate({ inputRange: range, outputRange: [poseFor(0, -1, size).shadowY, poseFor(0, 1, size).shadowY] });
  const uri = toUri(cutoutPath);

  return (
    <View testID={testID} style={[styles.box, { width: size, height: size, backgroundColor: c.background, borderColor: c.outline, borderRadius: size / 8 }]}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { transform: [{ translateX: shadowX }, { translateY: shadowY }] }]}>
        <Image
          testID="photo25d-shadow"
          source={{ uri }}
          style={[styles.fill, styles.shadow]}
          resizeMode="contain"
          blurRadius={size / 14}
          tintColor="black"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </Animated.View>
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ perspective: size * 4 }, { rotateX: turnX }, { rotateY: turnY }] }]}>
        <Image
          testID="photo25d-cutout"
          source={{ uri }}
          style={styles.fill}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, overflow: 'hidden' },
  fill: { width: '100%', height: '100%' },
  shadow: { opacity: 0.35 },
});
