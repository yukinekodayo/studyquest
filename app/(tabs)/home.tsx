import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TaskMark } from '@/features/TaskParts';
import { useStartTask } from '@/features/actions';
import { useFriends, useIncomingRequests, useProfile, useReceivedReactions, useRefetchOnFocus, useStats, useTodayTasks } from '@/features/hooks';
import { NotificationsSheet } from '@/features/NotificationsSheet';
import { formatJaDate } from '@/domain/dates';
import { mustProgress, pickNextTask, totalPlannedMinutes } from '@/domain/quest';
import { STAMP_META, stampForStreak, streakIfClearedToday } from '@/domain/stamps';
import { formatPlanned } from '@/domain/timer';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
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
  const cleared = progress.cleared || s.cleared_today;
  const next = pickNextTask(list);
  const nickname = profile.data?.nickname ?? '';
  const others = (friends.data ?? []).filter((f) => !f.is_me);
  const notifCount = (requests.data?.length ?? 0) + (reactions.data?.length ?? 0);
  const rewardStreak = streakIfClearedToday(s.current_streak);
  const rewardStamp = stampForStreak(rewardStreak);

  return (
    <Screen withNav onRefresh={refetchAll} refreshing={stats.isRefetching || tasks.isRefetching}>
      <FadeIn index={0}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text variant="caption" size={13}>{formatJaDate(s.today)}</Text>
            <Text variant="title" size={28} testID="greeting" style={styles.greeting}>こんにちは、{nickname}</Text>
          </View>
          <PressableScale onPress={() => setBell(true)} style={styles.bell} accessibilityRole="button" accessibilityLabel="お知らせ" testID="bell" feedback>
            <Ionicons name="notifications-outline" size={24} color={colors.ink} />
            {notifCount > 0 ? <View style={styles.dot} /> : null}
          </PressableScale>
        </View>
      </FadeIn>

      <FadeIn index={1}>
        <View style={styles.hero} testID="hero">
          <View style={styles.heroTop}>
            <Text variant="bodyBold" color={colors.white} size={15}>今日のクエスト</Text>
            <View style={styles.streak}>
              <Ionicons name="flame" size={15} color={colors.white} />
              <Text variant="bodyBold" color={colors.white} size={14} testID="streak-value">{s.current_streak}日連続</Text>
            </View>
          </View>
          {must.length === 0 ? (
            <View style={styles.heroEmpty}>
              <Text variant="title" color={colors.white} size={22}>今日のやることを決めよう</Text>
              <Text variant="body" color="rgba(255,255,255,0.78)">ぜんぶ終えると、ハンコを押せます</Text>
              <Button label="やることを追加" icon="add" variant="light" size="md" onPress={() => router.push('/quest')} testID="go-add-task" style={styles.heroBtn} />
            </View>
          ) : (
            <>
              <View style={styles.heroNumRow}>
                <Text variant="num" size={60} color={colors.white} testID="progress-text">
                  {progress.done}<Text variant="numMedium" size={26} color="rgba(255,255,255,0.65)"> / {progress.total}</Text>
                </Text>
                <Text variant="bodyBold" color={colors.white} size={16} style={styles.heroRemain}>{cleared ? 'ぜんぶ達成' : `あと${progress.remaining}つ`}</Text>
              </View>
              <ProgressSegments total={progress.total} done={progress.done} height={5} doneColor={colors.white} trackColor="rgba(255,255,255,0.28)" />
              <View style={styles.heroBottom}>
                {cleared ? (
                  <>
                    <View style={styles.heroNext}>
                      <Text variant="caption" color="rgba(255,255,255,0.75)">{s.today_stamp_claimed ? '今日のハンコ' : 'クリアおめでとう'}</Text>
                      <Text variant="bodyBold" color={colors.white} size={19}>{s.today_stamp_claimed ? '押しました' : 'ハンコを押そう'}</Text>
                    </View>
                    <Button label={s.today_stamp_claimed ? 'ハンコ帳' : 'ハンコを押す'} icon={s.today_stamp_claimed ? 'book-outline' : 'ribbon'} variant="light" size="md" onPress={() => router.push(s.today_stamp_claimed ? '/stamps' : '/complete')} testID="home-cta-complete" />
                  </>
                ) : next ? (
                  <>
                    <View style={styles.heroNext}>
                      <Text variant="caption" color="rgba(255,255,255,0.75)">{next.status === 'doing' ? 'いま勉強中' : 'つぎのタスク'}</Text>
                      <Text variant="bodyBold" color={colors.white} size={19} numberOfLines={1}>{next.title}　{next.planned_minutes}分</Text>
                    </View>
                    <Button label={next.status === 'doing' ? 'つづける' : '開始'} icon="play" variant="light" size="md" onPress={() => startTask(next.id)} testID="home-cta-start" />
                  </>
                ) : null}
              </View>
            </>
          )}
        </View>
      </FadeIn>

      {must.length > 0 ? (
        <FadeIn index={2}>
          <Card style={styles.planCard}>
            <View style={styles.planHead}>
              <Text variant="heading" size={17}>今日の予定</Text>
              <Text variant="caption" size={13}>合計 <Text variant="bodyBold" size={13}>{formatPlanned(totalPlannedMinutes(list))}</Text></Text>
            </View>
            {must.map((t, i) => (
              <PressableScale key={t.id} onPress={() => router.push(`/quest/${t.id}`)} pressedScale={0.985} style={[styles.taskRow, i > 0 && styles.rowBorder]} accessibilityRole="button" accessibilityLabel={`${t.title} ${t.status === 'done' ? '完了' : ''}`} testID={`home-task-${t.title}`}>
                <TaskMark task={t} size={36} />
                <Text variant={t.status === 'done' ? 'body' : 'bodyBold'} size={16} color={t.status === 'done' ? colors.inkSoft : colors.ink} style={styles.taskTitle} numberOfLines={1}>{t.title}</Text>
                <Text variant="body" size={14} color={colors.inkSoft}>{t.planned_minutes}分</Text>
              </PressableScale>
            ))}
            {!cleared && progress.total > 0 && !s.cleared_today ? (
              <View style={[styles.reward, styles.rowBorder]} testID="reward-banner">
                <Stamp type={rewardStamp} size={36} />
                <Text variant="bodyBold" size={14} style={styles.rewardText}>
                  ぜんぶ達成で「{rewardStamp === 'normal' ? '今日のハンコ' : `${STAMP_META[rewardStamp].name}ハンコ`}」
                  {rewardStamp !== 'normal' ? <Text variant="caption" size={13}>　・ {rewardStreak}日連続</Text> : null}
                </Text>
              </View>
            ) : null}
          </Card>
        </FadeIn>
      ) : null}

      <FadeIn index={3}>
        <Card>
          <View style={styles.friendsHead}>
            <Text variant="heading" size={17}>友だちのようす</Text>
            <PressableScale onPress={() => router.push('/friends')} accessibilityRole="link" feedback>
              <Text variant="bodyBold" color={colors.blue} size={14}>すべて見る ›</Text>
            </PressableScale>
          </View>
          {friends.isLoading ? (
            <LoadingState />
          ) : others.length === 0 ? (
            <View style={styles.noFriends}>
              <Text variant="body" color={colors.inkSoft} align="center">友だちを追加すると、おたがいの進み具合が見えます</Text>
              <Button label="友だちを追加する" variant="tint" size="md" icon="person-add" onPress={() => router.push('/friends')} />
            </View>
          ) : (
            <View style={styles.friendRow}>
              {others.slice(0, 4).map((f) => (
                <View key={f.user_id} style={styles.friend} testID={`home-friend-${f.nickname}`}>
                  <Avatar name={f.nickname} color={f.avatar} size={48} />
                  <Text variant="bodyBold" size={14} numberOfLines={1}>{f.nickname}</Text>
                  <Text variant="caption" size={11} color={f.cleared ? colors.green : f.studying ? colors.blue : colors.inkSoft}>
                    {f.must_done}/{f.must_total} {f.cleared ? 'クリア' : f.studying ? '勉強中' : '休憩中'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </FadeIn>

      <NotificationsSheet visible={bell} onClose={() => setBell(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { flex: 1, gap: 4 },
  greeting: { letterSpacing: 1 },
  bell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.red, borderWidth: 1.5, borderColor: colors.bg },
  hero: { backgroundColor: colors.blue, borderRadius: radius.lg, padding: 20, gap: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heroNumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroRemain: { paddingBottom: 10 },
  heroBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 2 },
  heroNext: { flex: 1, gap: 2 },
  heroEmpty: { gap: 8, paddingTop: 4 },
  heroBtn: { alignSelf: 'flex-start', marginTop: 6 },
  planCard: { paddingVertical: 14 },
  planHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  taskTitle: { flex: 1 },
  reward: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, marginTop: 4 },
  rewardText: { flex: 1 },
  friendsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  noFriends: { gap: 12, alignItems: 'center' },
  friendRow: { flexDirection: 'row', justifyContent: 'space-between' },
  friend: { flex: 1, alignItems: 'center', gap: 4 },
});
