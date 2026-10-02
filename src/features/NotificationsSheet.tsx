import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { respondFriendRequest } from '@/api/friends';
import type { ReactionKind } from '@/types/database';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors } from '@/ui/theme';
import { useIncomingRequests, useReceivedReactions, useStats } from './hooks';

export const REACTIONS: Array<{ kind: ReactionKind; emoji: string; label: string }> = [
  { kind: 'clap', emoji: '👏', label: 'すごい' },
  { kind: 'fire', emoji: '🔥', label: 'がんばれ' },
  { kind: 'party', emoji: '🎉', label: 'おめでとう' },
  { kind: 'book', emoji: '📚', label: '一緒に' },
];

export function NotificationsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const run = useRun();
  const qc = useQueryClient();
  const stats = useStats();
  const requests = useIncomingRequests();
  const reactions = useReceivedReactions(stats.data?.today);
  const reqs = requests.data ?? [];
  const cheers = reactions.data ?? [];

  const respond = async (id: string, accept: boolean) => {
    await run(() => respondFriendRequest(id, accept));
    await qc.invalidateQueries();
  };

  return (
    <Sheet visible={visible} title="お知らせ" onClose={onClose}>
      {reqs.length === 0 && cheers.length === 0 ? (
        <Text variant="body" color={colors.inkSoft} align="center">新しいお知らせはありません</Text>
      ) : null}
      {reqs.map((r) => (
        <View key={r.id} style={styles.row}>
          <Avatar name={r.nickname} color={r.avatar} size={44} />
          <View style={styles.grow}>
            <Text variant="bodyBold">{r.nickname}さん</Text>
            <Text variant="caption">フレンド申請が届いています</Text>
          </View>
          <Button label="承認" size="sm" onPress={() => respond(r.id, true)} />
          <Button label="見送る" size="sm" variant="ghost" onPress={() => respond(r.id, false)} />
        </View>
      ))}
      {cheers.length > 0 ? (
        <View style={styles.cheers}>
          <Text variant="label">今日もらった応援</Text>
          {cheers.map((c) => (
            <Text key={c.id} variant="body">
              {REACTIONS.find((x) => x.kind === c.kind)?.emoji} {c.nickname}さんから
            </Text>
          ))}
        </View>
      ) : null}
      <Button label="フレンドを見る" variant="soft" size="md" onPress={() => { onClose(); router.push('/friends'); }} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grow: { flex: 1 },
  cheers: { gap: 6 },
});
