import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DAILY_STAMP_TYPES, STAMP_META } from '@/domain/stamps';
import { useProfile, useRefetchOnFocus, useStats } from '@/features/hooks';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const profile = useProfile();
  const stats = useStats();
  const [guide, setGuide] = useState(false);
  useRefetchOnFocus(() => { void stats.refetch(); });

  if (profile.isLoading || stats.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (profile.isError || stats.isError || !profile.data || !stats.data) {
    return <Screen scroll={false}><ErrorState error={profile.error ?? stats.error} onRetry={() => { void profile.refetch(); void stats.refetch(); }} /></Screen>;
  }
  const p = profile.data;
  const s = stats.data;
  const daysInThisMonth = new Date(Number(s.today.slice(0, 4)), Number(s.today.slice(5, 7)), 0).getDate();

  return (
    <Screen withNav>
      <View style={styles.headerRow}>
        <Text variant="title">マイページ</Text>
        <Pressable onPress={() => router.push('/settings')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="設定" testID="profile-settings">
          <Ionicons name="settings-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.who}>
        <Avatar animal={p.avatar} size={92} />
        <View style={styles.whoText}>
          <Text variant="title" testID="profile-name">{p.nickname}</Text>
          <View style={styles.whoRow}>
            <Text variant="bodyBold" size={13} color={colors.inkSoft} testID="level">Lv.{s.level}</Text>
            <Ionicons name="flame" size={16} color={colors.orange} />
            <Text variant="bodyBold" size={14} color="#B7791F">{s.current_streak}日連続中</Text>
          </View>
        </View>
      </View>

      <View>
        <View style={styles.xpLabels}>
          <Text variant="caption">次のレベルまで あと{s.xp_per_level - s.xp_in_level} XP</Text>
          <Text variant="caption">{s.xp_in_level} / {s.xp_per_level}</Text>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: `${(s.xp_in_level / s.xp_per_level) * 100}%` }]} /></View>
      </View>

      <View style={styles.numbers}>
        <View style={styles.numCol}>
          <Text variant="caption">今月の達成</Text>
          <Text variant="num" size={30} testID="month-days">{s.month_days}<Text variant="bodyBold" size={13} color={colors.inkSoft}> / {daysInThisMonth}日</Text></Text>
        </View>
        <View style={styles.vline} />
        <View style={styles.numCol}>
          <Text variant="caption">連続</Text>
          <Text variant="num" size={30}>{s.current_streak}<Text variant="bodyBold" size={13} color={colors.inkSoft}> 日</Text></Text>
        </View>
        <View style={styles.vline} />
        <View style={styles.numCol}>
          <Text variant="caption">累計達成</Text>
          <Text variant="num" size={30} testID="total-days">{s.total_days}<Text variant="bodyBold" size={13} color={colors.inkSoft}> 日</Text></Text>
        </View>
      </View>

      <Card>
        <View style={styles.collectHead}>
          <Text variant="heading" size={17}>獲得したハンコ</Text>
          <Pressable onPress={() => router.push('/stamps')} accessibilityRole="link" hitSlop={8} testID="to-stamps-book">
            <Text variant="bodyBold" color={colors.blue} size={14}>ハンコ帳へ ›</Text>
          </Pressable>
        </View>
        <View style={styles.collectRow}>
          {DAILY_STAMP_TYPES.map((k) => {
            const n = s.stamp_counts[k] ?? 0;
            return (
              <View key={k} style={styles.collectItem}>
                <Stamp type={k} size={54} locked={n === 0} />
                <Text variant="bodyBold" size={13}>{STAMP_META[k].name}</Text>
                <Text variant="caption" size={11}>{n > 0 ? `×${n}` : STAMP_META[k].requirement}</Text>
              </View>
            );
          })}
        </View>
      </Card>

      <View>
        <MenuRow icon="create-outline" label="プロフィールの編集" onPress={() => router.push('/settings')} />
        <MenuRow icon="help-circle-outline" label="使い方ガイド" onPress={() => setGuide(true)} />
      </View>

      <Sheet visible={guide} title="使い方ガイド" onClose={() => setGuide(false)}>
        {['1. 「クエスト」で、今日やることを自分で決めて追加しよう', '2. 「開始」を押すとタイマーがスタート。終わったら「終了」', '3. 「絶対やる」を全部終えると、その日のハンコがもらえるよ', '4. 毎日続けると、青・緑・金・特別ハンコが手に入るよ', '5. 友だちを追加すると、おたがいの進み具合が見えるよ。1日休んでも、集めたハンコは消えないから安心してね'].map((t) => (
          <Text key={t} variant="body">{t}</Text>
        ))}
      </Sheet>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.menu} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={colors.inkSoft} />
      <Text variant="bodyBold" size={16} style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  whoText: { flex: 1, gap: 4 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: { height: 10, borderRadius: 5, backgroundColor: '#EFE7D2', overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.orange },
  numbers: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, borderStyle: 'dashed' },
  numCol: { flex: 1, alignItems: 'center', gap: 2 },
  vline: { width: 1, height: 44, backgroundColor: colors.line },
  collectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  collectRow: { flexDirection: 'row', justifyContent: 'space-between' },
  collectItem: { flex: 1, alignItems: 'center', gap: 2 },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: colors.line, borderStyle: 'dashed' },
  menuLabel: { flex: 1 },
});
