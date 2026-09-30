import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MinutesChip, TaskMark } from '@/features/TaskParts';
import { useStartTask } from '@/features/actions';
import {
  useFriends, useIncomingRequests, useProfile, useReceivedReactions, useRefetchOnFocus, useStats, useTodayTasks,
} from '@/features/hooks';
import { NotificationsSheet } from '@/features/NotificationsSheet';
import { formatJaDate } from '@/domain/dates';
import { mustProgress, pickNextTask, totalPlannedMinutes } from '@/domain/quest';
import { STAMP_META, stampForStreak, streakIfClearedToday } from '@/domain/stamps';
import { formatPlanned } from '@/domain/timer';
import { Avatar, Mascot } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { colors, radius } from '@/ui/theme';

export default function HomeScreen() {
  const router = useRouter();
  const stats = useStats();
  const tasks = useTodayTasks();
  const profile = useProfile();
  const friends = useFriends();
  const requests = useIncomingRequests();
  const reactions = useReceivedReactions(stats.data?.today);
  const startTask = useStartTask();
  const [bell, setBell] = useState(false);

  const refetchAll = () => {
    void stats.refetch();
    void tasks.refetch();
    void friends.refetch();
  };
  useRefetchOnFocus(refetchAll);

  if (stats.isLoading || tasks.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (stats.isError || tasks.isError || !stats.data || !tasks.data) {
    return <Screen scroll={false}><ErrorState error={stats.error ?? tasks.error} onRetry={refetchAll} /></Screen>;
  }

  const s = stats.data;
  const list = tasks.data;
  const must = list.filter((t) => t.kind === 'must');
  const progress = mustProgress(list);
  const next = pickNextTask(list);
  const nickname = profile.data?.nickname ?? '';
  const others = (friends.data ?? []).filter((f) => !f.is_me);
  const notifCount = (requests.data?.length ?? 0) + (reactions.data?.length ?? 0);
  const rewardStreak = streakIfClearedToday(s.current_streak);
  const rewardStamp = stampForStreak(rewardStreak);

  return (
    <Screen withNav onRefresh={refetchAll} refreshing={stats.isRefetching || tasks.isRefetching}>
      <View style={styles.headerRow}>
        <Text variant="body" color={colors.inkSoft} style={styles.date}>{formatJaDate(s.today)}</Text>
        <View style={styles.headerBtns}>
          <Pressable onPress={() => setBell(true)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="お知らせ" testID="bell">
            <Ionicons name="notifications-outline" size={22} color={colors.ink} />
            {notifCount > 0 ? <View style={styles.dot} /> : null}
          </Pressable>
          <Pressable onPress={() => router.push('/settings')} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="設定" testID="open-settings">
            <Ionicons name="settings-outline" size={22} color={colors.ink} />
          </Pressable>
        </View>
      </View>

      <View style={styles.greetRow}>
        <View style={styles.greetText}>
          <Text variant="title" testID="greeting">こんにちは、{nickname}さん</Text>
          <Text variant="body" color={colors.inkSoft}>今日のクエスト、ぜんぶクリアしよう</Text>
        </View>
        <Mascot size={70} />
      </View>

      <View style={styles.tiles}>
        <Card style={styles.tile}>
          <Ionicons name="flame" size={22} color={colors.orange} />
          <View>
            <Text variant="caption">連続達成</Text>
            <Text variant="bodyBold" size={20} testID="streak-value">{s.current_streak}<Text variant="bodyBold" size={13}>日</Text></Text>
          </View>
        </Card>
        <Card style={styles.tile}>
          <Ionicons name="time-outline" size={22} color={colors.blue} />
          <View>
            <Text variant="caption">今日の予定</Text>
            <Text variant="bodyBold" size={20}>{formatPlanned(totalPlannedMinutes(list))}</Text>
          </View>
        </Card>
      </View>

      <Card style={styles.questCard}>
        <View style={styles.questHead}>
          <View style={styles.titleMark}>
            <Text variant="heading" size={18}>今日のクエスト</Text>
          </View>
          <Text variant="num" color={colors.blue} size={34} testID="progress-text">
            {progress.done}<Text variant="bodyBold" size={16} color={colors.inkSoft}> / {progress.total}</Text>
          </Text>
        </View>
        <ProgressSegments total={progress.total} done={progress.done} />

        {must.length === 0 ? (
          <View style={styles.emptyQuest}>
            <Text variant="bodyBold" align="center">今日のやることを決めよう</Text>
            <Text variant="caption" align="center">全部終わったら「ハンコ」がもらえるよ</Text>
            <Button label="やることを追加する" icon="add" onPress={() => router.push('/quest')} testID="go-add-task" />
          </View>
        ) : (
          <>
            <View>
              {must.map((t, i) => (
                <Pressable key={t.id} onPress={() => router.push(`/quest/${t.id}`)} style={[styles.taskRow, i > 0 && styles.rowBorder]} accessibilityRole="button" accessibilityLabel={`${t.title} ${t.status === 'done' ? '完了' : ''}`} testID={`home-task-${t.title}`}>
                  <TaskMark task={t} />
                  <Text variant="bodyBold" size={16} color={t.status === 'done' ? colors.inkSoft : colors.ink} style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                  <MinutesChip minutes={t.planned_minutes} />
                  {t.status === 'done' ? (
                    <Text variant="bodyBold" size={14} color={colors.green} style={styles.doneLabel}>完了</Text>
                  ) : (
                    <Ionicons name="chevron-forward" size={20} color={colors.inkSoft} style={styles.chev} />
                  )}
                </Pressable>
              ))}
            </View>
            {progress.cleared ? (
              <Button label={s.today_stamp_claimed ? '今日のクエスト クリア！ ハンコを見る' : 'クリア！ ハンコを押そう'} icon="ribbon" onPress={() => router.push('/complete')} testID="home-cta-complete" />
            ) : next ? (
              <Button
                label={next.status === 'doing' ? `「${next.title}」をつづける` : `つぎは「${next.title}」を始める`}
                icon="play"
                onPress={() => startTask(next.id)}
                testID="home-cta-start"
              />
            ) : null}
          </>
        )}

        {progress.total > 0 && !progress.cleared ? (
          <View style={styles.reward} testID="reward-banner">
            <Stamp type={rewardStamp} size={44} />
            <View style={styles.rewardText}>
              <Text variant="bodyBold" size={12} color={colors.inkSoft}>ぜんぶクリアでもらえる</Text>
              <Text variant="heading" size={16}>
                {rewardStamp === 'normal' ? '通常ハンコ' : `${STAMP_META[rewardStamp].name}ハンコ（${rewardStreak}日連続！）`}
              </Text>
            </View>
            <Text variant="bodyBold" color={colors.blue} size={15}>あと{progress.remaining}つ</Text>
          </View>
        ) : null}
      </Card>

      <Card>
        <View style={styles.friendsHead}>
          <Text variant="heading" size={17}>友だちのようす</Text>
          <Pressable onPress={() => router.push('/friends')} accessibilityRole="link" hitSlop={8}>
            <Text variant="bodyBold" color={colors.blue} size={14}>もっと見る ›</Text>
          </Pressable>
        </View>
        {friends.isLoading ? (
          <LoadingState label="友だちを読み込み中…" />
        ) : others.length === 0 ? (
          <View style={styles.noFriends}>
            <Text variant="body" color={colors.inkSoft} align="center">友だちを追加すると、おたがいの進み具合が見えるよ</Text>
            <Button label="友だちを追加する" variant="soft" size="md" icon="person-add" onPress={() => router.push('/friends')} />
          </View>
        ) : (
          <View style={styles.friendRow}>
            {others.slice(0, 4).map((f) => (
              <View key={f.user_id} style={styles.friend} testID={`home-friend-${f.nickname}`}>
                <View>
                  <Avatar animal={f.avatar} size={54} ring={f.cleared ? colors.green : f.studying ? colors.blue : '#C9CFDC'} />
                  {f.cleared ? (
                    <View style={styles.check}><Ionicons name="checkmark" size={12} color={colors.white} /></View>
                  ) : null}
                </View>
                <Text variant="bodyBold" size={13} numberOfLines={1}>{f.nickname}</Text>
                <Text variant="caption" size={11} color={f.cleared ? colors.green : colors.inkSoft}>
                  {f.cleared ? 'クリア！' : `${f.must_done}/${f.must_total}`}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Card>

      <NotificationsSheet visible={bell} onClose={() => setBell(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontFamily: 'ZenMaruGothic_700Bold' },
  headerBtns: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.white },
  greetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  greetText: { flex: 1, gap: 2 },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  questCard: { gap: 14 },
  questHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleMark: { borderBottomWidth: 8, borderBottomColor: colors.yellow, paddingBottom: 0 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  taskTitle: { flex: 1 },
  doneLabel: { width: 40, textAlign: 'right' },
  chev: { width: 40, textAlign: 'right' },
  emptyQuest: { gap: 10, alignItems: 'stretch', paddingVertical: 8 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.yellowSoft, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.yellowBorder, borderRadius: radius.md, padding: 10 },
  rewardText: { flex: 1 },
  friendsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  noFriends: { gap: 12, alignItems: 'center' },
  friendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  friend: { flex: 1, alignItems: 'center', gap: 2 },
  check: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
});
