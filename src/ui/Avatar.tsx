import { StyleSheet, View } from 'react-native';
import type { AvatarKey } from '@/domain/validation';
import { Text } from './Text';
import { colors, fonts } from './theme';

const PALETTE: Record<AvatarKey, { tint: string; fg: string }> = {
  blue: { tint: '#E3EAFB', fg: '#2350D2' },
  green: { tint: '#DCEBE3', fg: '#2B7A4B' },
  indigo: { tint: '#E2E5F6', fg: '#3B4A9E' },
  rose: { tint: '#F7E1E1', fg: '#B03A3A' },
  amber: { tint: '#F3EBD3', fg: '#8A6A12' },
  teal: { tint: '#D9EEEE', fg: '#1D7C7C' },
  violet: { tint: '#EAE2F6', fg: '#6B4FBB' },
  slate: { tint: '#E6E7EB', fg: '#4A5263' },
};

export const avatarFg = (color: AvatarKey): string => PALETTE[color].fg;

/** ニックネームの頭文字 + 色のアバター(個人を特定する写真は使わない) */
export function Avatar({ name, color, size = 44, solid = false, ring }: { name: string; color: AvatarKey; size?: number; solid?: boolean; ring?: string }) {
  const p = PALETTE[color] ?? PALETTE.blue;
  const initial = Array.from(name.trim())[0] ?? '?';
  return (
    <View
      accessibilityLabel={`${name}のアイコン`}
      style={[
        styles.base,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: solid ? colors.blue : p.tint },
        ring ? { borderWidth: 2, borderColor: ring } : null,
      ]}
    >
      <Text style={{ fontFamily: fonts.serif, fontSize: size * 0.46, lineHeight: size * 0.62, color: solid ? colors.white : p.fg, includeFontPadding: false }}>
        {initial}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
