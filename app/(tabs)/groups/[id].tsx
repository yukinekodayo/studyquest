import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { daysLeftLabel } from '@/domain/groups';
import { inviteToGroup, leaveGroup } from '@/api/groups';
import { useFriends, useGroupDetail, useRefetchOnFocus } from '@/features/hooks';
import { ProgressStamps } from '@/features/TaskParts';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

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

  const back = () => (router.canGoBack() ? router.back() : router.replace('/groups'));
  const backBtn = (
    <Pressable onPress={back} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="group-back">
      <Ionicons name="chevron-back" size={22} color={colors.ink} />
    </Pressable>
  );

  if (detail.isLoading) return <Screen withNav>{backBtn}<LoadingState /></Screen>;
  if (detail.isError || !detail.data) return <Screen withNav>{backBtn}<ErrorState error={detail.error} onRetry={() => void detail.refetch()} /></Screen>;

  const g = detail.data;
  const me = g.members.find((m) => m.is_me);
  const reached = g.week.progress >= g.week.target;
  const memberIds = new Set([...g.members.map((m) => m.user_id), ...g.pending_invites.map((p) => p.user_id)]);
  const invitable = (friends.data ?? []).filter((f) => !f.is_me && !memberIds.has(f.user_id));

  const invite = async (userId: string, nickname: string) => {
    const ok = await run(async () => {
      await inviteToGroup(g.id, userId);
      return true;
    });
    if (ok) {
      toast.show(`${nickname}さんを招待したよ`, 'success');
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
      router.replace('/groups');
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
          <Ionicons name="person-add-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={styles.questHead}>
        <Text variant="label" color={colors.blue}>今週の協力クエスト</Text>
        <View style={styles.questTitleRow}>
          <Text variant="title" size={21} style={styles.grow}>みんなで{g.week.target}日分の{'\n'}デイリークリアを達成しよう</Text>
          <View style={styles.teamStamp}>
            <Stamp type="team" size={64} locked={!reached} />
            <Text variant="caption" size={10}>{reached ? '協力ハンコ獲得！' : '達成すると協力ハンコ'}</Text>
          </View>
        </View>
        <Text variant="num" size={56} color={colors.blue} testID="group-progress">{g.week.progress}<Text variant="bodyBold" size={16} color={colors.inkSoft}> / {g.week.target}日分</Text></Text>
      </View>

      <Card style={styles.grid}>
        {Array.from({ length: g.week.target }, (_, i) => (
          <View key={i} style={styles.gridCell}>
            {i < g.week.progress ? <Stamp type="normal" size={28} /> : <View style={styles.gridEmpty} />}
          </View>
        ))}
      </Card>

      {reached ? (
        <Text variant="bodyBold" color={colors.green} testID="group-hint">みんなの力で今週の協力クエスト達成！おめでとう🎉</Text>
      ) : me?.cleared ? (
        <Text variant="bodyBold" color={colors.green} testID="group-hint">今日はもうクリアしたよ！ナイス！</Text>
      ) : (
        <View style={styles.hintRow} testID="group-hint">
          <Ionicons name="star" size={15} color={colors.blue} />
          <Text variant="bodyBold" color={colors.blue} size={14}>あなたが今日クリアすると {g.week.progress + 1} / {g.week.target} になります</Text>
        </View>
      )}

      <View>
        <Text variant="heading" size={16} style={styles.membersTitle}>メンバーの今日</Text>
        {g.members.map((m) => (
          <View key={m.user_id} style={styles.memberRow} testID={`gmember-${m.nickname}`}>
            <Avatar animal={m.avatar} size={44} />
            <Text variant="bodyBold" size={16} style={styles.memberName}>{m.nickname}</Text>
            <View style={styles.memberDots}><ProgressStamps total={m.must_total} done={m.must_done} size={20} /></View>
            <Text variant="bodyBold" size={13} color={m.cleared ? colors.green : m.studying ? colors.blue : colors.inkSoft} style={styles.memberStatus}>
              {m.is_me ? 'あなた' : m.cleared ? 'クリア！' : m.studying ? '勉強中' : ''}
            </Text>
          </View>
        ))}
        {g.pending_invites.map((p) => (
          <View key={p.user_id} style={[styles.memberRow, { opacity: 0.6 }]}>
            <Avatar animal={p.avatar} size={44} />
            <Text variant="bodyBold" size={16} style={styles.memberName}>{p.nickname}</Text>
            <Text variant="caption">招待中</Text>
          </View>
        ))}
      </View>

      <Button label="このグループをぬける" variant="ghost" size="md" onPress={() => setLeaving(true)} testID="group-leave" />

      <Sheet visible={inviting} title="フレンドを招待" onClose={() => setInviting(false)}>
        {invitable.length === 0 ? <Text variant="body" color={colors.inkSoft}>招待できるフレンドがいないよ。まずフレンドを追加しよう</Text> : invitable.map((f) => (
          <View key={f.user_id} style={styles.inviteRow}>
            <Avatar animal={f.avatar} size={44} />
            <Text variant="bodyBold" size={16} style={styles.grow}>{f.nickname}</Text>
            <Button label="招待" size="sm" onPress={() => invite(f.user_id, f.nickname)} testID={`invite-${f.nickname}`} />
          </View>
        ))}
      </Sheet>
      <Sheet visible={leaving} title="グループをぬける" onClose={() => setLeaving(false)}>
        <Text variant="body">「{g.name}」をぬける？ あとからまた招待してもらえるよ。</Text>
        <Button label="ぬける" variant="danger" onPress={leave} testID="group-leave-confirm" />
        <Button label="やめる" variant="soft" size="md" onPress={() => setLeaving(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  questHead: { gap: 4 },
  questTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  teamStamp: { alignItems: 'center', width: 84 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: 12, borderRadius: radius.lg },
  gridCell: { width: 28, height: 28 },
  gridEmpty: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9CFDC' },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  membersTitle: { marginBottom: 4 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, borderBottomWidth: 1, borderBottomColor: colors.line, borderStyle: 'dashed' },
  memberName: { width: 76 },
  memberDots: { flex: 1 },
  memberStatus: { minWidth: 56, textAlign: 'right' },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
