import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from './theme';

export function Card({ children, style, tone = 'white', testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'white' | 'blue' | 'beige' | 'solid'; testID?: string }) {
  return (
    <View testID={testID} style={[styles.card, tone === 'white' && shadow.card, toneStyles[tone], style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 18 },
});
const toneStyles = StyleSheet.create({
  white: {},
  blue: { backgroundColor: colors.blueSoft },
  beige: { backgroundColor: colors.beige },
  solid: { backgroundColor: colors.blue },
});
