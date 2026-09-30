import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { finishSession, pauseSession, resumeSession } from '@/api/sessions';
import { mustProgress } from '@/domain/quest';
import { clockOffsetMs, elapsedSeconds, type SessionState } from '@/domain/timer';
import type { CompleteTaskResult, TaskRow } from '@/types/database';
import { Mascot } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';
import { keys } from '../hooks';
import { useNow } from '../useNow';
import { TimerRing } from './TimerRing';

interface Props {
  task: TaskRow;
  session: SessionState;
  offset: number;
  tasks: TaskRow[];
  onFinished: (result: CompleteTaskResult) => void;
  onBack: () => void;
}

export function TimerView({ task, session, offset, tasks, onFinished, onBack }: Props) {
  const run = useRun();
  const qc = useQueryClient();
  const router = useRouter();
  const running = session.status === 'running';
  const now = useNow(500, running);
  const elapsed = elapsedSeconds(session, now, offset);
  const planned = task.planned_minutes * 60;
  const over = elapsed >= planned;

  // 予定時間に達した瞬間に1回だけ振動
  const notified = useRef(false);
  useEffect(() => {
    if (running && over && !notified.current) {
      notified.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  }, [running, over]);

  const progress = mustProgress(tasks);
  const isMust = task.kind === 'must';
  const afterDone = isMust ? progress.done + 1 : progress.done;
  const lastOne = isMust && progress.remaining === 1;

  const message = over
    ? '予定の時間になったよ！「終了」で完了にしよう'
    : !running
      ? '一時停止中。準備ができたら再開しよう'
      : lastOne
        ? '最後の1つ！ラストいこう'
        : elapsed >= planned / 2
          ? 'いい調子！このまま進もう'
          : '集中していこう！';

  const applySession = (s: SessionState) => {
    qc.setQueryData(keys.session(task.id), { session: s, offset: clockOffsetMs(s.server_now, Date.now()) });
  };

  const togglePause = async () => {
    const s = await run(() => (running ? pauseSession(session.id) : resumeSession(session.id)));
    if (s) applySession(s);
  };
  const finish = async () => {
    const result = await run(() => finishSession(session.id, true));
    if (result) onFinished(result);
  };
  const quit = async () => {
    const r = await run(() => finishSession(session.id, false));
    if (r) {
      await qc.invalidateQueries();
      router.dismissTo('/quest');
    }
  };

  return (
    <Screen
      scroll={false}
      contentStyle={styles.content}
      footer={
        <Card style={styles.footerCard} testID="timer-footer">
          {isMust ? (
            <>
              <Text variant="bodyBold" size={15}>
                {lastOne ? `これを終えると ${afterDone}/${progress.total} → 今日のハンコ！` : `これを終えると ${afterDone}/${progress.total}（あと${progress.total - afterDone}つ）`}
              </Text>
              <ProgressSegments total={progress.total} done={afterDone} />
            </>
          ) : (
            <Text variant="bodyBold" size={15}>ボーナス：終えるとXPがもらえるよ</Text>
          )}
        </Card>
      }
    >
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="timer-back">
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text variant="bodyBold" size={14} color={colors.inkSoft}>今日のクエスト {progress.done}/{progress.total}</Text>
      </View>

      <View style={styles.titleRow}>
        <Text variant="title" testID="timer-title">{task.title}</Text>
        <Text variant="bodyBold" size={14} color={colors.inkSoft}>目安 {task.planned_minutes}分</Text>
      </View>

      <View style={styles.mascotRow}>
        <Mascot size={64} />
        <View style={styles.bubble}><Text variant="bodyBold" size={15} color={colors.blue}>{message}</Text></View>
      </View>

      <TimerRing plannedMinutes={task.planned_minutes} elapsed={elapsed} paused={!running} />

      <View style={styles.buttons}>
        <Button label={running ? '一時停止' : '再開'} icon={running ? 'pause' : 'play'} variant="soft" onPress={togglePause} style={styles.btn} testID="timer-pause" />
        <Button label="終了" icon="stop" onPress={finish} style={styles.btn} testID="timer-finish" />
      </View>
      <Text variant="caption" align="center">「終了」で{task.title}を完了にします</Text>
      <Pressable onPress={quit} style={styles.quit} accessibilityRole="button" testID="timer-quit">
        <Text variant="caption" color={colors.inkSoft} style={styles.underline}>完了にせずタイマーをやめる</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  mascotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center' },
  bubble: { flexShrink: 1, backgroundColor: colors.blueSoft, borderRadius: radius.lg, paddingVertical: 10, paddingHorizontal: 14 },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1 },
  quit: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  footerCard: { gap: 8 },
});
