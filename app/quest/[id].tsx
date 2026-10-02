import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { DoneView } from '@/features/quest/DoneView';
import { ReadyView } from '@/features/quest/ReadyView';
import { TimerView } from '@/features/quest/TimerView';
import { useStats, useTask, useTaskSession, useTodayTasks } from '@/features/hooks';
import type { CompleteTaskResult } from '@/types/database';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { ErrorState, LoadingState } from '@/ui/States';

/** /quest/[id] : タスク詳細。状態(未着手 / 勉強中 / 完了)で表示が変わる */
export default function QuestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const task = useTask(id);
  const tasks = useTodayTasks();
  const session = useTaskSession(id);
  const stats = useStats();
  const [result, setResult] = useState<CompleteTaskResult | null>(null);

  const leave = () => (router.canGoBack() ? router.back() : router.dismissTo('/quest'));

  if (task.isLoading || tasks.isLoading || session.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (task.isError || tasks.isError || !tasks.data) {
    return <Screen scroll={false}><ErrorState error={task.error ?? tasks.error} onRetry={() => { void task.refetch(); void tasks.refetch(); }} /></Screen>;
  }
  if (!task.data) {
    return (
      <Screen scroll={false}>
        <ErrorState message="このタスクは見つからなかったよ。もう消えたのかも" />
        <Button label="今日のやることへ" variant="soft" onPress={() => router.dismissTo('/quest')} />
      </Screen>
    );
  }

  const handleResult = async (r: CompleteTaskResult) => {
    setResult(r);
    await qc.invalidateQueries();
  };

  if (task.data.status === 'done') {
    return <DoneView task={task.data} tasks={tasks.data} stats={stats.data} result={result} />;
  }
  const s = session.data?.session;
  if (s && s.status !== 'finished') {
    return <TimerView task={task.data} session={s} offset={session.data?.offset ?? 0} tasks={tasks.data} onFinished={handleResult} onBack={leave} />;
  }
  return <ReadyView task={task.data} onManualDone={handleResult} />;
}
