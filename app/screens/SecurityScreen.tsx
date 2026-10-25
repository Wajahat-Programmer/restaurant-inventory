import ReactNativeBiometrics from 'react-native-biometrics';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, SegmentedButtons, Switch, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { useQuery, useWrite } from '../../src/features/data';
import { Body, Btn, ErrorText, useColors } from '../../src/features/ui';
import {
  addStaff,
  changePin,
  deactivateUser,
  disableLock,
  listUsers,
  login,
  setUpLock,
} from '../../src/services/authService';
import { getIntSetting, getSetting, setSetting } from '../../src/services/settingsService';
import { getSession } from '../../src/services/session';
import { useDb } from '../../src/features/DbProvider';
import { spacing } from '../../src/theme/tokens';

function Pin({ label, value, onChange, testID }: { label: string; value: string; onChange: (v: string) => void; testID: string }) {
  return (
    <TextInput
      mode="outlined"
      testID={testID}
      label={label}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={6}
      value={value}
      onChangeText={onChange}
    />
  );
}

export default function SecurityScreen() {
  const db = useDb();
  const c = useColors();
  const write = useWrite();
  const auth = useAuth();
  const { data } = useQuery(async d => ({
    users: await listUsers(d),
    autoLock: await getIntSetting(d, 'auth.autoLock', 0, 15),
    bioUser: Number(await getSetting(d, 'auth.biometricUser')) || null,
  }));
  const me = getSession();
  const isOwner = !auth.lockOn || me?.role === 'owner';

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fail = (m: string) => {
    setDone(null);
    setError(m);
  };

  /* ---- first-time setup ---- */
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [phrase, setPhrase] = useState('');
  const [phrase2, setPhrase2] = useState('');

  const setup = async () => {
    setError(null);
    if (pin !== pin2) {
      return fail('The two PINs are not the same.');
    }
    if (phrase.trim() !== phrase2.trim()) {
      return fail('The two recovery passphrases are not the same.');
    }
    const res = await write(d => setUpLock(d, { ownerName: name, pin, recoveryPassphrase: phrase }));
    if (!res.ok) {
      return fail(res.error);
    }
    const r = await login(db, res.value, pin);
    await auth.refresh();
    if (r.ok) {
      auth.unlock(r.user);
    }
    setPin('');
    setPin2('');
    setPhrase('');
    setPhrase2('');
    setDone('✓ The PIN lock is on. Write the recovery passphrase down and keep it safe.');
  };

  /* ---- staff and PINs ---- */
  const [staffName, setStaffName] = useState('');
  const [staffPin, setStaffPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [offPin, setOffPin] = useState('');

  const add = async () => {
    setError(null);
    const res = await write(d => addStaff(d, { name: staffName, pin: staffPin }));
    if (!res.ok) {
      return fail(res.error);
    }
    setStaffName('');
    setStaffPin('');
    setDone('✓ Person added.');
  };

  const change = async () => {
    setError(null);
    if (!me) {
      return;
    }
    const res = await write(d => changePin(d, me.id, oldPin, newPin));
    if (!res.ok) {
      return fail(res.error);
    }
    setOldPin('');
    setNewPin('');
    setDone('✓ PIN changed.');
  };

  const turnOff = async () => {
    setError(null);
    const res = await write(d => disableLock(d, offPin));
    if (!res.ok) {
      return fail(res.error);
    }
    setOffPin('');
    await auth.refresh();
    setDone('✓ The PIN lock is off.');
  };

  const toggleFingerprint = async (on: boolean) => {
    setError(null);
    if (!me) {
      return;
    }
    if (on) {
      try {
        const bio = new ReactNativeBiometrics();
        const { available } = await bio.isSensorAvailable();
        if (!available) {
          return fail('This phone has no fingerprint or face unlock set up.');
        }
        const { success } = await bio.simplePrompt({ promptMessage: 'Confirm to turn on fingerprint unlock' });
        if (!success) {
          return;
        }
      } catch {
        return fail('Fingerprint unlock could not be turned on.');
      }
    }
    await write(d => setSetting(d, 'auth.biometricUser', on ? String(me.id) : ''));
  };

  return (
    <Body>
      <ErrorText message={error} />
      {done && <Text testID="security-done">{done}</Text>}

      {!auth.lockOn && (
        <Card>
          <Card.Content style={styles.gap}>
            <Text variant="titleMedium">Turn on the PIN lock</Text>
            <Text style={{ color: c.textSecondary }}>
              Anyone opening the app will need a PIN. You are the owner. Staff you add later can record stock and sales but cannot cancel entries, adjust stock or see money.
            </Text>
            <TextInput mode="outlined" testID="field-owner-name" label="Your name" value={name} onChangeText={setName} />
            <Pin testID="field-setup-pin" label="Choose a PIN (4 to 6 digits)" value={pin} onChange={setPin} />
            <Pin testID="field-setup-pin2" label="Type the PIN again" value={pin2} onChange={setPin2} />
            <TextInput
              mode="outlined"
              testID="field-setup-phrase"
              label="Recovery passphrase (at least 8 characters)"
              secureTextEntry
              value={phrase}
              onChangeText={setPhrase}
            />
            <TextInput mode="outlined" testID="field-setup-phrase2" label="Type the passphrase again" secureTextEntry value={phrase2} onChangeText={setPhrase2} />
            <Text style={{ color: c.warning }}>
              ⚠ The recovery passphrase is the only way back in if you forget your PIN. There is no server to reset it.
            </Text>
            <Btn testID="setup-lock" mode="contained" onPress={setup}>
              Turn on the lock
            </Btn>
          </Card.Content>
        </Card>
      )}

      {auth.lockOn && (
        <>
          <Card>
            <Card.Content style={styles.gap}>
              <Text variant="titleMedium">People</Text>
              {(data?.users ?? []).map(u => (
                <View key={u.id} style={styles.row} testID={`person-${u.name}`}>
                  <Text style={styles.flex}>{`${u.name} (${u.role === 'owner' ? 'owner' : 'staff'})`}</Text>
                  {isOwner && u.role === 'staff' && (
                    <Btn
                      testID={`remove-${u.name}`}
                      textColor={c.danger}
                      onPress={async () => {
                        const res = await write(d => deactivateUser(d, u.id));
                        if (!res.ok) {
                          fail(res.error);
                        }
                      }}>
                      Remove
                    </Btn>
                  )}
                </View>
              ))}
            </Card.Content>
          </Card>

          {isOwner && (
            <Card>
              <Card.Content style={styles.gap}>
                <Text variant="titleMedium">Add a staff member</Text>
                <TextInput mode="outlined" testID="field-staff-name" label="Name" value={staffName} onChangeText={setStaffName} />
                <Pin testID="field-staff-pin" label="PIN (4 to 6 digits)" value={staffPin} onChange={setStaffPin} />
                <Btn testID="add-staff" mode="contained-tonal" onPress={add}>
                  Add staff
                </Btn>
              </Card.Content>
            </Card>
          )}

          <Card>
            <Card.Content style={styles.gap}>
              <Text variant="titleMedium">My PIN</Text>
              <Pin testID="field-old-pin" label="Current PIN" value={oldPin} onChange={setOldPin} />
              <Pin testID="field-change-pin" label="New PIN" value={newPin} onChange={setNewPin} />
              <Btn testID="change-pin" mode="contained-tonal" onPress={change}>
                Change my PIN
              </Btn>
              <View style={styles.row}>
                <Text style={styles.flex}>Unlock with my fingerprint</Text>
                <Switch testID="fingerprint" value={!!me && data?.bioUser === me.id} onValueChange={toggleFingerprint} />
              </View>
            </Card.Content>
          </Card>

          {isOwner && (
            <Card>
              <Card.Content style={styles.gap}>
                <Text variant="titleMedium">Lock again after leaving the app for</Text>
                <SegmentedButtons
                  value={String(data?.autoLock ?? 5)}
                  onValueChange={v => write(d => setSetting(d, 'auth.autoLock', v))}
                  buttons={[
                    { value: '0', label: 'At once', testID: 'autolock-0' },
                    { value: '1', label: '1 min', testID: 'autolock-1' },
                    { value: '5', label: '5 min', testID: 'autolock-5' },
                    { value: '15', label: '15 min', testID: 'autolock-15' },
                  ]}
                />
              </Card.Content>
            </Card>
          )}

          {isOwner && (
            <Card>
              <Card.Content style={styles.gap}>
                <Text variant="titleMedium">Turn the lock off</Text>
                <Text style={{ color: c.textSecondary }}>This removes every PIN and every person. The history of who did what is kept.</Text>
                <Pin testID="field-off-pin" label="Owner PIN" value={offPin} onChange={setOffPin} />
                <Btn testID="disable-lock" textColor={c.danger} onPress={turnOff}>
                  Turn the lock off
                </Btn>
              </Card.Content>
            </Card>
          )}
        </>
      )}
    </Body>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
});
