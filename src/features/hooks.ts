import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { fetchMyProfile, updateMyProfile } from '@/api/auth';
import { fetchFriendsOverview, fetchIncomingRequests, fetchReceivedReactions } from '@/api/friends';
import { fetchGroupDetail, fetchMyGroups } from '@/api/groups';
import { fetchPartyRooms } from '@/api/party';
import { getSessionState } from '@/api/sessions';
import { fetchAdminReports, fetchBlocks, fetchChatUnread, fetchIsAdmin, fetchMessages, type ChatTarget } from '@/api/chat';
import { fetchAchievements, fetchStampsBetween, getMyStats, getStudySummary } from '@/api/stats';
import { fetchTask, fetchTodayTasks, reorderTasks } from '@/api/tasks';
import { clockOffsetMs } from '@/domain/timer';
import { monthRange } from '@/domain/dates';
import { useAuth } from '@/lib/auth';
import type { TaskRow } from '@/types/database';

export const keys = {
  profile: ['profile'] as const,
  stats: ['stats'] as const,
  study: ['study'] as const,
  achievements: ['achievements'] as const,
  chatUnread: ['chat', 'unread'] as const,
  chat: (key: string) => ['chat', 'messages', key] as const,
  blocks: ['chat', 'blocks'] as const,
  isAdmin: ['chat', 'is-admin'] as const,
  adminReports: ['chat', 'admin-reports'] as const,
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
export const useStudySummary = () => useQuery({ queryKey: keys.study, queryFn: getStudySummary });
export const chatKey = (t: ChatTarget): string => (t.group ? `g:${t.group}` : `d:${t.user}`);
/** 開いている間は5秒ごとに新しいメッセージを確認する */
export const useMessages = (t: ChatTarget) =>
  useQuery({ queryKey: keys.chat(chatKey(t)), queryFn: () => fetchMessages(t), refetchInterval: 5_000 });
export const useChatUnread = () => useQuery({ queryKey: keys.chatUnread, queryFn: fetchChatUnread, refetchInterval: 20_000 });
export const useBlocks = () => useQuery({ queryKey: keys.blocks, queryFn: fetchBlocks });
export const useIsAdmin = () => useQuery({ queryKey: keys.isAdmin, queryFn: fetchIsAdmin, staleTime: 5 * 60_000 });
export const useAdminReports = (enabled: boolean) => useQuery({ queryKey: keys.adminReports, queryFn: fetchAdminReports, enabled });
export const useAchievements = () => useQuery({ queryKey: keys.achievements, queryFn: fetchAchievements });
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
    // 開始直後の仮データを、取得し直しで消さないよう少しだけ新鮮扱いにする
    staleTime: 3_000,
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

/** よく開く画面のデータを先に読んでおく(最初のタブ移動を速くする) */
export function usePrefetchTabs() {
  const qc = useQueryClient();
  const { userId } = useAuth();
  useEffect(() => {
    if (!userId) return;
    void qc.prefetchQuery({ queryKey: keys.stats, queryFn: getMyStats });
    void qc.prefetchQuery({ queryKey: keys.todayTasks, queryFn: fetchTodayTasks });
    void qc.prefetchQuery({ queryKey: keys.friends, queryFn: fetchFriendsOverview });
    void qc.prefetchQuery({ queryKey: keys.party, queryFn: fetchPartyRooms });
  }, [qc, userId]);
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
