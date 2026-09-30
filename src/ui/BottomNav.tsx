import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { colors, NAV_HEIGHT } from './theme';

export type NavKey = 'home' | 'quest' | 'friends' | 'groups' | 'profile';

const ITEMS: Array<{ key: NavKey; label: string; icon: keyof typeof Ionicons.glyphMap; iconActive: keyof typeof Ionicons.glyphMap }> = [
  { key: 'home', label: 'ホーム', icon: 'home-outline', iconActive: 'home' },
  { key: 'quest', label: 'クエスト', icon: 'clipboard-outline', iconActive: 'clipboard' },
  { key: 'friends', label: 'フレンド', icon: 'people-outline', iconActive: 'people' },
  { key: 'groups', label: 'グループ', icon: 'people-circle-outline', iconActive: 'people-circle' },
  { key: 'profile', label: 'マイページ', icon: 'person-outline', iconActive: 'person' },
];

/** 画面下に固定。選択中は青いピル+太字ラベル */
export function BottomNav({ active, onSelect, badge }: { active: NavKey; onSelect: (key: NavKey) => void; badge?: Partial<Record<NavKey, boolean>> }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8), height: NAV_HEIGHT + Math.max(insets.bottom, 8) - 8 }]} accessibilityRole="tablist">
      {ITEMS.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            key={it.key}
            onPress={() => onSelect(it.key)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            testID={`nav-${it.key}`}
          >
            <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
              <Ionicons name={on ? it.iconActive : it.icon} size={22} color={on ? colors.white : colors.inkSoft} />
              {badge?.[it.key] ? <View style={styles.badge} /> : null}
            </View>
            <Text variant={on ? 'bodyBold' : 'caption'} size={11} color={on ? colors.ink : colors.inkSoft} style={on ? styles.labelOn : undefined}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 56 },
  iconWrap: { width: 58, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  iconWrapOn: { backgroundColor: colors.blue },
  labelOn: { fontFamily: 'ZenMaruGothic_900Black' },
  badge: { position: 'absolute', top: 4, right: 14, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white },
});
