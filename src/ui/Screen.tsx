import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DotBackground } from './DotBackground';
import { colors, NAV_HEIGHT } from './theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** 下部ナビがある画面では true(下に余白を足す) */
  withNav?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}

export function Screen({ children, scroll = true, withNav = false, onRefresh, refreshing = false, contentStyle, footer }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = (withNav ? NAV_HEIGHT + insets.bottom : insets.bottom) + 24;
  const padStyle = { paddingTop: insets.top + 12, paddingBottom: footer ? 16 : bottomPad };
  return (
    <View style={styles.root}>
      <DotBackground />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, padStyle, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padStyle, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
  content: { paddingHorizontal: 16, gap: 14 },
});
