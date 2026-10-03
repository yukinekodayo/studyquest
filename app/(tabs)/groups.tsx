import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createGroup, respondGroupInvite } from '@/api/groups';
import { DEFAULT_GROUP_TARGET, GROUP_TARGET_OPTIONS } from '@/domain/groups';
import { GROUP_NAME_MAX, groupNameSchema, firstIssue } from '@/domain/validation';
import { useMyGroups, useRefetchOnFocus } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors } from '@/ui/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const groups = useMyGroups();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<number>(DEFAULT_GROUP_TARGET);
  useRefetchOnFocus(groups.refetch);

  const create = async () => {
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) {
      haptic.warning();
      return setError(firstIssue(parsed.error));
    }
    setError(null);
    const id = await run(() => createGroup(parsed.data, target));
    if (id) {
      haptic.success();
      setCreating(false);
      setName('');
      await qc.invalidateQueries();
      router.push(`/groups/${id}`);
    }
  };

  const respond = async (groupId: string, accept: boolean) => {
    const ok = await run(async () => {
      await respondGroupInvite(groupId, accept);
      return true;
    });
    if (ok) {
      if (accept) {
        haptic.success();
        toast.show('グループに参加しました', 'success');
      }
      await qc.invalidateQueries();
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Text variant="display" size={32}>グループ</Text>
      <PressableScale onPress={() => setCreating(true)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="グループを作る" testID="create-group" feedback>
        <Ionicons name="add" size={28} color={colors.ink} />
      </PressableScale>
    </View>
  );

  if (groups.isLoading) return <Screen withNav>{header}<LoadingState /></Screen>;
  if (groups.isError || !groups.data) return <Screen withNav>{header}<ErrorState error={groups.error} onRetry={() => void groups.refetch()} /></Screen>;

  const { groups: list, invites } = groups.data;

  return (
    <Screen withNav onRefresh={() => void groups.refetch()} refreshing={groups.isRefetching}>
      {header}

      {invites.map((inv) => (
        <Card key={inv.group_id} tone="blue" style={styles.invite} testID={`invite-${inv.name}`}>
          <View style={styles.grow}>
            <Text variant="bodyBold" size={16}>「{inv.name}」に招待されています</Text>
            {inv.invited_by ? <Text variant="caption">{inv.invited_by}さんから</Text> : null}
          </View>
          <Button label="参加" size="sm" onPress={() => respond(inv.group_id, true)} testID={`join-${inv.name}`} />
          <Button label="見送る" size="sm" variant="ghost" onPress={() => respond(inv.group_id, false)} />
        </Card>
      ))}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            title="友だちとグループを作ろう"
            body="みんなで「◯日連続」を目指す協力チャレンジに挑戦できます。ランキングはありません"
            action={<Button label="グループを作る" icon="add" onPress={() => setCreating(true)} testID="empty-create-group" />}
          />
        </Card>
      ) : (
        list.map((g, i) => (
          <FadeIn key={g.id} index={i}>
            <PressableScale onPress={() => router.push(`/groups/${g.id}`)} accessibilityRole="button" testID={`group-${g.name}`}>
              <Card style={styles.groupCard}>
                <View style={styles.groupHead}>
                  <Text variant="title" size={20} style={styles.grow}>{g.name}</Text>
                  <Text variant="caption">{g.member_count}人</Text>
                </View>
                <Text variant="label" color={colors.blue}>みんなで連続クリア</Text>
                <View style={styles.progressRow}>
                  <Text variant="num" size={40} color={colors.blue}>{g.streak.current}<Text variant="bodyBold" size={15} color={colors.inkSoft}> / {g.streak.target}日連続</Text></Text>
                  <Ionicons name="chevron-forward" size={22} color={colors.inkFaint} />
                </View>
                <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (g.streak.current / g.streak.target) * 100)}%` }]} /></View>
              </Card>
            </PressableScale>
          </FadeIn>
        ))
      )}

      <Sheet visible={creating} title="グループを作る" onClose={() => setCreating(false)}>
        <TextField label="グループの名前" value={name} onChangeText={(v) => { setName(v); setError(null); }} maxLength={GROUP_NAME_MAX} placeholder="例：テスト前がんばる会" error={error} testID="group-name-input" autoFocus />
        <Text variant="label">みんなで何日連続を目指す?</Text>
        <View style={styles.chips}>
          {GROUP_TARGET_OPTIONS.map((n) => (
            <Button key={n} label={`${n}日`} size="sm" variant={target === n ? 'primary' : 'soft'} onPress={() => setTarget(n)} testID={`target-${n}`} />
          ))}
        </View>
        <Text variant="caption">目標はあとからメンバー全員の同意で変えられます。作ったあとに、フレンドを招待できます(10人まで)</Text>
        <Button label="作る" icon="checkmark" onPress={create} testID="group-create-submit" />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupCard: { gap: 8 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.track, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.blue },
});
