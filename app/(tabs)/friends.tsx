import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { removeFriend, sendReaction } from '@/api/friends';
import { pickNextTask } from '@/domain/quest';
import { AddFriendSheet } from '@/features/AddFriendSheet';
import { FriendsTabs } from '@/features/FriendsTabs';
import { REACTIONS } from '@/features/NotificationsSheet';
import { useChatUnread, useFriends, usePartyRooms, useRefetchOnFocus, useTodayTasks } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import type { FriendOverviewRow, ReactionKind } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius, themed } from '@/ui/theme';

export default function FriendsScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const friends = useFriends();
  const rooms = usePartyRooms();
  const myTasks = useTodayTasks();
  const unread = useChatUnread();
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
      haptic.success();
      toast.show(`${to.nickname}さんに応援を送りました`, 'success');
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
        <Text variant="display" size={32}>フレンド</Text>
        <PressableScale onPress={() => setAdding(true)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="友だちを追加" testID="add-friend" feedback>
          <Ionicons name="person-add-outline" size={24} color={colors.ink} />
        </PressableScale>
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
        <FadeIn index={0}>
          <PressableScale onPress={() => router.push('/study-party')} style={styles.live} accessibilityRole="button" testID="live-banner">
            <View style={styles.stack}>
              {liveOthers.slice(0, 3).map((m, i) => (
                <View key={m.user_id} style={{ marginLeft: i === 0 ? 0 : -12 }}><Avatar name={m.nickname} color={m.avatar} size={38} ring={colors.bg} /></View>
              ))}
            </View>
            <View style={styles.grow}>
              <Text variant="bodyBold" size={15}>いま{liveOthers.length}人が{room.subject}を勉強中</Text>
              <View style={styles.liveRow}><View style={styles.liveDot} /><Text variant="bodyBold" size={11} color={colors.red} style={styles.liveText}>LIVE</Text></View>
            </View>
            <Text variant="bodyBold" color={colors.blue} size={14}>のぞく ›</Text>
          </PressableScale>
        </FadeIn>
      ) : null}

      {me ? (
        <FadeIn index={1}>
          <View style={styles.me} testID="me-row">
            <Avatar name={me.nickname} color={me.avatar} size={52} solid />
            <View style={styles.grow}>
              <View style={styles.nameRow}>
                <Text variant="bodyBold" size={17}>{me.nickname}</Text>
                <Text variant="bodyBold" size={12} color={colors.blue}>あなた</Text>
                {me.current_streak > 0 ? <Streak days={me.current_streak} /> : null}
              </View>
              <View style={styles.progressRow}>
                <View style={styles.bar}><ProgressSegments total={me.must_total} done={me.must_done} height={4} gap={4} /></View>
                <Text variant="numMedium" size={14} color={colors.ink}>{me.must_done}/{me.must_total}</Text>
                {me.cleared ? <Text variant="bodyBold" size={12} color={colors.green}>クリア</Text> : myNext ? <Text variant="caption" size={12}>つぎは{myNext.title}</Text> : null}
              </View>
            </View>
          </View>
        </FadeIn>
      ) : null}

      {others.length === 0 ? (
        <Card>
          <EmptyState
            title="友だちを追加しよう"
            body="フレンドコードを教えあうと、今日の進み具合が見られて、応援もできます"
            action={<Button label="友だちを追加する" icon="person-add" onPress={() => setAdding(true)} testID="empty-add-friend" />}
          />
        </Card>
      ) : (
        <FadeIn index={2}>
          <Card style={styles.list}>
            {others.map((f, i) => (
              <View key={f.user_id} style={[styles.friendBlock, i > 0 && styles.rowBorder]} testID={`friend-${f.nickname}`}>
                <View style={styles.friendRow}>
                  <Avatar name={f.nickname} color={f.avatar} size={52} />
                  <View style={styles.grow}>
                    <View style={styles.nameRow}>
                      <Text variant="bodyBold" size={17}>{f.nickname}</Text>
                      {f.current_streak > 0 ? <Streak days={f.current_streak} /> : null}
                    </View>
                    <Status f={f} />
                    <View style={styles.progressRow}>
                      <View style={styles.bar}><ProgressSegments total={f.must_total} done={f.must_done} height={4} gap={4} doneColor={f.cleared ? colors.green : colors.blue} /></View>
                      <Text variant="numMedium" size={14} color={f.cleared ? colors.green : colors.ink}>{f.must_done}/{f.must_total}</Text>
                    </View>
                  </View>
                  <View style={styles.side}>
                    <PressableScale onPress={() => setOpenReact(openReact === f.user_id ? null : f.user_id)} style={styles.cheerBtn} accessibilityRole="button" accessibilityLabel={f.cleared ? `${f.nickname}さんをお祝いする` : `${f.nickname}さんを応援する`} testID={`cheer-${f.nickname}`} feedback>
                      <Ionicons name={f.my_reactions.length > 0 ? 'heart' : 'heart-outline'} size={16} color={colors.blue} />
                      <Text variant="bodyBold" size={14} color={colors.blue}>{f.cleared ? 'お祝い' : '応援する'}</Text>
                    </PressableScale>
                    <View style={styles.sideRow}>
                      <PressableScale onPress={() => router.push(`/chat/dm/${f.user_id}`)} style={styles.chatBtn} accessibilityRole="button" accessibilityLabel={`${f.nickname}さんとメッセージ`} testID={`chat-${f.nickname}`} feedback>
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.ink} />
                        {(unread.data?.dms[f.user_id] ?? 0) > 0 ? <View style={styles.unreadDot} testID={`unread-${f.nickname}`} /> : null}
                      </PressableScale>
                      <PressableScale onPress={() => setRemoving(f)} style={styles.more} accessibilityRole="button" accessibilityLabel={`${f.nickname}さんの設定`}>
                        <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkFaint} />
                      </PressableScale>
                    </View>
                  </View>
                </View>
                {openReact === f.user_id ? (
                  <View style={styles.reactRow}>
                    {REACTIONS.map((r) => {
                      const sent = f.my_reactions.includes(r.kind);
                      return (
                        <PressableScale key={r.kind} disabled={sent} onPress={() => react(f, r.kind)} style={[styles.reactBtn, sent && styles.reactSent]} pressedScale={0.88} accessibilityRole="button" accessibilityLabel={r.label} testID={`react-${f.nickname}-${r.kind}`} feedback>
                          <Text size={22}>{r.emoji}</Text>
                          <Text variant="caption" size={10}>{sent ? '送信ずみ' : r.label}</Text>
                        </PressableScale>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        </FadeIn>
      )}

      <AddFriendSheet visible={adding} onClose={() => setAdding(false)} />
      <Sheet visible={!!removing} title="フレンドの設定" onClose={() => setRemoving(null)}>
        <Text variant="body">{removing?.nickname}さんをフレンドから外しますか？ おたがいの進み具合が見えなくなります。</Text>
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
      <Text variant="bodyBold" size={12} color={colors.orange}>{days}日連続</Text>
    </View>
  );
}

function Status({ f }: { f: FriendOverviewRow }) {
  if (f.cleared) return <View style={styles.statusRow}><Ionicons name="checkmark" size={14} color={colors.green} /><Text variant="bodyBold" size={13} color={colors.green}>今日クリア</Text></View>;
  if (f.studying) {
    return (
      <View style={styles.statusRow}>
        <View style={[styles.statusDot, { backgroundColor: colors.blue }]} />
        <Text variant="body" size={13}>{f.studying_subject ? `${f.studying_subject}を勉強中` : '勉強中'}</Text>
      </View>
    );
  }
  return (
    <View style={styles.statusRow}>
      <View style={[styles.statusDot, { backgroundColor: colors.inkFaint }]} />
      <Text variant="body" size={13} color={colors.inkSoft}>{f.must_total === 0 ? 'これから計画します' : '休憩中'}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, gap: 4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  stack: { flexDirection: 'row' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.red },
  liveText: { letterSpacing: 1 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.blueSoft, borderRadius: radius.lg, padding: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bar: { width: 76 },
  list: { paddingVertical: 4, paddingHorizontal: 16 },
  friendBlock: { paddingVertical: 14, gap: 10 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  side: { alignItems: 'flex-end', gap: 2 },
  cheerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.blueSoft },
  more: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  chatBtn: { width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: 4, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  reactRow: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  reactBtn: { alignItems: 'center', minWidth: 70, minHeight: 56, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.beige },
  reactSent: { opacity: 0.45 },
}));
