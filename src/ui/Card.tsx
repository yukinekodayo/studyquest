import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow } from './theme';

export function Card({ children, style, tone = 'white', testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'white' | 'yellow' | 'blue' | 'beige'; testID?: string }) {
  return <View testID={testID} style={[styles.card, toneStyles[tone], style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, ...shadow.card },
});
const toneStyles = StyleSheet.create({
  white: {},
  yellow: { backgroundColor: colors.yellow },
  blue: { backgroundColor: colors.blueSoft },
  beige: { backgroundColor: colors.beige },
});
