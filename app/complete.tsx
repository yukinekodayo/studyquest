import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Share, StyleSheet, View } from 'react-native';
import { useMonthStamps, useStats, useTodayTasks } from '@/features/hooks';
import { parseYmd } from '@/domain/dates';
import { mustProgress } from '@/domain/quest';
import { nextBigMilestone, STAMP_META } from '@/domain/stamps';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Confetti } from '@/ui/Confetti';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

/** 1日の完全達成画面: 今日のクエスト COMPLETE! */
export default function CompleteScreen() {
  const router = useRouter();
  const toast = useToast();
  const stats = useStats();
  const tasks = useTodayTasks();
  const today = stats.data?.today;
  const ym = today ? parseYmd(today) : { y: 1970, m: 1, d: 1 };
  const stamps = useMonthStamps(ym.y, ym.m);
  const thump = useRef(new Animated.Value(0)).current;

  const stamp = stamps.data?.find((s) => s.earned_date === today);
  useEffect(() => {
    if (!stamp) return;
    Animated.timing(thump, { toValue: 1, duration: 520, delay: 250, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
  }, [stamp, thump]);

  if (stats.isLoading || stamps.isLoading || tasks.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (stats.isError || stamps.isError || !stats.data) {
    return <Screen scroll={false}><ErrorState error={stats.error ?? stamps.error} onRetry={() => { void stats.refetch(); void stamps.refetch(); }} /></Screen>;
  }
  // まだクリアしていない(URLを直接開いた等)
  if (!stats.data.cleared_today || !stamp) return <Redirect href="/quest" />;

  const progress = mustProgress(tasks.data ?? []);
  const meta = STAMP_META[stamp.stamp_type];
  const streak = stamp.streak_count;
  const week = streak % 7 === 0 ? 7 : streak % 7;
  const next = nextBigMilestone(streak);

  const share = async () => {
    try {
      await Share.share({ message: `StudyQuestで今日のクエストをクリアしたよ！ 🔥${streak}日連続` });
    } catch {
      toast.show('共有できなかったよ', 'error');
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button label="ハンコ帳を見る" icon="star" onPress={() => router.replace('/stamps')} testID="to-stamps" />
          <Button label="友だちにおしらせする" icon="heart-outline" variant="soft" onPress={share} testID="share" />
          <Button label="ホームにもどる" variant="ghost" size="md" onPress={() => router.replace('/home')} testID="to-home" />
        </View>
      }
    >
      <Confetti />
      <View style={styles.head}>
        <View style={styles.allDone}>
          <Ionicons name="checkmark" size={16} color={colors.green} />
          <Text variant="bodyBold" size={14} color={colors.green} testID="all-done">{progress.done} / {progress.total} ぜんぶ達成</Text>
        </View>
        <Text variant="display" size={38} color={colors.blue} style={styles.big}>TODAY{'\n'}COMPLETE!</Text>
        <Text variant="title" size={20}>今日のクエスト クリア！</Text>
      </View>

      <Card style={styles.stampCard}>
        <View style={styles.stampBox}>
          <Animated.View style={{ opacity: thump, transform: [{ scale: thump.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }, { rotate: thump.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '-6deg'] }) }] }}>
            <Stamp type={stamp.stamp_type} size={190} />
          </Animated.View>
          <Text variant="heading" size={17} color={meta.color} testID="stamp-earned">
            {stamp.stamp_type === 'normal' ? '本日のハンコ 獲得！' : `本日のハンコ ＋ ${meta.name}ハンコ獲得！`}
          </Text>
        </View>
      </Card>

      <View style={styles.streakRow}>
        <Text variant="num" size={44} color={colors.blue} testID="streak-count">{streak}</Text>
        <Text variant="bodyBold" size={16} style={styles.streakLabel}>日連続達成!</Text>
        <View style={styles.weekDots}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} style={[styles.weekDot, i < week && styles.weekDotOn, i === week - 1 && styles.weekDotToday]}>
              {i < week ? <Ionicons name="checkmark" size={14} color={i === week - 1 ? colors.white : colors.blue} /> : null}
            </View>
          ))}
        </View>
      </View>

      <Card style={styles.nextCard}>
        <Stamp type={next.type} size={46} locked />
        <View style={styles.grow}>
          <Text variant="bodyBold" size={15}>つぎは {next.streak}日連続で {STAMP_META[next.type].name}ハンコ</Text>
          <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, (streak / next.streak) * 100)}%`, backgroundColor: STAMP_META[next.type].color }]} /></View>
        </View>
        <Text variant="caption" size={13}>あと{next.remaining}日</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  head: { alignItems: 'center', gap: 6, paddingTop: 6 },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  big: { textAlign: 'center', lineHeight: 46 },
  stampCard: { borderRadius: radius.xl, alignItems: 'center', paddingVertical: 20, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.yellowBorder },
  stampBox: { alignItems: 'center', gap: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  streakLabel: { flexShrink: 0 },
  weekDots: { flexDirection: 'row', gap: 6, marginLeft: 'auto' },
  weekDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  weekDotOn: { backgroundColor: colors.blueSoft },
  weekDotToday: { backgroundColor: colors.blue, borderWidth: 2, borderColor: colors.blueBorder },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1, gap: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EFE7D2', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  footer: { gap: 4 },
});
