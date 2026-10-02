import { DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { NotoSansJP_500Medium, NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp';
import { ShipporiMincho_500Medium, ShipporiMincho_700Bold } from '@expo-google-fonts/shippori-mincho';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { QueryProvider } from '@/lib/query';
import { isSupabaseConfigured } from '@/lib/supabase';
import { Screen } from '@/ui/Screen';
import { ErrorState } from '@/ui/States';
import { ToastProvider } from '@/ui/Toast';
import { colors } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ShipporiMincho_500Medium,
    ShipporiMincho_700Bold,
    NotoSansJP_500Medium,
    NotoSansJP_700Bold,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;

  if (!isSupabaseConfigured) {
    return (
      <SafeAreaProvider>
        <Screen scroll={false}>
          <ErrorState message="アプリの設定がまだ終わっていません(EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY)" />
        </Screen>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="dark" />
            <Gate />
          </ToastProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}

/** ログイン状態に合わせて画面を出し分ける */
function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const segs: string[] = segments;
  const inAuth = segs[0] === '(auth)';

  useEffect(() => {
    if (loading) return;
    if (!session && !inAuth) router.replace('/login');
    else if (session && (inAuth || segs.length === 0)) router.replace('/home');
  }, [loading, session, inAuth, segs.length, router]);

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'fade' }}>
      <Stack.Screen name="quest/[id]" options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="complete" options={{ animation: 'fade', gestureEnabled: false }} />
    </Stack>
  );
}
