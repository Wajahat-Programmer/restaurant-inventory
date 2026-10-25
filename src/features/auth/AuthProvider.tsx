import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AutoLockMinutes, shouldAutoLock } from '../../domain/auth';
import { lockEnabled, logout as endSession } from '../../services/authService';
import { getIntSetting } from '../../services/settingsService';
import { getSession, SessionUser, setSession } from '../../services/session';
import { useDb } from '../DbProvider';

interface AuthValue {
  /** The signed-in person, or null when nobody is. */
  user: SessionUser | null;
  /** True when the lock is on and nobody has unlocked yet. */
  locked: boolean;
  /** Whether a PIN lock has been set up at all. */
  lockOn: boolean;
  unlock: (u: SessionUser) => void;
  /** Lock now (sign out). */
  lock: () => void;
  /** Re-read whether the lock is on, after setting it up or turning it off. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Knows who is signed in and whether the app must be locked. Going to the
 * background for longer than the chosen time locks it again.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const [lockOn, setLockOn] = useState<boolean | null>(null);
  const [user, setUser] = useState<SessionUser | null>(getSession());
  const leftAt = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const on = await lockEnabled(db);
    setLockOn(on);
    if (!on) {
      setSession(null);
      setUser(null);
    }
  }, [db]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const lock = useCallback(() => {
    endSession();
    setUser(null);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async state => {
      if (state === 'active') {
        const minutes = (await getIntSetting(db, 'auth.autoLock', 0, 15)) as AutoLockMinutes;
        if (getSession() && shouldAutoLock(leftAt.current, Date.now(), minutes)) {
          lock();
        }
        leftAt.current = null;
      } else if (leftAt.current === null) {
        leftAt.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [db, lock]);

  if (lockOn === null) {
    return null;
  }
  const value: AuthValue = {
    user,
    lockOn,
    locked: lockOn && !user,
    unlock: u => setUser(u),
    lock,
    refresh,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(AuthContext);
  if (!v) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return v;
}
