import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, themed } from './theme';

interface Props {
  total: number;
  done: number;
  height?: number;
  doneColor?: string;
  trackColor?: string;
  gap?: number;
}

/** 「2 / 4」の分割バー。増えるときはスッと塗られる */
export function ProgressSegments({ total, done, height = 6, doneColor = colors.blue, trackColor = colors.track, gap = 6 }: Props) {
  const n = Math.max(total, 1);
  return (
    <View style={[styles.row, { gap }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      {Array.from({ length: n }, (_, i) => (
        <Segment key={i} filled={i < done} height={height} color={doneColor} track={trackColor} delay={i * 70} />
      ))}
    </View>
  );
}

function Segment({ filled, height, color, track, delay }: { filled: boolean; height: number; color: string; track: string; delay: number }) {
  const v = useRef(new Animated.Value(filled ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: filled ? 1 : 0, duration: 380, delay: filled ? delay : 0, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [filled, v, delay]);
  return (
    <View style={[styles.seg, { height, backgroundColor: track }]}>
      <Animated.View style={{ height, borderRadius: height, backgroundColor: color, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row' },
  seg: { flex: 1, borderRadius: 999, overflow: 'hidden' },
}));
