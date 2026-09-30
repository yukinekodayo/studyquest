import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  /** 保存済みセッションの読み込み中 */
  loading: boolean;
  userId: string | null;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true, userId: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({ session, loading, userId: session?.user.id ?? null }), [session, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);

/** ログイン中でのみ使う。userId が無ければ例外(ルーティングで防いでいる) */
export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('not authenticated');
  return userId;
}
