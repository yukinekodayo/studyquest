import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { startSession } from '@/api/sessions';
import { clockOffsetMs, type SessionState } from '@/domain/timer';
import type { TaskRow } from '@/types/database';
import { useRun } from '@/ui/Toast';
import { keys } from './hooks';

/** サーバー応答を待つ間だけ使う、仮のセッション(id が 'optimistic') */
export const OPTIMISTIC_SESSION_ID = 'optimistic';

/**
 * タスクを開始してタイマー画面へ(ホーム/クエストからワンタップ)。
 * 待たせないよう、先にタイマー画面へ移動し(仮の状態で動き出す)、裏でサーバーに記録する。失敗したら元に戻す。
 * 完了画面から次のタスクへ進むときは replace: true で、履歴に画面を積み上げない。
 */
export function useStartTask() {
  const run = useRun();
  const qc = useQueryClient();
  const router = useRouter();
  return useCallback(
    async (taskId: string, options?: { replace?: boolean }) => {
      const nowIso = new Date().toISOString();
      const optimistic: SessionState = {
        id: OPTIMISTIC_SESSION_ID, task_id: taskId, status: 'running', started_at: nowIso,
        run_started_at: nowIso, accumulated_seconds: 0, actual_seconds: null, server_now: nowIso,
      };
      qc.setQueryData(keys.session(taskId), { session: optimistic, offset: 0 });
      const markDoing = (t: TaskRow): TaskRow => (t.id === taskId ? { ...t, status: 'doing' } : t);
      qc.setQueryData<TaskRow[]>(keys.todayTasks, (prev) => prev?.map(markDoing));
      qc.setQueryData<TaskRow | null>(keys.task(taskId), (prev) => (prev ? markDoing(prev) : prev));

      if (options?.replace) router.replace(`/quest/${taskId}`);
      else router.push(`/quest/${taskId}`);

      const session = await run(() => startSession(taskId));
      if (!session) {
        // 失敗: 仮の状態を捨てて、もとの画面に戻る
        qc.removeQueries({ queryKey: keys.session(taskId) });
        await qc.invalidateQueries();
        if (router.canGoBack()) router.back();
        else router.dismissTo('/quest');
        return;
      }
      qc.setQueryData(keys.session(taskId), { session, offset: clockOffsetMs(session.server_now, Date.now()) });
      await qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
    },
    [run, qc, router],
  );
}
