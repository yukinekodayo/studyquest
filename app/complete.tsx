import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { claimStamp } from '@/api/stats';
import { mustProgress } from '@/domain/quest';
import { nextBigMilestone, STAMP_META } from '@/domain/stamps';
import { useStats, useTodayTasks } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableStamp } from '@/ui/PressableStamp';
import { AchievementBanners } from '@/ui/RewardBanners';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/Toast';
import { colors } from '@/ui/theme';

/** 1日の完全達成画面: ハンコは自分でタップして押す(押した瞬間に強い振動) */
export default function CompleteScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const stats = useStats();
  const tasks = useTodayTasks();
  const [pressed, setPressed] = useState(false);
  const [newAch, setNewAch] = useState<string[]>([]);

  if (stats.isLoading || tasks.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (stats.isError || !stats.data) {
    return <Screen scroll={false}><ErrorState error={stats.error} onRetry={() => void stats.refetch()} /></Screen>;
  }
  const s = stats.data;
  // まだクリアしていない(URLを直接開いた等)
  if (!s.cleared_today || s.today_streak === null || !s.today_stamp_type) return <Redirect href="/quest" />;

  const streak = s.today_streak;
  const type = s.today_stamp_type;
  const claimed = s.today_stamp_claimed;
  const meta = STAMP_META[type];
  const progress = mustProgress(tasks.data ?? []);
  const week = streak % 7 === 0 ? 7 : streak % 7;
  const next = nextBigMilestone(streak);
  const total = progress.total;

  const press = async (): Promise<boolean> => {
    try {
      const r = await claimStamp();
      if (r.new_achievements?.length) setNewAch(r.new_achievements);
      // 演出の邪魔にならないよう、少し待ってから最新化
      setTimeout(() => void qc.invalidateQueries(), 900);
      return true;
    } catch (e) {
      haptic.error();
      toast.showError(e);
      return false;
    }
  };

  const share = async () => {
    try {
      await Share.share({ message: `StudyQuestで今日のクエストをクリアしました。${streak}日連続です` });
    } catch {
      toast.show('共有できませんでした', 'error');
    }
  };

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {claimed ? (
            <>
              <Button label="ハンコ帳を見る" onPress={() => router.dismissTo('/stamps')} testID="to-stamps" />
              <Button label="友だちに知らせる" icon="share-outline" variant="soft" onPress={share} testID="share" />
              <Button label="ホームにもどる" variant="ghost" size="md" onPress={() => router.dismissTo('/home')} testID="to-home" />
            </>
          ) : (
            <Button label="あとで押す" variant="ghost" size="md" onPress={() => router.dismissTo('/home')} testID="to-home" />
          )}
        </View>
      }
    >
      <FadeIn index={0}>
        <View style={styles.head}>
          <Text variant="label" color={colors.blue} style={styles.eyebrow} testID="all-done">TODAY COMPLETE</Text>
          <Text variant="display" size={30} align="center">今日のクエスト、クリア</Text>
          <Text variant="caption" size={13} align="center">{total > 0 ? `${total}つのタスクをぜんぶ達成しました` : '今日のタスクをぜんぶ達成しました'}</Text>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <View style={styles.halo}>
          <PressableStamp type={type} size={190} claimed={claimed} onPress={press} onStamped={() => setPressed(true)} />
        </View>
        {!claimed && !pressed ? (
          <Text variant="bodyBold" size={16} color={colors.blue} align="center" style={styles.tapHint} testID="stamp-pending">タップして ハンコを押す</Text>
        ) : null}
      </FadeIn>

      <View style={styles.after}>
        {claimed ? (
          <Text variant="title" size={22} align="center" testID="stamp-earned">
            {type === 'normal' ? '今日のハンコを押しました' : `${meta.name}ハンコを獲得しました`}
          </Text>
        ) : pressed ? null : (
          <Text variant="body" color={colors.inkSoft} align="center">
            {type === 'normal' ? 'ハンコを押して、今日を締めくくりましょう' : `${streak}日連続の「${meta.name}ハンコ」がもらえます`}
          </Text>
        )}
        <View style={styles.streakRow}>
          <View style={styles.dots}>
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} style={[styles.dot, i < week && styles.dotOn, i === week - 1 && styles.dotToday]} />
            ))}
          </View>
          <Text variant="bodyBold" color={colors.blue} size={14} testID="streak-count">{streak}日連続</Text>
        </View>
      </View>

      <AchievementBanners codes={newAch} />

      <FadeIn index={2}>
        <Card style={styles.nextCard}>
          <Stamp type={next.type} size={46} locked />
          <View style={styles.grow}>
            <Text variant="bodyBold" size={13}>つぎは{next.streak}日連続で「{STAMP_META[next.type].name}ハンコ」</Text>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.min(100, (streak / next.streak) * 100)}%`, backgroundColor: STAMP_META[next.type].color }]} /></View>
          </View>
          <Text variant="caption" size={12}>あと{next.remaining}日</Text>
        </Card>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 18, alignItems: 'stretch' },
  head: { alignItems: 'center', gap: 8, paddingTop: 12 },
  eyebrow: { letterSpacing: 3 },
  halo: { alignSelf: 'center', width: 280, height: 280, borderRadius: 140, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#1B2240', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  tapHint: { marginTop: -4 },
  after: { alignItems: 'center', gap: 14 },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.track },
  dotOn: { backgroundColor: colors.blue },
  dotToday: { width: 15, height: 15, borderRadius: 8, borderWidth: 3, borderColor: colors.blueBorder },
  nextCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  grow: { flex: 1, gap: 8 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  footer: { gap: 4 },
});
