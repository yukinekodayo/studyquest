import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { STAMP_META, type StampType } from '@/domain/stamps';
import { Stamp } from './Stamp';
import { themed } from './theme';

interface Props {
  type: StampType;
  size?: number;
  /** すでに押してある */
  claimed: boolean;
  /** 押す処理(サーバー)。成功なら true */
  onPress: () => Promise<boolean>;
  /** 押した直後(サーバー反映待ち)に呼ばれる。案内文を隠すのに使う */
  onStamped?: () => void;
}

const PARTICLES = 12;

/**
 * 自分でタップして押すハンコ。
 * 指を置くと押し込まれ(中の振動)、離すと上から「ドンッ」と落ちて、強い振動 + 衝撃の輪 + インクの飛び散り。
 */
export function PressableStamp({ type, size = 190, claimed, onPress, onStamped }: Props) {
  const color = STAMP_META[type].color;
  const [phase, setPhase] = useState<'idle' | 'slam' | 'done'>(claimed ? 'done' : 'idle');
  const busy = useRef(false);

  const hold = useRef(new Animated.Value(0)).current; // 指を置いている間 0→1
  const drop = useRef(new Animated.Value(0)).current; // 落下 0→1
  const shock = useRef(new Animated.Value(0)).current; // 衝撃の輪 0→1
  const pulse = useRef(new Animated.Value(0)).current; // 待機中の呼吸

  const particles = useMemo(
    () => Array.from({ length: PARTICLES }, (_, i) => ({ angle: (i / PARTICLES) * Math.PI * 2 + (i % 2) * 0.2, dist: size * (0.62 + (i % 3) * 0.1), r: 3 + (i % 3) * 1.5 })),
    [size],
  );

  useEffect(() => {
    if (claimed && phase === 'idle') setPhase('done');
  }, [claimed, phase]);

  // 待機中はゆっくり呼吸して「押せる」ことを伝える
  useEffect(() => {
    if (phase !== 'idle') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [phase, pulse]);

  const pressIn = () => {
    if (phase !== 'idle' || busy.current) return;
    haptic.press();
    Animated.spring(hold, { toValue: 1, speed: 30, bounciness: 0, useNativeDriver: true }).start();
  };
  const pressOut = () => {
    if (phase !== 'idle') return;
    Animated.spring(hold, { toValue: 0, speed: 30, bounciness: 4, useNativeDriver: true }).start();
  };

  const slam = async () => {
    if (phase !== 'idle' || busy.current) return;
    busy.current = true;
    setPhase('slam');
    onStamped?.();
    drop.setValue(0);
    shock.setValue(0);
    const request = onPress();
    Animated.timing(drop, { toValue: 1, duration: 190, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      void haptic.stamp();
      Animated.timing(shock, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    });
    const ok = await request;
    if (!ok) {
      // 失敗: 元に戻して、もう一度押せるようにする
      drop.setValue(0);
      setPhase('idle');
    } else {
      setTimeout(() => setPhase('done'), 700);
    }
    busy.current = false;
  };

  const scaleHold = hold.interpolate({ inputRange: [0, 1], outputRange: [1, 0.93] });
  const scalePulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });
  const ghostOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.34] });

  return (
    <View style={styles.wrap}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={slam}
        disabled={phase !== 'idle'}
        accessibilityRole="button"
        accessibilityLabel={phase === 'done' ? 'ハンコを押しました' : 'ハンコを押す'}
        accessibilityHint="タップするとハンコが押されます"
        testID="press-stamp"
        style={[styles.area, { width: size + 40, height: size + 40 }]}
      >
        {/* 衝撃の輪 */}
        {phase !== 'idle' ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { width: size, height: size, borderRadius: size / 2, borderColor: color },
              { opacity: shock.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }), transform: [{ scale: shock.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.6] }) }] },
            ]}
          />
        ) : null}
        {/* インクの飛び散り */}
        {phase === 'slam' || phase === 'done'
          ? particles.map((p, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: p.r * 2,
                  height: p.r * 2,
                  borderRadius: p.r,
                  backgroundColor: color,
                  opacity: shock.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.8, 0] }),
                  transform: [
                    { translateX: shock.interpolate({ inputRange: [0, 1], outputRange: [Math.cos(p.angle) * size * 0.4, Math.cos(p.angle) * p.dist] }) },
                    { translateY: shock.interpolate({ inputRange: [0, 1], outputRange: [Math.sin(p.angle) * size * 0.4, Math.sin(p.angle) * p.dist] }) },
                    { scale: shock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
                  ],
                }}
              />
            ))
          : null}

        {phase === 'idle' ? (
          <>
            <Animated.View style={{ position: 'absolute', opacity: ghostOpacity, transform: [{ scale: scalePulse }] }}>
              <Stamp type={type} size={size} locked />
            </Animated.View>
            <Animated.View style={[styles.dashed, { width: size, height: size, borderRadius: size / 2, borderColor: color, transform: [{ scale: Animated.multiply(scalePulse, scaleHold) }] }]} />
          </>
        ) : null}

        {phase === 'slam' ? (
          <Animated.View
            style={{
              opacity: drop.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
              transform: [
                { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [1.85, 1] }) },
                { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '-4deg'] }) },
              ],
            }}
          >
            <Stamp type={type} size={size} />
          </Animated.View>
        ) : null}

        {phase === 'done' ? (
          <View style={{ transform: [{ rotate: '-4deg' }] }} testID="stamp-pressed">
            <Stamp type={type} size={size} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: 'center' },
  area: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', borderWidth: 3 },
  dashed: { position: 'absolute', borderWidth: 2, borderStyle: 'dashed' },
}));
