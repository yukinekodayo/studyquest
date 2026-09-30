import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { isAuthExpired } from '@/domain/errors';
import { supabase } from './supabase';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) => !isAuthExpired(error) && count < 2,
        staleTime: 5_000,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  // アプリがフォアグラウンドに戻ったらデータを再取得
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (s) => focusManager.setFocused(s === 'active'));
    return () => sub.remove();
  }, []);

  // ログアウト時にキャッシュを空にして、別ユーザーのデータが見えないようにする
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') client.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
