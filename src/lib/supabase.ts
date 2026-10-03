import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';
import { createSecureStorage } from '@/lib/secureStorage';
import type { Database } from '@/types/database';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** ネイティブでは認証トークンを SecureStore(Keychain / Keystore)に保存する(詳細は secureStorage.ts) */
const secureStorage = createSecureStorage(SecureStore, AsyncStorage, SecureStore.AFTER_FIRST_UNLOCK);

/** 環境変数が未設定のときは、アプリ側で設定エラー画面を出す(クラッシュさせない) */
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: {
    storage: Platform.OS === 'web' ? AsyncStorage : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// アプリがフォアグラウンドにいる間だけトークンを自動更新する(公式の推奨構成)
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  });
}
