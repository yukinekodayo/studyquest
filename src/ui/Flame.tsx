import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

/** ゆらゆら揺れる炎(連続日数のアイコン)。動きを控えめにしたい端末設定でも軽い */
export function Flame({ size = 18, color, active = true }: { size?: number; color: string; active?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 640, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, active]);
  return (
    <Animated.View style={{ transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }, { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) }] }}>
      <Ionicons name="flame" size={size} color={color} />
    </Animated.View>
  );
}
