import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { haptic } from '@/lib/haptics';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

/** 「今日の進み具合 / 一緒に勉強する」の切り替え(青い下線) */
export function FriendsTabs({ active }: { active: 'progress' | 'party' }) {
  const router = useRouter();
  const item = (key: 'progress' | 'party', label: string, href: string) => {
    const on = active === key;
    return (
      <Pressable key={key} onPress={() => { if (!on) { haptic.select(); router.replace(href); } }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.item, on && styles.itemOn]} testID={`tab-${key}`}>
        <Text variant={on ? 'bodyBold' : 'body'} size={16} color={on ? colors.ink : colors.inkSoft}>{label}</Text>
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
  row: { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: colors.track },
  item: { minHeight: 44, justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent', marginBottom: -1 },
  itemOn: { borderBottomColor: colors.blue },
});
