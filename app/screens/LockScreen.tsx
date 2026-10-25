import ReactNativeBiometrics from 'react-native-biometrics';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { PinPad } from '../../src/features/auth/PinPad';
import { useQuery } from '../../src/features/data';
import { useDb } from '../../src/features/DbProvider';
import { Body, Btn, ErrorText, useColors } from '../../src/features/ui';
import { listUsers, login, loginWithBiometrics, resetOwnerPin } from '../../src/services/authService';
import { getSetting } from '../../src/services/settingsService';
import { spacing } from '../../src/theme/tokens';

/**
 * Shown whenever the app is locked. Picks the person, takes the PIN, and
 * makes anyone who guesses wrong wait longer each time.
 */
export default function LockScreen() {
  const c = useColors();
  const { unlock: onUnlocked } = useAuth();
  const db = useDb();
  const { data } = useQuery(async d => ({
    users: await listUsers(d),
    bioUser: Number(await getSetting(d, 'auth.biometricUser')) || null,
  }));
  const [chosen, setChosen] = useState<number | null>(null);
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [forgot, setForgot] = useState(false);

  const users = data?.users ?? [];
  const userId = chosen ?? (users.length === 1 ? users[0].id : null);
  const user = users.find(u => u.id === userId);

  // Count the wait down once a second.
  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = useCallback(async () => {
    if (userId === null || pin.length === 0) {
      return;
    }
    const r = await login(db, userId, pin);
    setPin('');
    if (r.ok) {
      onUnlocked(r.user);
    } else if (r.reason === 'locked') {
      setWait(r.secondsLeft);
      setMessage(`Too many wrong PINs. Wait ${r.secondsLeft} seconds.`);
    } else if (r.reason === 'wrong') {
      setMessage(`Wrong PIN. ${r.attemptsLeft} ${r.attemptsLeft === 1 ? 'try' : 'tries'} left before a wait.`);
    } else {
      setMessage('That person is not set up any more.');
    }
  }, [db, onUnlocked, pin, userId]);

  const tryFingerprint = useCallback(async () => {
    if (!data?.bioUser) {
      return;
    }
    try {
      const bio = new ReactNativeBiometrics();
      const { available } = await bio.isSensorAvailable();
      if (!available) {
        return;
      }
      const { success } = await bio.simplePrompt({ promptMessage: 'Unlock Restaurant Inventory' });
      if (success) {
        const r = await loginWithBiometrics(db, data.bioUser);
        if (r.ok) {
          onUnlocked(r.user);
        }
      }
    } catch {
      // Cancelled or unavailable: the PIN still works.
    }
  }, [data?.bioUser, db, onUnlocked]);

  useEffect(() => {
    if (data?.bioUser) {
      tryFingerprint();
    }
  }, [data?.bioUser, tryFingerprint]);

  if (forgot) {
    return <ForgotPin onDone={() => setForgot(false)} />;
  }

  return (
    <Body>
      <View style={styles.center}>
        <Text variant="headlineSmall" testID="lock-title">
          Restaurant Inventory
        </Text>
        {users.length > 1 && (
          <View style={styles.users}>
            {users.map(u => (
              <Btn
                key={u.id}
                testID={`user-${u.name}`}
                mode={u.id === userId ? 'contained' : 'outlined'}
                onPress={() => {
                  setChosen(u.id);
                  setPin('');
                  setMessage(null);
                }}>
                {`${u.name} (${u.role})`}
              </Btn>
            ))}
          </View>
        )}
        <Text style={{ color: c.textSecondary }}>
          {user ? `${user.name}, enter your PIN` : users.length > 1 ? 'Choose who you are' : ' '}
        </Text>
        <PinPad value={pin} onChange={setPin} disabled={userId === null || wait > 0} />
        {wait > 0 && (
          <Text testID="lock-wait" style={{ color: c.warning }}>
            {`⚠ Locked. Try again in ${wait} s`}
          </Text>
        )}
        <ErrorText message={wait > 0 ? null : message} />
        <Btn testID="pin-ok" mode="contained" disabled={pin.length < 4 || wait > 0 || userId === null} onPress={submit}>
          Unlock
        </Btn>
        {data?.bioUser && userId === data.bioUser && (
          <Btn testID="use-fingerprint" icon="fingerprint" onPress={tryFingerprint}>
            Use fingerprint
          </Btn>
        )}
        <Btn testID="forgot-pin" onPress={() => setForgot(true)}>
          Forgot PIN?
        </Btn>
      </View>
    </Body>
  );
}

function ForgotPin({ onDone }: { onDone: () => void }) {
  const db = useDb();
  const [phrase, setPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async () => {
    setError(null);
    try {
      await resetOwnerPin(db, phrase, pin);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Body>
      <Card>
        <Card.Content style={styles.gap}>
          <Text variant="titleMedium">Reset the owner PIN</Text>
          <Text>Enter the recovery passphrase you chose when you set up the lock, then a new PIN.</Text>
          {ok ? (
            <Text testID="reset-done">✓ The owner PIN was changed. You can unlock now.</Text>
          ) : (
            <>
              <TextInput mode="outlined" testID="field-recovery" label="Recovery passphrase" secureTextEntry value={phrase} onChangeText={setPhrase} />
              <TextInput
                mode="outlined"
                testID="field-new-pin"
                label="New PIN (4 to 6 digits)"
                keyboardType="number-pad"
                secureTextEntry
                maxLength={6}
                value={pin}
                onChangeText={setPin}
              />
              <ErrorText message={error} />
              <Btn testID="reset-pin" mode="contained" onPress={submit}>
                Reset PIN
              </Btn>
            </>
          )}
          <Btn testID="back-to-lock" onPress={onDone}>
            Back
          </Btn>
        </Card.Content>
      </Card>
    </Body>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  users: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  gap: { gap: spacing.sm },
});
