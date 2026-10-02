import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { inviteToGroup, leaveGroup } from '@/api/groups';
import { daysLeftLabel } from '@/domain/groups';
import { useFriends, useGroupDetail, useRefetchOnFocus } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors } from '@/ui/theme';

/** グループ詳細: 今週の協力クエスト(個人ランキングではなく、みんなで目標達成) */
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const detail = useGroupDetail(id);
  const friends = useFriends();
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useRefetchOnFocus(detail.refetch);

  const back = () => (router.canGoBack() ? router.back() : router.navigate('/groups'));
  const backBtn = (
    <Pressable onPress={back} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="group-back">
      <Ionicons name="chevron-back" size={26} color={colors.ink} />
    </Pressable>
  );

  if (detail.isLoading) return <Screen withNav>{backBtn}<LoadingState /></Screen>;
  if (detail.isError || !detail.data) return <Screen withNav>{backBtn}<ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></Screen>;

  const g = detail.data;
  const me = g.members.find((m) => m.is_me);
  const reached = g.week.progress >= g.week.target;
  const memberIds = new Set([...g.members.map((m) => m.user_id), ...g.pending_invites.map((p) => p.user_id)]);
  const invitable = (friends.data ?? []).filter((f) => !f.is_me && !memberIds.has(f.user_id));
  const pills = g.week.target <= 30;

  const invite = async (userId: string, nickname: string) => {
    const ok = await run(async () => {
      await inviteToGroup(g.id, userId);
      return true;
    });
    if (ok) {
      haptic.success();
      toast.show(`${nickname}さんを招待しました`, 'success');
      await qc.invalidateQueries();
    }
  };

  const leave = async () => {
    const ok = await run(async () => {
      await leaveGroup(g.id);
      return true;
    });
    if (ok) {
      setLeaving(false);
      await qc.invalidateQueries();
      router.navigate('/groups');
    }
  };

  return (
    <Screen withNav onRefresh={() => void detail.refetch()} refreshing={detail.isRefetching}>
      <View style={styles.headerRow}>
        {backBtn}
        <View style={styles.grow}>
          <Text variant="title" size={22} numberOfLines={1} testID="group-title">{g.name}</Text>
          <Text variant="caption">{g.members.length}人 ・ {daysLeftLabel(g.week.days_left)}</Text>
        </View>
        <Pressable onPress={() => setInviting(true)} style={styles.back} accessibilityRole="button" accessibilityLabel="フレンドを招待" testID="group-invite">
          <Ionicons name="person-add-outline" size={22} color={colors.ink} />
        </Pressable>
      </View>

      <FadeIn index={0}>
        <Card style={styles.quest}>
          <Text variant="label" color={colors.blue}>今週の協力クエスト</Text>
          <Text variant="title" size={20} style={styles.questTitle}>みんなで{g.week.target}日分の{'\n'}デイリークリアを達成しよう</Text>
          <View style={styles.numRow}>
            <Text variant="num" size={56} color={colors.blue} testID="group-progress">{g.week.progress}<Text variant="numMedium" size={17} color={colors.inkSoft}> / {g.week.target}日分</Text></Text>
            <View style={styles.teamStamp}>
              <Stamp type="team" size={56} locked={!reached} />
              <Text variant="caption" size={10} align="center">{reached ? '協力ハンコ獲得' : '達成すると\n協力ハンコ'}</Text>
            </View>
          </View>
          {pills ? (
            <ProgressSegments total={g.week.target} done={g.week.progress} height={6} gap={3} />
          ) : (
            <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (g.week.progress / g.week.target) * 100)}%` }]} /></View>
          )}
          {reached ? (
            <Text variant="bodyBold" color={colors.green} size={14} testID="group-hint">みんなの力で、今週の協力クエストを達成しました</Text>
          ) : me?.cleared ? (
            <Text variant="bodyBold" color={colors.green} size={14} testID="group-hint">今日はもうクリアしました。ナイスです</Text>
          ) : (
            <View style={styles.hintRow} testID="group-hint">
              <Ionicons name="checkmark" size={16} color={colors.blue} />
              <Text variant="bodyBold" color={colors.blue} size={14}>あなたが今日クリアすると {g.week.progress + 1} / {g.week.target} になります</Text>
            </View>
          )}
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <Card>
          <Text variant="heading" size={16} style={styles.membersTitle}>メンバーの今日</Text>
          {g.members.map((m, i) => (
            <View key={m.user_id} style={[styles.memberRow, i > 0 && styles.rowBorder]} testID={`gmember-${m.nickname}`}>
              <Avatar name={m.nickname} color={m.avatar} size={40} solid={m.is_me} />
              <Text variant="bodyBold" size={16} style={styles.memberName} numberOfLines={1}>{m.nickname}</Text>
              <View style={styles.memberBar}><ProgressSegments total={m.must_total} done={m.must_done} height={4} gap={3} doneColor={m.cleared ? colors.green : colors.blue} /></View>
              <Text variant="numMedium" size={13} color={colors.inkSoft}>{m.must_done}/{m.must_total}</Text>
              <Text variant="bodyBold" size={13} color={m.cleared ? colors.green : m.studying || m.is_me ? colors.blue : colors.inkSoft} style={styles.memberStatus}>
                {m.is_me ? 'あなた' : m.cleared ? 'クリア' : m.studying ? '勉強中' : ''}
              </Text>
            </View>
          ))}
          {g.pending_invites.map((p) => (
            <View key={p.user_id} style={[styles.memberRow, styles.rowBorder, { opacity: 0.6 }]}>
              <Avatar name={p.nickname} color={p.avatar} size={40} />
              <Text variant="bodyBold" size={16} style={styles.grow}>{p.nickname}</Text>
              <Text variant="caption">招待中</Text>
            </View>
          ))}
        </Card>
      </FadeIn>

      <Button label="このグループをぬける" variant="ghost" size="md" onPress={() => setLeaving(true)} testID="group-leave" />

      <Sheet visible={inviting} title="フレンドを招待" onClose={() => setInviting(false)}>
        {invitable.length === 0 ? <Text variant="body" color={colors.inkSoft}>招待できるフレンドがいません。まずフレンドを追加しましょう</Text> : invitable.map((f) => (
          <View key={f.user_id} style={styles.inviteRow}>
            <Avatar name={f.nickname} color={f.avatar} size={44} />
            <Text variant="bodyBold" size={16} style={styles.grow}>{f.nickname}</Text>
            <Button label="招待" size="sm" onPress={() => invite(f.user_id, f.nickname)} testID={`invite-${f.nickname}`} />
          </View>
        ))}
      </Sheet>
      <Sheet visible={leaving} title="グループをぬける" onClose={() => setLeaving(false)}>
        <Text variant="body">「{g.name}」をぬけますか？ あとからまた招待してもらえます。</Text>
        <Button label="ぬける" variant="danger" onPress={leave} testID="group-leave-confirm" />
        <Button label="やめる" variant="soft" size="md" onPress={() => setLeaving(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  back: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  quest: { gap: 10 },
  questTitle: { lineHeight: 30 },
  numRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamStamp: { alignItems: 'center', gap: 2, width: 76 },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  membersTitle: { marginBottom: 6 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  memberName: { width: 72 },
  memberBar: { flex: 1 },
  memberStatus: { minWidth: 48, textAlign: 'right' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
