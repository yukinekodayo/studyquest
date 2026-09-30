import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { startSession } from '@/api/sessions';
import { useRun } from '@/ui/Toast';

/**
 * タスクを開始してタイマー画面へ(ホーム/クエストからワンタップ)。
 * 完了画面から次のタスクへ進むときは replace: true で、履歴に画面を積み上げない。
 */
export function useStartTask() {
  const run = useRun();
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(
    async (taskId: string, options?: { replace?: boolean }) => {
      const session = await run(() => startSession(taskId));
      if (!session) return;
      await qc.invalidateQueries();
      if (options?.replace) router.replace(`/quest/${taskId}`);
      else router.push(`/quest/${taskId}`);
    },
    [run, qc, router],
  );
}
