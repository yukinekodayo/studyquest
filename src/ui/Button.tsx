import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';
import { colors, radius } from './theme';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
type Size = 'lg' | 'md' | 'sm';

interface ButtonProps {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const palette: Record<Variant, { bg: string; edge: string; fg: string }> = {
  primary: { bg: colors.blue, edge: colors.blueDark, fg: colors.white },
  soft: { bg: colors.blueSoft, edge: colors.blueBorder, fg: colors.blue },
  ghost: { bg: 'transparent', edge: 'transparent', fg: colors.blue },
  danger: { bg: colors.redSoft, edge: '#F1C4C4', fg: colors.red },
};
const heights: Record<Size, number> = { lg: 56, md: 48, sm: 38 };

/** 押すと沈む立体ボタン(PDFの青ボタン)。処理中は二重タップを防ぐ */
export function Button({ label, onPress, variant = 'primary', size = 'lg', icon, loading, disabled, style, testID, accessibilityLabel }: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const p = palette[variant];
  const isDisabled = disabled || loading || busy;
  const edge = variant === 'ghost' ? 0 : size === 'sm' ? 3 : 4;

  const handle = async () => {
    if (isDisabled || !onPress) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    try {
      setBusy(true);
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading || busy }}
      onPress={handle}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: heights[size] + edge,
          backgroundColor: p.bg,
          borderBottomWidth: pressed ? Math.max(0, edge - 3) : edge,
          borderBottomColor: p.edge,
          marginTop: pressed ? Math.min(3, edge) : 0,
          marginBottom: 0,
          opacity: isDisabled ? 0.55 : 1,
          paddingHorizontal: size === 'sm' ? 14 : 20,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading || busy ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={p.fg} /> : null}
            <Text variant="bodyBold" color={p.fg} size={size === 'lg' ? 17 : size === 'sm' ? 13 : 15}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
