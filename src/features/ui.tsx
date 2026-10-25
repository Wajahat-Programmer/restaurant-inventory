import { ReactNode, useState } from 'react';
import { Control, Controller, FieldPath, FieldValues } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Button, ButtonProps, HelperText, Text, TextInput, useTheme } from 'react-native-paper';
import { StockStatus, STATUS_LABEL } from '../domain/stockStatus';
import { colors, fontSize, MIN_TOUCH_TARGET, spacing, ThemeMode } from '../theme/tokens';

export function useColors() {
  const theme = useTheme();
  const mode: ThemeMode = theme.dark ? 'dark' : 'light';
  return colors[mode];
}

/** Local business date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Paper button with the 48 dp minimum touch target. */
export function Btn(props: ButtonProps) {
  return <Button {...props} contentStyle={[styles.btn, props.contentStyle]} />;
}

interface SelectProps<V> {
  label: string;
  value: V | null;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  testID: string;
}

/** Dropdown: a button showing the choice, opening an inline list of options. */
export function Select<V extends string | number>({
  label,
  value,
  options,
  onChange,
  testID,
}: SelectProps<V>) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const chosen = options.find(o => o.value === value);
  return (
    <View>
      <Btn
        testID={testID}
        mode="outlined"
        icon={open ? 'menu-up' : 'menu-down'}
        onPress={() => setOpen(o => !o)}>
        {chosen ? chosen.label : label}
      </Btn>
      {open && (
        <View style={[styles.options, { borderColor: c.outline, backgroundColor: c.surface }]}>
          {options.length === 0 && (
            <Text style={{ color: c.textSecondary }}>Nothing to choose yet</Text>
          )}
          {options.map(o => (
            <Btn
              key={String(o.value)}
              testID={`${testID}-${o.label}`}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}>
              {o.label}
            </Btn>
          ))}
        </View>
      )}
    </View>
  );
}

/** Scrollable screen body on the themed background. */
export function Body({ children }: { children: ReactNode }) {
  const c = useColors();
  // Edge-to-edge Android does not resize the window for the keyboard, so the
  // body makes room itself; otherwise lower fields stay hidden while typing.
  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: c.background }]}
      behavior="padding">
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

/** Status is glyph + label + colour, never colour alone. */
export function StatusBadge({ status }: { status: StockStatus }) {
  const c = useColors();
  const tint = { OK: c.success, LOW: c.warning, OUT: c.danger }[status];
  return (
    <Text
      testID={`status-${status}`}
      style={[styles.badge, { color: tint }]}>
      {STATUS_LABEL[status]}
    </Text>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  if (!message) {
    return null;
  }
  return (
    <HelperText type="error" visible testID="form-error" style={styles.err}>
      {`✖ ${message}`}
    </HelperText>
  );
}

interface FieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  keyboard?: KeyboardTypeOptions;
  multiline?: boolean;
  suffix?: string;
  testID?: string;
  /** Share a Row evenly with sibling fields. */
  grow?: boolean;
}

/** Paper text input bound to react-hook-form, with the error shown below. */
export function Field<T extends FieldValues>({
  control,
  name,
  label,
  keyboard,
  multiline,
  suffix,
  testID,
  grow,
}: FieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <View style={grow ? styles.grow : undefined}>
          <TextInput
            mode="outlined"
            label={label}
            testID={testID ?? `field-${name}`}
            value={String(field.value ?? '')}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            keyboardType={keyboard}
            multiline={multiline}
            error={!!fieldState.error}
            right={suffix ? <TextInput.Affix text={suffix} /> : undefined}
          />
          <HelperText type="error" visible={!!fieldState.error}>
            {fieldState.error ? `✖ ${fieldState.error.message}` : ''}
          </HelperText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  badge: { fontSize: fontSize.sm, fontWeight: '600' },
  err: { fontSize: fontSize.sm },
  btn: { minHeight: MIN_TOUCH_TARGET },
  grow: { flex: 1 },
  fill: { flex: 1 },
  options: { borderWidth: 1, borderRadius: spacing.sm, padding: spacing.xs },
});
