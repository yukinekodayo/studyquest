import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, NAV_HEIGHT, themed } from './theme';

interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** 下部ナビがある画面では true(下に余白を足す) */
  withNav?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
  background?: string;
}

export function Screen({ children, scroll = true, withNav = false, onRefresh, refreshing = false, contentStyle, footer, background = colors.bg }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = (withNav ? NAV_HEIGHT + insets.bottom : insets.bottom) + 24;
  const padStyle = { paddingTop: insets.top + 16, paddingBottom: footer ? 16 : bottomPad };
  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, padStyle, contentStyle]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} /> : undefined}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, padStyle, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 14, paddingTop: 8 }}>{footer}</View> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
}));
