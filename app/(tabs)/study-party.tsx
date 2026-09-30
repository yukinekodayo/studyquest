import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { joinStudyParty } from '@/api/party';
import { formatClock } from '@/domain/timer';
import { FriendsTabs } from '@/features/FriendsTabs';
import { usePartyRooms, useRefetchOnFocus, useTodayTasks } from '@/features/hooks';
import { useNow } from '@/features/useNow';
import type { PartyRoom } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors } from '@/ui/theme';

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
        <Text variant="title">フレンド</Text>
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
            title="いま勉強中の友だちはいないよ"
            body="タスクをスタートすると、友だちにあなたが勉強中なのが見えるよ。友だちも来てくれるかも！"
            action={<Button label="クエストをはじめる" icon="play" onPress={() => router.push('/quest')} />}
          />
        </Card>
      ) : (
        <>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text variant="bodyBold" size={12} color={colors.red}>LIVE ・ スタディパーティー</Text>
          </View>
          <View style={styles.subjectMark}><Text variant="display" size={34} testID="party-subject">{room.subject}</Text></View>
          <Text variant="body" color={colors.inkSoft}>{room.count}人が、いま同じ時間に机に向かっています</Text>

          <View style={styles.members}>
            {room.members.map((m) => (
              <View key={m.user_id} style={styles.member} testID={`party-member-${m.nickname}`}>
                <View style={styles.memberRing}><Avatar animal={m.avatar} size={72} /></View>
                <Text variant="bodyBold" size={14}>{m.is_me ? `${m.nickname}(あなた)` : m.nickname}</Text>
                <Text variant="num" size={20} color={colors.blue} style={styles.clock}>{formatClock(m.elapsed_seconds + sinceFetch)}</Text>
              </View>
            ))}
            {!iAmIn ? (
              <View style={styles.member}>
                <View style={styles.empty}><Ionicons name="add" size={30} color={colors.inkFaint} /></View>
                <Text variant="bodyBold" size={14} color={colors.inkSoft}>あなた</Text>
                <Text variant="num" size={18} color={colors.inkFaint}>--:--</Text>
              </View>
            ) : null}
          </View>

          {iAmIn ? (
            <Button label="タイマーにもどる" icon="timer-outline" onPress={() => myActiveTask && router.push(`/quest/${myActiveTask.id}`)} testID="party-back-to-timer" />
          ) : (
            <>
              <View style={styles.planRow}>
                <View style={styles.grow}>
                  <Text variant="caption">あなたの予定から</Text>
                  <Text variant="heading" size={18}>{myTask ? `${myTask.title}（${myTask.planned_minutes}分）` : `${room.subject}（20分・ボーナス）`}</Text>
                </View>
              </View>
              <Button label="一緒にやる" icon="play" onPress={join} testID="party-join" />
            </>
          )}
        </>
      )}

      {others.length > 0 ? (
        <View style={styles.otherRooms}>
          <Text variant="label">ほかのルーム</Text>
          {others.map((r) => (
            <Pressable key={r.subject} onPress={() => setSelected(norm(r.subject))} style={styles.otherRow} accessibilityRole="button" testID={`room-${r.subject}`}>
              <View style={styles.stack}>
                {r.members.slice(0, 3).map((m, i) => (
                  <View key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -12 }}><Avatar animal={m.avatar} size={34} ring={colors.white} /></View>
                ))}
              </View>
              <Text variant="bodyBold" size={16} style={styles.grow}>{r.subject}</Text>
              <Text variant="caption">{r.count}人</Text>
              <Text variant="bodyBold" color={colors.blue} size={14}>のぞく ›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grow: { flex: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  subjectMark: { alignSelf: 'flex-start', borderBottomWidth: 10, borderBottomColor: colors.yellow },
  members: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingVertical: 8 },
  member: { alignItems: 'center', gap: 4, minWidth: 84 },
  memberRing: { padding: 6, borderRadius: 50, backgroundColor: colors.blueBorder },
  empty: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.inkFaint, alignItems: 'center', justifyContent: 'center' },
  clock: { fontVariant: ['tabular-nums'] },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  otherRooms: { gap: 8, paddingTop: 8 },
  otherRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderTopWidth: 1, borderTopColor: colors.line, borderStyle: 'dashed' },
  stack: { flexDirection: 'row', minWidth: 60 },
});
