import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { stampTask, uncompleteTask } from '@/api/tasks';
import { mustProgress, pickNextTask } from '@/domain/quest';
import { comboMessage } from '@/domain/messages';
import { STAMP_META, stampForStreak, streakIfClearedToday } from '@/domain/stamps';
import { haptic } from '@/lib/haptics';
import type { CompleteTaskResult, MyStats, TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PressableStamp } from '@/ui/PressableStamp';
import { AchievementBanners, LevelUpBanner } from '@/ui/RewardBanners';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius, themed } from '@/ui/theme';
import { useStartTask } from '../actions';
import { TaskMark } from '../TaskParts';

interface Props {
  task: TaskRow;
  tasks: TaskRow[];
  stats: MyStats | undefined;
  result: CompleteTaskResult | null;
}

/** 「数学 完了」画面。「済」ハンコは自分でタップして押す。押したら次のタスクへ */
export function DoneView({ task, tasks, stats, result }: Props) {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const startTask = useStartTask();
  const progress = mustProgress(tasks);
  const next = pickNextTask(tasks, task.id);
  const xp = result?.xp_gained ?? task.xp_awarded;
  const must = tasks.filter((t) => t.kind === 'must');
  const rewardStreak = streakIfClearedToday(stats?.current_streak ?? 0);
  const rewardStamp = stampForStreak(rewardStreak);
  const fresh = !!result;
  const stamped = !!task.stamped_at;
  const [pressed, setPressed] = useState(false);
  const dayClaimed = !!stats?.today_stamp_claimed;
  const [stampAch, setStampAch] = useState<string[]>([]);
  const doneToday = tasks.filter((t) => t.status === 'done').length;
  const levelUp = fresh && (result?.level_after ?? 0) > (result?.level_before ?? 0) ? (result?.level_after ?? 0) : null;
  const newCodes = [...(result?.new_achievements ?? []), ...stampAch];

  // XP が数え上がる(完了した直後だけ)
  const xpAnim = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  const [shownXp, setShownXp] = useState(fresh ? 0 : xp);
  useEffect(() => {
    if (!fresh) return;
    const id = xpAnim.addListener(({ value }) => setShownXp(Math.round(value * xp)));
    Animated.timing(xpAnim, { toValue: 1, duration: 900, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => xpAnim.removeListener(id);
  }, [fresh, xpAnim, xp]);

  const levelFrom = stats ? Math.max(0, (stats.xp_in_level - xp) / stats.xp_per_level) : 0;
  const levelTo = stats ? stats.xp_in_level / stats.xp_per_level : 0;

  const press = async (): Promise<boolean> => {
    try {
      const r = await stampTask(task.id);
      if (r.new_achievements?.length) setStampAch(r.new_achievements);
      // 演出の邪魔にならないよう、少し待ってから最新化
      setTimeout(() => void qc.invalidateQueries(), 900);
      return true;
    } catch (e) {
      haptic.error();
      toast.showError(e);
      return false;
    }
  };

  const undo = async () => {
    const ok = await run(async () => {
      await uncompleteTask(task.id);
      return true;
    });
    if (ok) {
      await qc.invalidateQueries();
      router.dismissTo('/quest');
    }
  };

  const goComplete = progress.cleared && !dayClaimed;

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {goComplete ? (
            <Button label="今日のハンコを押しに行く" icon="ribbon" onPress={() => router.replace('/complete')} testID="to-complete" />
          ) : next ? (
            <Button label={`次のタスクへ：${next.title}（${next.planned_minutes}分）`} icon="chevron-forward" onPress={() => startTask(next.id, { replace: true })} testID="next-task" />
          ) : (
            <Button label="今日のやることを見る" onPress={() => router.dismissTo('/quest')} testID="to-quest-primary" />
          )}
          {goComplete && next ? (
            <Button label={`次のタスクへ：${next.title}`} variant="soft" size="md" onPress={() => startTask(next.id, { replace: true })} testID="next-task" />
          ) : null}
          {next || goComplete ? <Button label="今日のやることを見る" variant="ghost" size="md" onPress={() => router.dismissTo('/quest')} testID="to-quest" /> : null}
        </View>
      }
    >
      <View style={styles.hero}>
        <PressableStamp type="normal" size={160} claimed={stamped} onPress={press} onStamped={() => setPressed(true)} />
        {!stamped && !pressed ? (
          <Text variant="bodyBold" size={15} color={colors.blue} testID="stamp-pending">タップして「済」を押す</Text>
        ) : null}
        <Text variant="display" size={30} testID="done-title" style={styles.doneTitle}>{task.title}　完了</Text>
        <Text variant="body" color={colors.inkSoft}>{task.planned_minutes}分の学習を記録しました</Text>
        {fresh ? <Text variant="bodyBold" size={14} color={colors.blue} testID="combo-message">{comboMessage(doneToday, progress.remaining)}</Text> : null}
        <View style={styles.xpRow}>
          <Text variant="num" size={26} color={colors.blue} testID="xp-gained">+{shownXp}<Text variant="bodyBold" size={14} color={colors.blue}> XP</Text></Text>
          {stats ? (
            <View style={styles.levelWrap}>
              <View style={styles.levelLabels}>
                <Text variant="caption" size={11}>Lv.{stats.level}</Text>
                <Text variant="caption" size={11}>{stats.xp_in_level} / {stats.xp_per_level}</Text>
              </View>
              <View style={styles.levelTrack}>
                <Animated.View style={[styles.levelFill, { width: xpAnim.interpolate({ inputRange: [0, 1], outputRange: [`${levelFrom * 100}%`, `${Math.min(100, levelTo * 100)}%`] }) }]} />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {levelUp ? <LevelUpBanner level={levelUp} /> : null}
      <AchievementBanners codes={newCodes} />

      {task.kind === 'must' ? (
        <Card style={styles.progressCard}>
          <View style={styles.progressHead}>
            <Text variant="heading" size={16}>今日の進捗</Text>
            <Text variant="num" size={30} color={colors.blue} testID="done-progress">{progress.done}<Text variant="numMedium" size={16} color={colors.inkSoft}> / {progress.total}</Text></Text>
          </View>
          <View style={styles.stampRow}>
            {must.map((t) => (
              <View key={t.id} style={styles.stampCol}>
                <TaskMark task={t.id === task.id && (stamped || pressed) ? { ...t, stamped_at: t.stamped_at ?? 'now' } : t} size={46} showInitial />
                <Text variant="caption" size={11} numberOfLines={1} color={t.status === 'done' ? colors.ink : colors.inkFaint}>{t.title}</Text>
              </View>
            ))}
          </View>
          <View style={styles.tease}>
            {!progress.cleared && stats?.cleared_today ? (
              <Text variant="bodyBold" size={14} style={styles.grow}>今日のクエストはもうクリアずみです</Text>
            ) : !progress.cleared ? (
              <>
                <Stamp type={rewardStamp} size={34} />
                <Text variant="bodyBold" size={14} style={styles.grow}>
                  あと{progress.remaining}つで、今日のハンコがもらえます
                  {rewardStamp !== 'normal' ? `（${STAMP_META[rewardStamp].name}ハンコ）` : ''}
                </Text>
              </>
            ) : (
              <>
                <Stamp type="normal" size={34} />
                <Text variant="bodyBold" size={14} style={styles.grow}>今日のクエスト、ぜんぶクリアしました</Text>
              </>
            )}
          </View>
        </Card>
      ) : (
        <Card tone="blue"><Text variant="bodyBold" align="center">ボーナスもクリア。XPを獲得しました</Text></Card>
      )}

      <Button label="未完了にもどす" variant="ghost" size="sm" onPress={undo} testID="undo-done" />
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  content: { gap: 18 },
  hero: { alignItems: 'center', gap: 4, paddingTop: 4 },
  doneTitle: { marginTop: 10 },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  levelWrap: { width: 150, gap: 3 },
  levelLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  levelTrack: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  levelFill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
  progressCard: { gap: 16, borderRadius: radius.lg },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stampRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 8 },
  stampCol: { alignItems: 'center', gap: 6, flex: 1 },
  tease: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 14 },
  grow: { flex: 1 },
  footer: { gap: 4 },
}));
