import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toUserMessage } from '@/domain/errors';
import { Text } from './Text';
import { colors, radius } from './theme';

type Tone = 'error' | 'success' | 'info';
interface ToastApi {
  show: (message: string, tone?: Tone) => void;
  /** 例外をユーザー向け文言にしてエラー表示 */
  showError: (error: unknown) => void;
}
const ToastContext = createContext<ToastApi>({ show: () => undefined, showError: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<{ id: number; message: string; tone: Tone } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, tone: Tone = 'info') => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), message, tone });
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => setToast(null));
      }, 3200);
    },
    [opacity],
  );
  const showError = useCallback((e: unknown) => show(toUserMessage(e), 'error'), [show]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const api = useMemo(() => ({ show, showError }), [show, showError]);
  const bg = toast?.tone === 'error' ? colors.red : toast?.tone === 'success' ? colors.green : colors.ink;
  const icon = toast?.tone === 'error' ? 'alert-circle' : toast?.tone === 'success' ? 'checkmark-circle' : 'information-circle';

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View pointerEvents="none" style={[styles.host, { top: insets.top + 8 }]}>
          <Animated.View style={[styles.toast, { backgroundColor: bg, opacity }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <Ionicons name={icon} size={20} color={colors.white} />
            <Text variant="bodyBold" color={colors.white} style={styles.msg}>{toast.message}</Text>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = (): ToastApi => useContext(ToastContext);

/** 失敗してもクラッシュせず、ユーザー向けのメッセージを出す実行ヘルパー */
export function useRun() {
  const { showError } = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        showError(e);
        return undefined;
      }
    },
    [showError],
  );
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 100 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, borderRadius: radius.md, maxWidth: 480 },
  msg: { flexShrink: 1 },
});
