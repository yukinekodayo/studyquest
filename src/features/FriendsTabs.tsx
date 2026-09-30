import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

/** 「今日の進み具合 / 一緒に勉強する」の切り替え(フレンド画面の上部) */
export function FriendsTabs({ active }: { active: 'progress' | 'party' }) {
  const router = useRouter();
  const item = (key: 'progress' | 'party', label: string, href: string) => {
    const on = active === key;
    return (
      <Pressable key={key} onPress={() => !on && router.replace(href)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={styles.item} testID={`tab-${key}`}>
        <View style={on ? styles.mark : undefined}>
          <Text variant={on ? 'heading' : 'bodyBold'} size={16} color={on ? colors.ink : colors.inkSoft}>{label}</Text>
        </View>
      </Pressable>
    );
  };
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {item('progress', '今日の進み具合', '/friends')}
      {item('party', '一緒に勉強する', '/study-party')}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 22, borderBottomWidth: 1, borderBottomColor: colors.line, borderStyle: 'dashed', paddingBottom: 6 },
  item: { minHeight: 40, justifyContent: 'center' },
  mark: { borderBottomWidth: 8, borderBottomColor: colors.yellow },
});
