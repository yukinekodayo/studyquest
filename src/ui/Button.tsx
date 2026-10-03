import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { haptic } from '@/lib/haptics';
import { PressableScale } from './PressableScale';
import { Text } from './Text';
import { colors, radius, themed } from './theme';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger' | 'light' | 'tint';
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

const palette = themed((): Record<Variant, { bg: string; fg: string }> => ({
  primary: { bg: colors.blue, fg: colors.white },
  soft: { bg: colors.beige, fg: colors.ink },
  ghost: { bg: 'transparent', fg: colors.blue },
  danger: { bg: colors.redSoft, fg: colors.red },
  light: { bg: colors.white, fg: colors.blue },
  tint: { bg: colors.blueSoft, fg: colors.blue },
}));
const heights: Record<Size, number> = { lg: 54, md: 46, sm: 38 };

/** フラットなボタン。押すと沈み、軽く振動する。処理中は二重タップを防ぐ */
export function Button({ label, onPress, variant = 'primary', size = 'lg', icon, loading, disabled, style, testID, accessibilityLabel }: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const p = palette[variant];
  const isDisabled = disabled || loading || busy;

  const handle = async () => {
    if (isDisabled || !onPress) return;
    haptic.tap();
    try {
      setBusy(true);
      await onPress();
    } finally {
      setBusy(false);
    }
  };

  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading || busy }}
      onPress={handle}
      pressedScale={0.97}
      style={[styles.base, { minHeight: heights[size], backgroundColor: p.bg, opacity: isDisabled && !(loading || busy) ? 0.5 : 1, paddingHorizontal: size === 'sm' ? 16 : 22 }, style]}
    >
      <View style={styles.row}>
        {loading || busy ? (
          <ActivityIndicator color={p.fg} />
        ) : (
          <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={p.fg} /> : null}
            <Text variant="bodyBold" color={p.fg} size={size === 'lg' ? 16 : size === 'sm' ? 13 : 15}>
              {label}
            </Text>
          </>
        )}
      </View>
    </PressableScale>
  );
}

const styles = themed(() => StyleSheet.create({
  base: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
}));
