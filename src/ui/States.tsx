import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { toUserMessage } from '@/domain/errors';
import { Button } from './Button';
import { Text } from './Text';
import { colors, radius, themed } from './theme';

/** 読み込み中の骨組み(ふわっと明滅)。スピナーより「すぐ出る」感じになる */
export function Skeleton({ width = '100%', height = 16, style }: { width?: DimensionValue; height?: number; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(o, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(o, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [o]);
  return <Animated.View style={[{ width, height, borderRadius: 8, backgroundColor: colors.track, opacity: o }, style]} />;
}

/** 画面全体の読み込み表示(カード型の骨組み) */
export function LoadingState({ label = 'よみこみ中' }: { label?: string }) {
  return (
    <View style={styles.skel} accessibilityRole="progressbar" accessibilityLabel={label}>
      <Skeleton height={34} width="60%" />
      <View style={styles.card}>
        <Skeleton height={14} width="35%" />
        <Skeleton height={44} width="30%" />
        <Skeleton height={6} />
      </View>
      <View style={styles.card}>
        <Skeleton height={18} width="40%" />
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </View>
    </View>
  );
}

export function ErrorState({ error, onRetry, message }: { error?: unknown; onRetry?: () => void; message?: string }) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={colors.inkFaint} />
      <Text variant="bodyBold" align="center">{message ?? toUserMessage(error)}</Text>
      {onRetry ? <Button label="もういちど" variant="soft" size="md" icon="refresh" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text variant="title" size={20} align="center">{title}</Text>
      {body ? <Text variant="body" color={colors.inkSoft} align="center">{body}</Text> : null}
      {action}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  skel: { gap: 16, paddingTop: 8 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, gap: 14 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 36, paddingHorizontal: 24 },
}));
