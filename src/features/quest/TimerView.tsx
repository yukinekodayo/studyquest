import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { finishSession, pauseSession, resumeSession } from '@/api/sessions';
import { mustProgress } from '@/domain/quest';
import { clockOffsetMs, elapsedSeconds, type SessionState } from '@/domain/timer';
import { haptic } from '@/lib/haptics';
import type { CompleteTaskResult, TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, themed } from '@/ui/theme';
import { OPTIMISTIC_SESSION_ID } from '../actions';
import { keys, useStats } from '../hooks';
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
  const stats = useStats();
  const running = session.status === 'running';
  // サーバーに記録中(開始直後)は、一時停止・終了を少しだけ待たせる
  const syncing = session.id === OPTIMISTIC_SESSION_ID;
  const now = useNow(250, running);
  const elapsed = elapsedSeconds(session, now, offset);
  const planned = task.planned_minutes * 60;
  const over = elapsed >= planned;

  // 予定時間に達した瞬間に1回だけ振動
  const notified = useRef(false);
  useEffect(() => {
    if (running && over && !notified.current) {
      notified.current = true;
      haptic.success();
    }
  }, [running, over]);

  const progress = mustProgress(tasks);
  const isMust = task.kind === 'must';
  const afterDone = isMust ? progress.done + 1 : progress.done;
  // 今日すでにクリア済みなら、もう一度ハンコがもらえるような案内は出さない
  const alreadyCleared = !!stats.data?.cleared_today;
  const lastOne = isMust && progress.remaining === 1 && !alreadyCleared;

  const message = over
    ? '予定の時間になりました。「終了」で完了にしましょう'
    : !running
      ? '一時停止中です。準備ができたら再開しましょう'
      : lastOne
        ? '最後の1つです。ラストいきましょう'
        : elapsed >= planned / 2
          ? 'いい調子です。このまま続けましょう'
          : '集中していきましょう';

  const applySession = (s: SessionState) => {
    qc.setQueryData(keys.session(task.id), { session: s, offset: clockOffsetMs(s.server_now, Date.now()) });
  };

  const togglePause = async () => {
    const s = await run(() => (running ? pauseSession(session.id) : resumeSession(session.id)));
    if (s) applySession(s);
  };
  const finish = async () => {
    const result = await run(() => finishSession(session.id, true));
    if (result) {
      haptic.success();
      onFinished(result);
    }
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
          {isMust && !alreadyCleared ? (
            <>
              <Text variant="bodyBold" size={14}>
                {lastOne ? `これを終えると ${afterDone}/${progress.total}（今日のハンコ）` : `これを終えると ${afterDone}/${progress.total}（あと${progress.total - afterDone}つ）`}
              </Text>
              <ProgressSegments total={progress.total} done={afterDone} />
            </>
          ) : (
            <Text variant="bodyBold" size={14}>{isMust ? '今日はもうクリアずみ。終えるとXPがもらえます' : 'ボーナス：終えるとXPがもらえます'}</Text>
          )}
        </Card>
      }
    >
      <View style={styles.topRow}>
        <Pressable onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="timer-back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="caption" size={13}>今日のクエスト <Text variant="bodyBold" size={14}>{progress.done} / {progress.total}</Text></Text>
      </View>

      <View style={styles.titleBlock}>
        <Text variant="display" size={32} testID="timer-title">{task.title}</Text>
        <Text variant="caption" size={13}>目安 {task.planned_minutes}分</Text>
      </View>

      <TimerRing plannedMinutes={task.planned_minutes} elapsed={elapsed} paused={!running} />

      <Text variant="body" color={colors.inkSoft} align="center">{message}</Text>

      <View style={styles.buttons}>
        <Button label={running ? '一時停止' : '再開'} icon={running ? 'pause' : 'play'} variant="soft" onPress={togglePause} disabled={syncing} style={styles.btn} testID="timer-pause" />
        <Button label="終了" icon="stop" onPress={finish} disabled={syncing} style={styles.btn} testID="timer-finish" />
      </View>
      <Text variant="caption" align="center">「終了」で{task.title}を完了にします</Text>
      <Pressable onPress={quit} disabled={syncing} style={styles.quit} accessibilityRole="button" testID="timer-quit">
        <Text variant="caption" color={colors.inkSoft} style={styles.underline}>完了にせずタイマーをやめる</Text>
      </Pressable>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  content: { gap: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  back: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  titleBlock: { alignItems: 'center', gap: 2 },
  buttons: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1 },
  quit: { alignSelf: 'center', minHeight: 40, justifyContent: 'center' },
  underline: { textDecorationLine: 'underline' },
  footerCard: { gap: 10, padding: 16 },
}));
