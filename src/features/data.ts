import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useRef, useState } from 'react';
import { create } from 'zustand';
import { Db } from '../db/client';
import { ValidationError } from '../services/errors';
import { useDb } from './DbProvider';

/** Bumped after every write so visible lists reload. */
const useVersion = create<{ version: number; bump: () => void }>(set => ({
  version: 0,
  bump: () => set(s => ({ version: s.version + 1 })),
}));

export interface QueryState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
}

/** Runs a read when the screen gains focus and after any write. */
export function useQuery<T>(
  read: (db: Db) => Promise<T>,
  deps: readonly unknown[] = [],
): QueryState<T> {
  const db = useDb();
  const version = useVersion(s => s.version);
  // Callers pass a fresh closure each render; only `deps` should retrigger.
  const readRef = useRef(read);
  readRef.current = read;
  const key = `${version}:${JSON.stringify(deps)}`;
  const latestKey = useRef(key);
  latestKey.current = key;
  const [state, setState] = useState<QueryState<T>>({
    data: undefined,
    error: undefined,
    loading: true,
  });

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // Ignore answers to a question that has since changed.
      const current = () => alive && latestKey.current === key;
      readRef.current(db).then(
        data => current() && setState({ data, error: undefined, loading: false }),
        e =>
          current() &&
          setState(s => ({ ...s, error: String(e?.message ?? e), loading: false })),
      );
      return () => {
        alive = false;
      };
    }, [db, key]),
  );
  return state;
}

export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * Runs a write. User-fixable problems come back as `{ok:false,error}` for the
 * screen to show; anything else is a bug and is rethrown.
 */
export function useWrite() {
  const db = useDb();
  const bump = useVersion(s => s.bump);
  return useCallback(
    async <T>(fn: (db: Db) => Promise<T>): Promise<WriteResult<T>> => {
      try {
        const value = await fn(db);
        bump();
        return { ok: true, value };
      } catch (e) {
        if (e instanceof ValidationError) {
          return { ok: false, error: e.message };
        }
        throw e;
      }
    },
    [db, bump],
  );
}
