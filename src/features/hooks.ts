import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { fetchMyProfile, updateMyProfile } from '@/api/auth';
import { fetchFriendsOverview, fetchIncomingRequests, fetchReceivedReactions } from '@/api/friends';
import { fetchGroupDetail, fetchMyGroups } from '@/api/groups';
import { fetchPartyRooms } from '@/api/party';
import { getSessionState } from '@/api/sessions';
import { fetchStampsBetween, getMyStats } from '@/api/stats';
import { fetchTask, fetchTodayTasks, reorderTasks } from '@/api/tasks';
import { clockOffsetMs } from '@/domain/timer';
import { monthRange } from '@/domain/dates';
import { useAuth } from '@/lib/auth';
import type { TaskRow } from '@/types/database';

export const keys = {
  profile: ['profile'] as const,
  stats: ['stats'] as const,
  todayTasks: ['tasks', 'today'] as const,
  task: (id: string) => ['task', id] as const,
  session: (taskId: string) => ['session', taskId] as const,
  friends: ['friends'] as const,
  requests: ['friend-requests'] as const,
  reactions: ['reactions'] as const,
  party: ['party'] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['group', id] as const,
  stamps: (y: number, m: number) => ['stamps', y, m] as const,
};

export function useProfile() {
  const { userId } = useAuth();
  return useQuery({ queryKey: keys.profile, queryFn: () => fetchMyProfile(userId as string), enabled: !!userId, staleTime: 60_000 });
}

export function useUpdateProfile() {
  const { userId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateMyProfile>[1]) => updateMyProfile(userId as string, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }),
  });
}

export const useStats = () => useQuery({ queryKey: keys.stats, queryFn: getMyStats });
export const useTodayTasks = () => useQuery({ queryKey: keys.todayTasks, queryFn: fetchTodayTasks });
export const useTask = (id: string) => useQuery({ queryKey: keys.task(id), queryFn: () => fetchTask(id), enabled: !!id });

/** セッションと、取得時点でのサーバー時計とのずれ */
export function useTaskSession(taskId: string) {
  return useQuery({
    queryKey: keys.session(taskId),
    queryFn: async () => {
      const before = Date.now();
      const session = await getSessionState(taskId);
      const after = Date.now();
      // 往復の中間を端末時刻とみなして、サーバー時刻とのずれを求める
      const offset = session ? clockOffsetMs(session.server_now, Math.round((before + after) / 2)) : 0;
      return { session, offset };
    },
    enabled: !!taskId,
    staleTime: 0,
  });
}

export const useFriends = () =>
  useQuery({ queryKey: keys.friends, queryFn: fetchFriendsOverview, refetchInterval: 20_000 });
export function useIncomingRequests() {
  const { userId } = useAuth();
  return useQuery({ queryKey: keys.requests, queryFn: () => fetchIncomingRequests(userId as string), enabled: !!userId, refetchInterval: 30_000 });
}
export function useReceivedReactions(today: string | undefined) {
  const { userId } = useAuth();
  return useQuery({
    queryKey: [...keys.reactions, today],
    queryFn: () => fetchReceivedReactions(userId as string, today as string),
    enabled: !!userId && !!today,
    refetchInterval: 30_000,
  });
}
export const usePartyRooms = () => useQuery({ queryKey: keys.party, queryFn: fetchPartyRooms, refetchInterval: 15_000 });
export const useMyGroups = () => useQuery({ queryKey: keys.groups, queryFn: fetchMyGroups, refetchInterval: 30_000 });
export const useGroupDetail = (id: string) =>
  useQuery({ queryKey: keys.group(id), queryFn: () => fetchGroupDetail(id), enabled: !!id, refetchInterval: 30_000 });

export function useMonthStamps(y: number, m: number) {
  const { from, to } = monthRange(y, m);
  return useQuery({ queryKey: keys.stamps(y, m), queryFn: () => fetchStampsBetween(from, to) });
}

/** ゲーム状態(タスク・統計・友だち・グループ)を全部取り直す */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}

/**
 * 画面にフォーカスが戻ったときに1回だけ最新化する。
 * 呼び出し側が毎レンダーで関数を作り直しても再取得ループにならないよう、最新の関数は ref で保持する。
 */
export function useRefetchOnFocus(refetch: () => unknown) {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  });
  useFocusEffect(
    useCallback(() => {
      void latest.current();
    }, []),
  );
}

/** 並び替え: 先に画面を更新(楽観的)し、失敗したら元に戻す */
export function useReorderTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => reorderTasks(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.todayTasks });
      const prev = qc.getQueryData<TaskRow[]>(keys.todayTasks);
      if (prev) {
        const byId = new Map(prev.map((t) => [t.id, t]));
        const ordered = ids.flatMap((id) => (byId.has(id) ? [byId.get(id) as TaskRow] : []));
        qc.setQueryData(keys.todayTasks, ordered);
      }
      return { prev };
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.todayTasks, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.todayTasks }),
  });
}
