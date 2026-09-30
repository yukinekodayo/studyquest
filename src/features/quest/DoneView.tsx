import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { uncompleteTask } from '@/api/tasks';
import { mustProgress, pickNextTask } from '@/domain/quest';
import { STAMP_META, stampForStreak, streakIfClearedToday } from '@/domain/stamps';
import type { CompleteTaskResult, MyStats, TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Confetti } from '@/ui/Confetti';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';
import { useStartTask } from '../actions';
import { TaskMark } from '../TaskParts';

interface Props {
  task: TaskRow;
  tasks: TaskRow[];
  stats: MyStats | undefined;
  result: CompleteTaskResult | null;
}

/** 「数学 完了！」画面。次のタスクへワンタップで進める */
export function DoneView({ task, tasks, stats, result }: Props) {
  const router = useRouter();
  const run = useRun();
  const qc = useQueryClient();
  const startTask = useStartTask();
  const progress = mustProgress(tasks);
  const next = pickNextTask(tasks, task.id);
  const xp = result?.xp_gained ?? task.xp_awarded;
  const must = tasks.filter((t) => t.kind === 'must');
  const rewardStreak = streakIfClearedToday(stats?.current_streak ?? 0);
  const rewardStamp = stampForStreak(rewardStreak);
  const fresh = !!result;

  const undo = async () => {
    const ok = await run(async () => {
      await uncompleteTask(task.id);
      return true;
    });
    if (ok) {
      await qc.invalidateQueries();
      router.replace('/quest');
    }
  };

  return (
    <Screen
      scroll
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {next ? (
            <Button label={`次のタスクへ：${next.title}（${next.planned_minutes}分）`} icon="chevron-forward" onPress={() => startTask(next.id, { replace: true })} testID="next-task" />
          ) : progress.cleared ? (
            <Button label="今日のハンコを見る" icon="ribbon" onPress={() => router.replace('/complete')} testID="to-complete" />
          ) : (
            <Button label="今日のやることを見る" onPress={() => router.replace('/quest')} />
          )}
          {next || progress.cleared ? <Button label="今日のやることを見る" variant="ghost" size="md" onPress={() => router.replace('/quest')} testID="to-quest" /> : null}
        </View>
      }
    >
      {fresh ? <Confetti /> : null}
      <View style={styles.hero}>
        <View style={styles.bigCheck}><Ionicons name="checkmark" size={56} color={colors.white} /></View>
        <Text variant="display" testID="done-title">{task.title} 完了！</Text>
        <Text variant="body" color={colors.inkSoft}>{task.planned_minutes}分の集中、おつかれさま</Text>
        <View style={styles.xpRow}>
          <Ionicons name="star" size={20} color={colors.orange} />
          <Text variant="num" size={24} color="#B7791F" testID="xp-gained">+{xp} XP</Text>
          {stats ? (
            <View style={styles.levelWrap}>
              <View style={styles.levelLabels}>
                <Text variant="caption" size={11}>Lv.{stats.level}</Text>
                <Text variant="caption" size={11}>{stats.xp_in_level} / {stats.xp_per_level}</Text>
              </View>
              <View style={styles.levelTrack}><View style={[styles.levelFill, { width: `${Math.min(100, (stats.xp_in_level / stats.xp_per_level) * 100)}%` }]} /></View>
            </View>
          ) : null}
        </View>
      </View>

      {task.kind === 'must' ? (
        <Card style={styles.progressCard}>
          <View style={styles.progressHead}>
            <Text variant="heading" size={16}>今日の進捗</Text>
            <Text variant="num" size={30} color={colors.blue} testID="done-progress">{progress.done}<Text variant="bodyBold" size={15} color={colors.inkSoft}> / {progress.total}</Text></Text>
          </View>
          <View style={styles.stampRow}>
            {must.map((t) => (
              <View key={t.id} style={styles.stampCol}>
                <TaskMark task={t} size={44} />
                <Text variant="caption" size={11} numberOfLines={1} color={t.status === 'done' ? colors.ink : colors.inkFaint}>{t.title}</Text>
              </View>
            ))}
          </View>
          {!progress.cleared ? (
            <View style={styles.tease}>
              <Stamp type={rewardStamp} size={36} />
              <Text variant="bodyBold" size={14} style={styles.grow}>
                あと{progress.remaining}つで、今日のハンコがもらえる！
                {rewardStamp !== 'normal' ? `（${STAMP_META[rewardStamp].name}ハンコ）` : ''}
              </Text>
            </View>
          ) : (
            <View style={styles.tease}>
              <Ionicons name="ribbon" size={26} color={colors.red} />
              <Text variant="bodyBold" size={14} style={styles.grow}>今日のクエスト、ぜんぶクリア！</Text>
            </View>
          )}
        </Card>
      ) : (
        <Card tone="blue"><Text variant="bodyBold" align="center">ボーナスもクリア！XPをゲットしたよ</Text></Card>
      )}

      <Button label="未完了にもどす" variant="ghost" size="sm" onPress={undo} testID="undo-done" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  hero: { alignItems: 'center', gap: 6, paddingTop: 24 },
  bigCheck: { width: 108, height: 108, borderRadius: 54, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 6, borderBottomColor: '#1F7A44', marginBottom: 14 },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  levelWrap: { width: 130, marginLeft: 8, gap: 2 },
  levelLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  levelTrack: { height: 8, borderRadius: 4, backgroundColor: '#EFE7D2', overflow: 'hidden' },
  levelFill: { height: 8, borderRadius: 4, backgroundColor: colors.orange },
  progressCard: { gap: 14, borderRadius: radius.xl },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stampRow: { flexDirection: 'row', justifyContent: 'space-around', gap: 8 },
  stampCol: { alignItems: 'center', gap: 4, flex: 1 },
  tease: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.yellowSoft, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.yellowBorder, borderRadius: radius.md, padding: 10 },
  grow: { flex: 1 },
  footer: { gap: 4 },
});
