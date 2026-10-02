import { useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';

interface Props extends Omit<PressableProps, 'style' | 'children'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 押し込んだときの縮み(1で無し) */
  pressedScale?: number;
  /** タップ時の軽い振動 */
  feedback?: boolean;
}

/** 親の中での「置き場所」を決めるスタイルは外側に、見た目(背景・余白など)は内側に適用する */
const OUTER_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'position', 'top', 'left', 'right', 'bottom', 'zIndex',
]);

function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) (OUTER_KEYS.has(k) ? outer : inner)[k] = v;
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

/** 押すと少し沈む(触って気持ちいい)Pressable */
export function PressableScale({ children, style, pressedScale = 0.97, feedback = false, onPress, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, speed: 40, bounciness: 6, useNativeDriver: true }).start();
  const { outer, inner } = splitStyle(style);
  return (
    <Pressable
      {...rest}
      style={outer}
      onPressIn={(e: GestureResponderEvent) => {
        to(pressedScale);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        to(1);
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (feedback) haptic.tap();
        onPress?.(e);
      }}
    >
      <Animated.View style={[inner, outer.flex !== undefined ? { flex: 1 } : null, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
