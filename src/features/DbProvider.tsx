import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { Db } from '../db/client';

const DbContext = createContext<Db | null>(null);

/** Opens the database and runs migrations before any screen renders. */
/** Tests pass `db` to skip the native open. */
export function DbProvider({ children, db: injected }: { children: ReactNode; db?: Db }) {
  const [opened, setDb] = useState<Db | null>(null);
  const db = injected ?? opened;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (injected) {
      return;
    }
    // Imported lazily so Jest never loads the native module.
    import('../db/opsqlite').then(m => m.openAppDb()).then(setDb, e => setError(String(e?.message ?? e)));
  }, [injected]);

  if (error) {
    return (
      <View style={styles.pad} testID="db-error">
        <Text variant="titleMedium">Could not open the database</Text>
        <Text>{error}</Text>
      </View>
    );
  }
  if (!db) {
    return <ActivityIndicator style={styles.fill} testID="db-loading" />;
  }
  return <DbContext.Provider value={db}>{children}</DbContext.Provider>;
}

export function useDb(): Db {
  const db = useContext(DbContext);
  if (!db) {
    throw new Error('useDb must be used inside DbProvider');
  }
  return db;
}

const styles = StyleSheet.create({
  pad: { padding: 24 },
  fill: { flex: 1 },
});
