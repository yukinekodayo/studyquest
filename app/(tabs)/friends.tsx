import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { removeFriend, sendReaction } from '@/api/friends';
import { pickNextTask } from '@/domain/quest';
import { AddFriendSheet } from '@/features/AddFriendSheet';
import { FriendsTabs } from '@/features/FriendsTabs';
import { REACTIONS } from '@/features/NotificationsSheet';
import { ProgressStamps } from '@/features/TaskParts';
import { useFriends, usePartyRooms, useRefetchOnFocus, useTodayTasks } from '@/features/hooks';
import type { FriendOverviewRow, ReactionKind } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

export default function FriendsScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const friends = useFriends();
  const rooms = usePartyRooms();
  const myTasks = useTodayTasks();
  const [adding, setAdding] = useState(false);
  const [openReact, setOpenReact] = useState<string | null>(null);
  const [removing, setRemoving] = useState<FriendOverviewRow | null>(null);
  useRefetchOnFocus(() => { void friends.refetch(); void rooms.refetch(); });

  const react = async (to: FriendOverviewRow, kind: ReactionKind) => {
    const ok = await run(async () => {
      await sendReaction(to.user_id, kind);
      return true;
    });
    if (ok) {
      toast.show(`${to.nickname}さんに応援を送ったよ`, 'success');
      setOpenReact(null);
      await qc.invalidateQueries({ queryKey: ['friends'] });
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    const ok = await run(async () => {
      await removeFriend(removing.user_id);
      return true;
    });
    if (ok) {
      setRemoving(null);
      await qc.invalidateQueries();
    }
  };

  const top = (
    <>
      <View style={styles.headerRow}>
        <Text variant="title">フレンド</Text>
        <Pressable onPress={() => setAdding(true)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="友だちを追加" testID="add-friend">
          <Ionicons name="person-add-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>
      <FriendsTabs active="progress" />
    </>
  );

  if (friends.isLoading) return <Screen withNav>{top}<LoadingState /></Screen>;
  if (friends.isError || !friends.data) return <Screen withNav>{top}<ErrorState error={friends.error} onRetry={() => void friends.refetch()} /></Screen>;

  const all = friends.data;
  const me = all.find((f) => f.is_me);
  const others = all.filter((f) => !f.is_me);
  const room = rooms.data?.[0];
  const liveOthers = room ? room.members.filter((m) => !m.is_me) : [];
  const myNext = pickNextTask(myTasks.data ?? []);

  return (
    <Screen withNav onRefresh={() => { void friends.refetch(); void rooms.refetch(); }} refreshing={friends.isRefetching}>
      {top}

      {liveOthers.length > 0 && room ? (
        <Pressable onPress={() => router.push('/study-party')} style={styles.live} accessibilityRole="button" testID="live-banner">
          <View style={styles.stack}>
            {liveOthers.slice(0, 3).map((m, i) => (
              <View key={m.user_id} style={[styles.stackItem, { marginLeft: i === 0 ? 0 : -14 }]}><Avatar animal={m.avatar} size={38} ring={colors.white} /></View>
            ))}
          </View>
          <View style={styles.grow}>
            <Text variant="bodyBold" size={15}>いま{liveOthers.length}人が{room.subject}を勉強中</Text>
            <View style={styles.liveRow}><View style={styles.liveDot} /><Text variant="bodyBold" size={11} color={colors.red}>LIVE</Text></View>
          </View>
          <Text variant="bodyBold" color={colors.blue} size={14}>のぞく ›</Text>
        </Pressable>
      ) : null}

      {me ? (
        <View style={styles.me} testID="me-row">
          <Avatar animal={me.avatar} size={58} />
          <View style={styles.grow}>
            <View style={styles.nameRow}>
              <Text variant="heading" size={19}>{me.nickname}</Text>
              <Text variant="caption" size={12}>あなた</Text>
              {me.current_streak > 0 ? <Streak days={me.current_streak} /> : null}
            </View>
            <View style={styles.progressRow}>
              <ProgressStamps total={me.must_total} done={me.must_done} />
              <Text variant="num" size={20} color={colors.inkSoft}>{me.must_done}/{me.must_total}</Text>
              {me.cleared ? <Text variant="bodyBold" size={13} color={colors.green}>クリア！</Text> : myNext ? <Text variant="caption">次は{myNext.title}</Text> : null}
            </View>
          </View>
        </View>
      ) : null}

      {others.length === 0 ? (
        <Card>
          <EmptyState
            title="友だちを追加しよう"
            body="フレンドコードを教えあうと、今日の進み具合が見られて、おうえんもできるよ"
            action={<Button label="友だちを追加する" icon="person-add" onPress={() => setAdding(true)} testID="empty-add-friend" />}
          />
        </Card>
      ) : (
        others.map((f) => (
          <View key={f.user_id} style={styles.friendBlock} testID={`friend-${f.nickname}`}>
            <View style={styles.friendRow}>
              <Avatar animal={f.avatar} size={58} />
              <View style={styles.grow}>
                <View style={styles.nameRow}>
                  <Text variant="heading" size={19}>{f.nickname}</Text>
                  {f.current_streak > 0 ? <Streak days={f.current_streak} /> : null}
                </View>
                <Status f={f} />
                <View style={styles.progressRow}>
                  <ProgressStamps total={f.must_total} done={f.must_done} />
                  <Text variant="num" size={20} color={f.cleared ? colors.green : colors.inkSoft}>{f.must_done}/{f.must_total}</Text>
                </View>
              </View>
              <View style={styles.side}>
                <Pressable onPress={() => setOpenReact(openReact === f.user_id ? null : f.user_id)} style={styles.cheerBtn} accessibilityRole="button" accessibilityLabel={f.cleared ? `${f.nickname}さんをお祝いする` : `${f.nickname}さんを応援する`} testID={`cheer-${f.nickname}`}>
                  <Ionicons name={f.my_reactions.length > 0 ? 'heart' : 'heart-outline'} size={16} color={colors.blue} />
                  <Text variant="bodyBold" size={14} color={colors.blue}>{f.cleared ? 'お祝いする' : '応援する'}</Text>
                </Pressable>
                <Pressable onPress={() => setRemoving(f)} hitSlop={10} accessibilityRole="button" accessibilityLabel={`${f.nickname}さんの設定`} style={styles.more}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkFaint} />
                </Pressable>
              </View>
            </View>
            {openReact === f.user_id ? (
              <View style={styles.reactRow}>
                {REACTIONS.map((r) => {
                  const sent = f.my_reactions.includes(r.kind);
                  return (
                    <Pressable key={r.kind} disabled={sent} onPress={() => react(f, r.kind)} style={[styles.reactBtn, sent && styles.reactSent]} accessibilityRole="button" accessibilityLabel={r.label} testID={`react-${f.nickname}-${r.kind}`}>
                      <Text size={24}>{r.emoji}</Text>
                      <Text variant="caption" size={10}>{sent ? '送ったよ' : r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))
      )}

      <AddFriendSheet visible={adding} onClose={() => setAdding(false)} />
      <Sheet visible={!!removing} title="フレンドの設定" onClose={() => setRemoving(null)}>
        <Text variant="body">{removing?.nickname}さんをフレンドから外す？ おたがいの進み具合が見えなくなるよ。</Text>
        <Button label="フレンドから外す" variant="danger" onPress={doRemove} testID="remove-friend-confirm" />
        <Button label="やめる" variant="soft" size="md" onPress={() => setRemoving(null)} />
      </Sheet>
    </Screen>
  );
}

function Streak({ days }: { days: number }) {
  return (
    <View style={styles.streak}>
      <Ionicons name="flame" size={13} color={colors.orange} />
      <Text variant="bodyBold" size={12} color="#B7791F">{days}日連続</Text>
    </View>
  );
}

function Status({ f }: { f: FriendOverviewRow }) {
  if (f.cleared) return <View style={styles.statusRow}><Ionicons name="checkmark" size={14} color={colors.green} /><Text variant="bodyBold" size={13} color={colors.green}>今日クリア！</Text></View>;
  if (f.studying) {
    return (
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: colors.blue }]} />
        <Text variant="bodyBold" size={13} color={colors.ink}>{f.studying_subject ? `${f.studying_subject}を勉強中` : '勉強中'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: colors.inkFaint }]} />
      <Text variant="bodyBold" size={13} color={colors.inkSoft}>{f.must_total === 0 ? 'これから計画するよ' : '休憩中'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 6 },
  stack: { flexDirection: 'row' },
  stackItem: { borderRadius: 20 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.red },
  me: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.yellow, borderRadius: radius.lg, padding: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  friendBlock: { borderBottomWidth: 1, borderBottomColor: colors.line, borderStyle: 'dashed', paddingBottom: 12, gap: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  side: { alignItems: 'flex-end', gap: 6 },
  cheerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.blueSoft },
  more: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  reactRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  reactBtn: { alignItems: 'center', minWidth: 70, minHeight: 56, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.white },
  reactSent: { opacity: 0.45 },
});
