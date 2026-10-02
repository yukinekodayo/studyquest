import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { completeTask } from '@/api/tasks';
import type { CompleteTaskResult, TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors } from '@/ui/theme';
import { useStartTask } from '../actions';

/** まだタイマーが動いていないタスク(直接開いたとき) */
export function ReadyView({ task, onManualDone }: { task: TaskRow; onManualDone: (r: CompleteTaskResult) => void }) {
  const router = useRouter();
  const run = useRun();
  const qc = useQueryClient();
  const startTask = useStartTask();

  const manual = async () => {
    const r = await run(() => completeTask(task.id));
    if (r) {
      await qc.invalidateQueries();
      onManualDone(r);
    }
  };

  return (
    <Screen
      scroll={false}
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button label="タイマーをスタート" icon="play" onPress={() => startTask(task.id, { replace: true })} testID="ready-start" />
          <Button label="タイマーを使わずに完了にする" variant="soft" size="md" onPress={manual} testID="manual-complete" />
          <Button label="もどる" variant="ghost" size="md" onPress={() => (router.canGoBack() ? router.back() : router.dismissTo('/quest'))} />
        </View>
      }
    >
      <View style={styles.center}>
        <Text variant="display" testID="ready-title">{task.title}</Text>
        <Text variant="body" color={colors.inkSoft}>目安 {task.planned_minutes}分</Text>
        <Text variant="caption" align="center">スタートすると、友だちに「勉強中」と表示されます</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 10 },
  footer: { gap: 4 },
});
