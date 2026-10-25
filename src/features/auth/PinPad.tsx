import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';
import { PIN_MAX } from '../../domain/auth';
import { MIN_TOUCH_TARGET, spacing } from '../../theme/tokens';
import { useColors } from '../ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

/** Big keys for busy hands. Digits only; the PIN is shown as dots. */
export function PinPad({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (pin: string) => void;
  disabled?: boolean;
}) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <View style={styles.dots} testID="pin-dots" accessibilityLabel={`${value.length} digits entered`}>
        {Array.from({ length: PIN_MAX }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, { borderColor: c.primary }, i < value.length && { backgroundColor: c.primary }]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              testID={k === 'back' ? 'pin-backspace' : `pin-key-${k}`}
              accessibilityRole="button"
              accessibilityLabel={k === 'back' ? 'Delete last digit' : k}
              disabled={disabled}
              onPress={() => onChange(k === 'back' ? value.slice(0, -1) : value.length < PIN_MAX ? value + k : value)}
              style={({ pressed }) => [
                styles.key,
                { backgroundColor: pressed ? c.outline : c.surface, borderColor: c.outline, opacity: disabled ? 0.4 : 1 },
              ]}>
              {k === 'back' ? (
                <Icon source="backspace-outline" size={26} color={c.textPrimary} />
              ) : (
                <Text variant="headlineMedium" style={styles.digit}>
                  {k}
                </Text>
              )}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const KEY = MIN_TOUCH_TARGET + 16;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: KEY * 3 + spacing.md * 2, gap: spacing.md },
  key: { width: KEY, height: KEY, borderRadius: KEY / 2, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  digit: { fontVariant: ['tabular-nums'] },
});
