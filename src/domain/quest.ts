import type { TaskRow } from '@/types/database';

type TaskLike = Pick<TaskRow, 'id' | 'kind' | 'status' | 'planned_minutes'>;

export interface QuestProgress {
  total: number;
  done: number;
  remaining: number;
  /** 「絶対やる」が1つ以上あり、すべて完了 */
  cleared: boolean;
}

/** 達成対象(絶対やる)の進み具合 */
export function mustProgress(tasks: readonly TaskLike[]): QuestProgress {
  const must = tasks.filter((t) => t.kind === 'must');
  const done = must.filter((t) => t.status === 'done').length;
  return { total: must.length, done, remaining: must.length - done, cleared: must.length > 0 && done === must.length };
}

/** 合計予定時間(分)。達成対象のみ */
export function totalPlannedMinutes(tasks: readonly TaskLike[]): number {
  return tasks.filter((t) => t.kind === 'must').reduce((sum, t) => sum + t.planned_minutes, 0);
}

/**
 * 次にやるタスク: 勉強中のもの → 未完了の「絶対やる」(並び順) → 未完了の「できたらやる」。
 * excludeId は、いま終えたタスクを除くために使う。
 */
export function pickNextTask<T extends TaskLike>(tasks: readonly T[], excludeId?: string): T | undefined {
  const open = tasks.filter((t) => t.status !== 'done' && t.id !== excludeId);
  return (
    open.find((t) => t.status === 'doing') ??
    open.find((t) => t.kind === 'must') ??
    open.find((t) => t.kind === 'bonus')
  );
}

/** 並び替え: 同じ種類の中で1つ上/下へ移動した後の全体のID順。端なら null */
export function moveWithinKind<T extends Pick<TaskRow, 'id' | 'kind'>>(tasks: readonly T[], id: string, dir: -1 | 1): string[] | null {
  const idx = tasks.findIndex((t) => t.id === id);
  const self = tasks[idx];
  if (!self) return null;
  let swap = idx + dir;
  while (swap >= 0 && swap < tasks.length && tasks[swap]?.kind !== self.kind) swap += dir;
  if (swap < 0 || swap >= tasks.length) return null;
  const ids = tasks.map((t) => t.id);
  const a = ids[idx] as string;
  ids[idx] = ids[swap] as string;
  ids[swap] = a;
  return ids;
}
