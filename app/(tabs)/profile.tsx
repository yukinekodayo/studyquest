import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DAILY_STAMP_TYPES, STAMP_META } from '@/domain/stamps';
import { daysInMonth, parseYmd } from '@/domain/dates';
import { useProfile, useRefetchOnFocus, useStats } from '@/features/hooks';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
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
  const t = parseYmd(s.today);

  return (
    <Screen withNav>
      <FadeIn index={0}>
        <View style={styles.headerRow}>
          <Text variant="display" size={32}>マイページ</Text>
          <PressableScale onPress={() => router.push('/settings')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="設定" testID="profile-settings" feedback>
            <Ionicons name="settings-outline" size={24} color={colors.ink} />
          </PressableScale>
        </View>
        <View style={styles.who}>
          <Avatar name={p.nickname} color={p.avatar} size={84} solid />
          <View style={styles.whoText}>
            <Text variant="title" size={26} testID="profile-name">{p.nickname}</Text>
            <View style={styles.whoRow}>
              <Text variant="bodyBold" size={13} color={colors.inkSoft} testID="level">Lv.{s.level}</Text>
              <Ionicons name="flame" size={15} color={colors.orange} />
              <Text variant="bodyBold" size={13} color={colors.orange}>{s.current_streak}日連続中</Text>
            </View>
          </View>
        </View>
        <View style={styles.xp}>
          <View style={styles.xpLabels}>
            <Text variant="caption" size={13}>次のレベルまで あと{s.xp_per_level - s.xp_in_level} XP</Text>
            <Text variant="numMedium" size={13} color={colors.inkSoft}>{s.xp_in_level} / {s.xp_per_level}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { width: `${(s.xp_in_level / s.xp_per_level) * 100}%` }]} /></View>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <Card style={styles.numbers}>
          <View style={styles.numCol}>
            <Text variant="caption" size={13}>今月の達成</Text>
            <Text variant="num" size={34} testID="month-days">{s.month_days}<Text variant="bodyBold" size={13} color={colors.inkSoft}> / {daysInMonth(t.y, t.m)}日</Text></Text>
          </View>
          <View style={styles.vline} />
          <View style={styles.numCol}>
            <Text variant="caption" size={13}>連続</Text>
            <Text variant="num" size={34}>{s.current_streak}<Text variant="bodyBold" size={13} color={colors.inkSoft}> 日</Text></Text>
          </View>
          <View style={styles.vline} />
          <View style={styles.numCol}>
            <Text variant="caption" size={13}>累計達成</Text>
            <Text variant="num" size={34} testID="total-days">{s.total_days}<Text variant="bodyBold" size={13} color={colors.inkSoft}> 日</Text></Text>
          </View>
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <Card>
          <View style={styles.collectHead}>
            <Text variant="heading" size={17}>獲得したハンコ</Text>
            <PressableScale onPress={() => router.push('/stamps')} accessibilityRole="link" testID="to-stamps-book" feedback>
              <Text variant="bodyBold" color={colors.blue} size={14}>ハンコ帳へ ›</Text>
            </PressableScale>
          </View>
          <View style={styles.collectRow}>
            {DAILY_STAMP_TYPES.map((k) => {
              const n = s.stamp_counts[k] ?? 0;
              return (
                <View key={k} style={styles.collectItem}>
                  <Stamp type={k} size={56} locked={n === 0} />
                  <Text variant="bodyBold" size={13}>{STAMP_META[k].name}</Text>
                  <Text variant="caption" size={11}>{n > 0 ? `×${n}` : STAMP_META[k].requirement}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      <FadeIn index={3}>
        <View>
          <MenuRow icon="create-outline" label="プロフィールの編集" onPress={() => router.push('/settings')} />
          <MenuRow icon="help-circle-outline" label="使い方ガイド" onPress={() => setGuide(true)} />
        </View>
      </FadeIn>

      <Sheet visible={guide} title="使い方ガイド" onClose={() => setGuide(false)}>
        {['1. 「クエスト」で、今日やることを自分で決めて追加します', '2. 「開始」を押すとタイマーがスタート。終わったら「終了」', '3. 「絶対やる」をぜんぶ終えたら、ハンコをタップして押します', '4. 毎日続けると、青・緑・金・特別ハンコが手に入ります', '5. 友だちを追加すると、おたがいの進み具合が見えます。1日休んでも、集めたハンコは消えません'].map((x) => (
          <Text key={x} variant="body">{x}</Text>
        ))}
      </Sheet>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.menu} accessibilityRole="button" pressedScale={0.985} feedback>
      <Ionicons name={icon} size={22} color={colors.inkSoft} />
      <Text variant="bodyBold" size={16} style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  who: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  whoText: { flex: 1, gap: 4 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  xp: { marginTop: 16, gap: 6 },
  xpLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
  numbers: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  numCol: { flex: 1, alignItems: 'flex-start', gap: 2, paddingLeft: 4 },
  vline: { width: 1, height: 48, backgroundColor: colors.track },
  collectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  collectRow: { flexDirection: 'row', justifyContent: 'space-between' },
  collectItem: { flex: 1, alignItems: 'center', gap: 3 },
  menu: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 58, borderBottomWidth: 1, borderBottomColor: colors.line },
  menuLabel: { flex: 1 },
});
