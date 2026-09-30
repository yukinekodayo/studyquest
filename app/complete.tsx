import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Easing, Share, StyleSheet, View } from 'react-native';
import { claimStamp } from '@/api/stats';
import { mustProgress } from '@/domain/quest';
import { nextBigMilestone, STAMP_META } from '@/domain/stamps';
import { useStats, useTodayTasks } from '@/features/hooks';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Confetti } from '@/ui/Confetti';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

/** 1日の完全達成画面: 今日のクエスト COMPLETE! → ハンコは自分で押す */
export default function CompleteScreen() {
  const router = useRouter();
  const toast = useToast();
  const run = useRun();
  const qc = useQueryClient();
  const stats = useStats();
  const tasks = useTodayTasks();
  const thump = useRef(new Animated.Value(0)).current;
  const [justPressed, setJustPressed] = useState(false);

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

  const press = async () => {
    const r = await run(() => claimStamp());
    if (!r) return;
    setJustPressed(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    thump.setValue(0);
    Animated.timing(thump, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2)), useNativeDriver: true }).start();
    await qc.invalidateQueries();
  };

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
          {claimed ? (
            <>
              <Button label="ハンコ帳を見る" icon="star" onPress={() => router.dismissTo('/stamps')} testID="to-stamps" />
              <Button label="友だちにおしらせする" icon="heart-outline" variant="soft" onPress={share} testID="share" />
            </>
          ) : (
            <Button label="ハンコを押す" icon="ribbon" onPress={press} testID="press-stamp" />
          )}
          <Button label={claimed ? 'ホームにもどる' : 'あとで押す'} variant="ghost" size="md" onPress={() => router.dismissTo('/home')} testID="to-home" />
        </View>
      }
    >
      {justPressed ? <Confetti /> : null}
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
          {claimed ? (
            <>
              <Animated.View
                style={justPressed ? { opacity: thump, transform: [{ scale: thump.interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] }) }, { rotate: thump.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '-6deg'] }) }] } : undefined}
                testID="stamp-pressed"
              >
                <Stamp type={type} size={190} />
              </Animated.View>
              <Text variant="heading" size={17} color={meta.color} testID="stamp-earned">
                {type === 'normal' ? '本日のハンコ 獲得！' : `本日のハンコ ＋ ${meta.name}ハンコ獲得！`}
              </Text>
            </>
          ) : (
            <>
              <Stamp type={type} size={190} locked />
              <Text variant="heading" size={17} color={colors.inkSoft} testID="stamp-pending">
                {type === 'normal' ? '今日のハンコを押そう！' : `${meta.name}ハンコを押そう！（${streak}日連続）`}
              </Text>
            </>
          )}
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
