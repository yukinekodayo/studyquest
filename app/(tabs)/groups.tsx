import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { createGroup, respondGroupInvite } from '@/api/groups';
import { daysLeftLabel } from '@/domain/groups';
import { GROUP_NAME_MAX, groupNameSchema, firstIssue } from '@/domain/validation';
import { useMyGroups, useRefetchOnFocus } from '@/features/hooks';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Sheet } from '@/ui/Sheet';
import { EmptyState, ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

export default function GroupsScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const groups = useMyGroups();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  useRefetchOnFocus(groups.refetch);

  const create = async () => {
    const parsed = groupNameSchema.safeParse(name);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setError(null);
    const id = await run(() => createGroup(parsed.data));
    if (id) {
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
      if (accept) toast.show('グループに参加したよ！', 'success');
      await qc.invalidateQueries();
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Text variant="title">グループ</Text>
      <Pressable onPress={() => setCreating(true)} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="グループを作る" testID="create-group">
        <Ionicons name="add" size={26} color={colors.ink} />
      </Pressable>
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
            <Text variant="bodyBold" size={16}>「{inv.name}」に招待されているよ</Text>
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
            body="みんなで「今週◯日分のクリア」を目指す協力クエストに挑戦できるよ。ランキングはないから安心してね"
            action={<Button label="グループを作る" icon="add" onPress={() => setCreating(true)} testID="empty-create-group" />}
          />
        </Card>
      ) : (
        list.map((g) => (
          <Pressable key={g.id} onPress={() => router.push(`/groups/${g.id}`)} accessibilityRole="button" testID={`group-${g.name}`}>
            <Card style={styles.groupCard}>
              <View style={styles.groupHead}>
                <Text variant="heading" size={18} style={styles.grow}>{g.name}</Text>
                <Text variant="caption">{g.member_count}人 ・ {daysLeftLabel(g.week.days_left)}</Text>
              </View>
              <Text variant="caption" color={colors.blue}>今週の協力クエスト</Text>
              <View style={styles.progressRow}>
                <Text variant="num" size={34} color={colors.blue}>{g.week.progress}<Text variant="bodyBold" size={14} color={colors.inkSoft}> / {g.week.target}日分</Text></Text>
                <Ionicons name="chevron-forward" size={22} color={colors.inkSoft} />
              </View>
              <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.min(100, (g.week.progress / g.week.target) * 100)}%` }]} /></View>
            </Card>
          </Pressable>
        ))
      )}

      <Sheet visible={creating} title="グループを作る" onClose={() => setCreating(false)}>
        <TextField label="グループの名前" value={name} onChangeText={(v) => { setName(v); setError(null); }} maxLength={GROUP_NAME_MAX} placeholder="例：テスト前がんばる会" error={error} testID="group-name-input" autoFocus />
        <Text variant="caption">作ったあとに、フレンドを招待できるよ(10人まで)</Text>
        <Button label="作る" icon="checkmark" onPress={create} testID="group-create-submit" />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addBtn: { width: 46, height: 46, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupCard: { gap: 6, borderRadius: radius.xl },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.blueSoft, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.blue },
});
