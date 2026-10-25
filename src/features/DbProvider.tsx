import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { Db } from '../db/client';
import type { DbHandle } from './backup/backupService';

/** Drizzle wraps driver errors; show the whole chain so the cause is visible. */
function describe(e: unknown): string {
  const parts: string[] = [];
  for (let cur: unknown = e; cur && typeof cur === 'object' && parts.length < 4; cur = (cur as { cause?: unknown }).cause) {
    const m = (cur as { message?: unknown }).message;
    if (typeof m === 'string') {
      parts.push(m);
    }
  }
  return parts.length ? parts.join(' → ') : String(e);
}

interface DbContextValue {
  db: Db;
  /** The open database file. Null in tests, where a database is injected. */
  handle: DbHandle | null;
  /** After a restore: start using the reopened database everywhere. */
  replace: (h: DbHandle) => void;
}

const DbContext = createContext<DbContextValue | null>(null);

/**
 * Opens the database and runs migrations before any screen renders.
 * Tests pass `db` to skip the native open.
 */
export function DbProvider({ children, db: injected }: { children: ReactNode; db?: Db }) {
  const [handle, setHandle] = useState<DbHandle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (injected) {
      return;
    }
    // Imported lazily so Jest never loads the native module.
    import('../db/opsqlite').then(m => m.openAppDb()).then(setHandle, e => setError(describe(e)));
  }, [injected]);

  const replace = useCallback((h: DbHandle) => setHandle(h), []);
  const db = injected ?? handle?.db ?? null;
  const value = useMemo(() => (db ? { db, handle, replace } : null), [db, handle, replace]);

  if (error) {
    return (
      <View style={styles.pad} testID="db-error">
        <Text variant="titleMedium">Could not open the database</Text>
        <Text>{error}</Text>
      </View>
    );
  }
  if (!value) {
    return <ActivityIndicator style={styles.fill} testID="db-loading" />;
  }
  return <DbContext.Provider value={value}>{children}</DbContext.Provider>;
}

function useDbContext(): DbContextValue {
  const ctx = useContext(DbContext);
  if (!ctx) {
    throw new Error('Database hooks must be used inside DbProvider');
  }
  return ctx;
}

export const useDb = (): Db => useDbContext().db;

/** The database file and a way to swap it, for backup and restore. */
export function useDbHost(): { handle: DbHandle | null; replace: (h: DbHandle) => void } {
  const { handle, replace } = useDbContext();
  return { handle, replace };
}

const styles = StyleSheet.create({
  pad: { padding: 24 },
  fill: { flex: 1 },
});
