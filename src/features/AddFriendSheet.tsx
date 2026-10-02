import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { respondFriendRequest, sendFriendRequest } from '@/api/friends';
import { FRIEND_CODE_LENGTH, isValidFriendCode } from '@/domain/validation';
import { haptic } from '@/lib/haptics';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';
import { useIncomingRequests, useProfile } from './hooks';

/** フレンド追加: 自分のコード / 相手のコードで申請 / 届いた申請の承認 */
export function AddFriendSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const profile = useProfile();
  const requests = useIncomingRequests();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!isValidFriendCode(code)) {
      haptic.warning();
      setError(`フレンドコードは${FRIEND_CODE_LENGTH}文字の英数字です`);
      return;
    }
    setError(null);
    const r = await run(() => sendFriendRequest(code));
    if (r) {
      haptic.success();
      toast.show(r.result === 'friends' ? 'フレンドになりました' : '申請を送りました。承認を待ちましょう', 'success');
      setCode('');
      await qc.invalidateQueries();
    }
  };

  const respond = async (id: string, accept: boolean) => {
    const ok = await run(async () => {
      await respondFriendRequest(id, accept);
      return true;
    });
    if (ok) {
      if (accept) {
        haptic.success();
        toast.show('フレンドになりました', 'success');
      }
      await qc.invalidateQueries();
    }
  };

  const copy = async () => {
    if (!profile.data) return;
    try {
      await Clipboard.setStringAsync(profile.data.friend_code);
      haptic.success();
      toast.show('コピーしました', 'success');
    } catch {
      toast.show('コピーできませんでした', 'error');
    }
  };

  return (
    <Sheet visible={visible} title="友だちを追加" onClose={onClose}>
      {(requests.data ?? []).map((r) => (
        <View key={r.id} style={styles.request} testID={`request-${r.nickname}`}>
          <Avatar name={r.nickname} color={r.avatar} size={44} />
          <View style={styles.grow}>
            <Text variant="bodyBold">{r.nickname}さん</Text>
            <Text variant="caption">フレンド申請が届いています</Text>
          </View>
          <Button label="承認" size="sm" onPress={() => respond(r.id, true)} testID={`accept-${r.nickname}`} />
          <Button label="見送る" size="sm" variant="ghost" onPress={() => respond(r.id, false)} />
        </View>
      ))}

      <View style={styles.mine}>
        <Text variant="label">あなたのフレンドコード</Text>
        <View style={styles.codeRow}>
          <Text variant="num" size={26} style={styles.code} testID="my-code">{profile.data?.friend_code ?? '--------'}</Text>
          <Button label="コピー" size="sm" variant="tint" icon="copy-outline" onPress={copy} />
        </View>
        <Text variant="caption">仲のいい友だちにだけ教えてください</Text>
      </View>

      <TextField label="友だちのコードを入力" value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setError(null); }} autoCapitalize="characters" autoCorrect={false} maxLength={FRIEND_CODE_LENGTH + 2} placeholder="例：AB3D5FGH" error={error} testID="friend-code-input" />
      <Button label="フレンド申請する" icon="person-add" onPress={send} testID="send-request" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  request: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.blueSoft, borderRadius: radius.md, padding: 12 },
  grow: { flex: 1 },
  mine: { gap: 6, backgroundColor: colors.beige, borderRadius: radius.md, padding: 14 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: { letterSpacing: 3 },
});
