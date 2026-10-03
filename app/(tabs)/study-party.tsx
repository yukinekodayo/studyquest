import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { joinStudyParty } from '@/api/party';
import { formatClock } from '@/domain/timer';
import { FriendsTabs } from '@/features/FriendsTabs';
import { usePartyRooms, useRefetchOnFocus, useTodayTasks } from '@/features/hooks';
import { useNow } from '@/features/useNow';
import { haptic } from '@/lib/haptics';
import type { PartyRoom } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, themed } from '@/ui/theme';

const norm = (s: string) => s.trim().toLowerCase();

/** 一緒に勉強する(スタディパーティー): 同じ教科を勉強中の友だちが見える */
export default function StudyPartyScreen() {
  const router = useRouter();
  const run = useRun();
  const qc = useQueryClient();
  const rooms = usePartyRooms();
  const tasks = useTodayTasks();
  const [selected, setSelected] = useState<string | null>(null);
  const fetchedAt = useRef(Date.now());
  const now = useNow(1000);
  useRefetchOnFocus(() => { void rooms.refetch(); });
  useEffect(() => { fetchedAt.current = Date.now(); }, [rooms.dataUpdatedAt]);

  const header = (
    <>
      <View style={styles.headerRow}>
        <Text variant="display" size={32}>フレンド</Text>
      </View>
      <FriendsTabs active="party" />
    </>
  );

  if (rooms.isLoading) return <Screen withNav>{header}<LoadingState /></Screen>;
  if (rooms.isError || !rooms.data) return <Screen withNav>{header}<ErrorState error={rooms.error} onRetry={() => void rooms.refetch()} /></Screen>;

  const list = rooms.data;
  const room: PartyRoom | undefined = list.find((r) => norm(r.subject) === selected) ?? list[0];
  const others = list.filter((r) => r !== room);
  const sinceFetch = Math.max(0, Math.floor((now - fetchedAt.current) / 1000));
  const iAmIn = !!room?.members.some((m) => m.is_me);
  const myTask = room ? (tasks.data ?? []).find((t) => norm(t.title) === norm(room.subject) && t.status !== 'done') : undefined;
  const myActiveTask = (tasks.data ?? []).find((t) => t.status === 'doing');

  const join = async () => {
    if (!room) return;
    const r = await run(() => joinStudyParty(room.subject));
    if (r) {
      haptic.success();
      await qc.invalidateQueries();
      router.push(`/quest/${r.task_id}`);
    }
  };

  return (
    <Screen withNav onRefresh={() => void rooms.refetch()} refreshing={rooms.isRefetching}>
      {header}
      {!room ? (
        <Card>
          <EmptyState
            title="いま勉強中の友だちはいません"
            body="タスクをスタートすると、あなたが勉強中なのが友だちに見えます。友だちも来てくれるかもしれません"
            action={<Button label="クエストをはじめる" icon="play" onPress={() => router.push('/quest')} />}
          />
        </Card>
      ) : (
        <FadeIn index={0}>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text variant="label" color={colors.red} style={styles.liveText}>LIVE ・ スタディパーティー</Text>
          </View>
          <Text variant="display" size={44} testID="party-subject" style={styles.subject}>{room.subject}</Text>
          <Text variant="body" color={colors.inkSoft}>{room.count}人が、いま同じ時間に勉強しています</Text>

          <View style={styles.members}>
            {room.members.map((m) => (
              <View key={m.user_id} style={styles.member} testID={`party-member-${m.nickname}`}>
                <View style={styles.memberRing}><Avatar name={m.nickname} color={m.avatar} size={64} solid={m.is_me} /></View>
                <Text variant="bodyBold" size={14}>{m.is_me ? `${m.nickname}(あなた)` : m.nickname}</Text>
                <Text variant="num" size={18} color={colors.blue} style={styles.clock}>{formatClock(m.elapsed_seconds + sinceFetch)}</Text>
              </View>
            ))}
            {!iAmIn ? (
              <View style={styles.member}>
                <View style={styles.empty}><Ionicons name="add" size={28} color={colors.inkFaint} /></View>
                <Text variant="bodyBold" size={14} color={colors.inkSoft}>あなた</Text>
                <Text variant="num" size={18} color={colors.inkFaint}>--:--</Text>
              </View>
            ) : null}
          </View>

          {iAmIn ? (
            <Button label="タイマーにもどる" icon="timer-outline" onPress={() => myActiveTask && router.push(`/quest/${myActiveTask.id}`)} testID="party-back-to-timer" />
          ) : (
            <>
              <Card style={styles.planCard}>
                <View style={styles.grow}>
                  <Text variant="caption">あなたの予定から参加</Text>
                  <Text variant="heading" size={18}>{myTask ? `${myTask.title}（${myTask.planned_minutes}分）` : `${room.subject}（20分・ボーナス）`}</Text>
                </View>
              </Card>
              <Button label="一緒にやる" icon="play" onPress={join} testID="party-join" />
            </>
          )}
        </FadeIn>
      )}

      {others.length > 0 ? (
        <View style={styles.otherRooms}>
          <Text variant="label">ほかのルーム</Text>
          {others.map((r) => (
            <PressableScale key={r.subject} onPress={() => { haptic.select(); setSelected(norm(r.subject)); }} style={styles.otherRow} pressedScale={0.985} accessibilityRole="button" testID={`room-${r.subject}`}>
              <View style={styles.stack}>
                {r.members.slice(0, 3).map((m, i) => (
                  <View key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -12 }}><Avatar name={m.nickname} color={m.avatar} size={34} ring={colors.bg} /></View>
                ))}
              </View>
              <Text variant="bodyBold" size={16} style={styles.grow}>{r.subject}</Text>
              <Text variant="caption">{r.count}人</Text>
              <Text variant="bodyBold" color={colors.blue} size={14}>のぞく ›</Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1, gap: 2 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red },
  liveText: { letterSpacing: 1.5 },
  subject: { marginBottom: 4 },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 18 },
  member: { alignItems: 'center', gap: 4, minWidth: 82 },
  memberRing: { padding: 5, borderRadius: 50, borderWidth: 1.5, borderColor: colors.track },
  empty: { width: 74, height: 74, borderRadius: 37, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  clock: { fontVariant: ['tabular-nums'] },
  planCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  otherRooms: { gap: 6, paddingTop: 8 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: colors.line },
  stack: { flexDirection: 'row', minWidth: 60 },
}));
