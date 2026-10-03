import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { toAchievementDefs } from '@/domain/achievements';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { colors, radius, themed } from './theme';

function PopIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, delay, speed: 14, bounciness: 12, useNativeDriver: true }).start();
  }, [v, delay]);
  return (
    <Animated.View style={{ opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** レベルアップのお知らせ */
export function LevelUpBanner({ level }: { level: number }) {
  useEffect(() => {
    haptic.success();
  }, []);
  return (
    <PopIn>
      <View style={[styles.card, styles.level]} testID="levelup-banner" accessibilityLiveRegion="polite">
        <View style={[styles.badge, { backgroundColor: colors.orange }]}><Ionicons name="trending-up" size={22} color={colors.white} /></View>
        <View style={styles.text}>
          <Text variant="label" color={colors.orange}>LEVEL UP</Text>
          <Text variant="title" size={20}>Lv.{level} にレベルアップ</Text>
        </View>
      </View>
    </PopIn>
  );
}

/** あたらしく獲得した実績バッジ(最大3つまで並べる) */
export function AchievementBanners({ codes }: { codes: readonly string[] | undefined }) {
  const defs = toAchievementDefs(codes).slice(0, 3);
  useEffect(() => {
    if (defs.length > 0) haptic.success();
    // 表示された最初の1回だけ振動する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs.length > 0]);
  if (defs.length === 0) return null;
  return (
    <View style={styles.list}>
      {defs.map((d, i) => (
        <PopIn key={d.code} delay={i * 140}>
          <View style={styles.card} testID={`new-achievement-${d.code}`} accessibilityLiveRegion="polite">
            <View style={styles.badge}><Ionicons name={d.icon} size={22} color={colors.white} /></View>
            <View style={styles.text}>
              <Text variant="label" color={colors.blue}>実績を獲得</Text>
              <Text variant="bodyBold" size={17}>{d.name}</Text>
              <Text variant="caption" size={12}>{d.description}</Text>
            </View>
          </View>
        </PopIn>
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  list: { gap: 10, alignSelf: 'stretch' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blueSoft, borderRadius: radius.lg, padding: 14, alignSelf: 'stretch' },
  level: { backgroundColor: colors.levelBanner },
  badge: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 1 },
}));
