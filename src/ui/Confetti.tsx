import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

const COLORS = ['#D8323A', '#2F6FE0', '#2E9E5B', '#F2A93B', '#7A4FD3'];

/** 紙吹雪(軽量・ネイティブドライバ)。達成画面で1回だけ降らせる */
export function Confetti({ count = 26 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * width,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length] ?? '#2F6FE0',
        delay: Math.random() * 500,
        duration: 1800 + Math.random() * 1400,
        rot: Math.random() * 360,
        round: i % 3 === 0,
      })),
    [count, width],
  );
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <Piece key={p.id} {...p} fall={height * 0.75} />
      ))}
    </View>
  );
}

function Piece({ x, size, color, delay, duration, rot, round, fall }: { x: number; size: number; color: string; delay: number; duration: number; rot: number; round: boolean; fall: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [t, duration, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: -20,
        width: size,
        height: round ? size : size * 1.8,
        borderRadius: round ? size : 2,
        backgroundColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, fall] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${rot}deg`, `${rot + 260}deg`] }) },
        ],
      }}
    />
  );
}
