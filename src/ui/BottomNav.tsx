import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/lib/haptics';
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

/** 画面下に固定。選択中は上の青いバー + 青いアイコン + 太字ラベル */
export function BottomNav({ active, onSelect, badge }: { active: NavKey; onSelect: (key: NavKey) => void; badge?: Partial<Record<NavKey, boolean>> }) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <View style={[styles.bar, { paddingBottom: bottom, height: NAV_HEIGHT - 8 + bottom }]} accessibilityRole="tablist">
      {ITEMS.map((it) => {
        const on = it.key === active;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              if (!on) haptic.select();
              onSelect(it.key);
            }}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={it.label}
            testID={`nav-${it.key}`}
          >
            <View style={[styles.indicator, on && styles.indicatorOn]} />
            <View>
              <Ionicons name={on ? it.iconActive : it.icon} size={24} color={on ? colors.blue : colors.inkSoft} />
              {badge?.[it.key] ? <View style={styles.badge} /> : null}
            </View>
            <Text variant={on ? 'bodyBold' : 'caption'} size={11} color={on ? colors.blue : colors.inkSoft}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line },
  item: { flex: 1, alignItems: 'center', gap: 3, minHeight: 56, paddingTop: 10 },
  indicator: { position: 'absolute', top: -1, width: 26, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  indicatorOn: { backgroundColor: colors.blue },
  badge: { position: 'absolute', top: -1, right: -4, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white },
});
