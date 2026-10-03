import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { colors, setScheme, type Scheme } from '@/ui/theme';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'studyquest.theme.v1';

interface ThemeApi {
  mode: ThemeMode;
  scheme: Scheme;
  setMode: (m: ThemeMode) => void;
}
const ThemeContext = createContext<ThemeApi>({ mode: 'system', scheme: 'light', setMode: () => undefined });
export const useTheme = (): ThemeApi => useContext(ThemeContext);

/** 保存した外観(システム/ライト/ダーク)を読み込むまで描画しない。配色が変わると下の画面ツリーは作り直される */
export function ThemeProvider({ children }: { children: (scheme: Scheme) => ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v); })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, []);

  const scheme: Scheme = mode === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
  setScheme(scheme); // 子の描画より前に配色を確定させる

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = colors.bg;
      document.documentElement.style.colorScheme = scheme;
    }
  }, [scheme]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => undefined);
  }, []);
  const api = useMemo(() => ({ mode, scheme, setMode }), [mode, scheme, setMode]);

  if (!loaded) return null;
  return <ThemeContext.Provider value={api}>{children(scheme)}</ThemeContext.Provider>;
}
