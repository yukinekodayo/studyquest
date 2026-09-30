import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { deleteMyAccount, signOut } from '@/api/auth';
import { AVATARS, NICKNAME_MAX, nicknameSchema, firstIssue, type AvatarKey } from '@/domain/validation';
import { useProfile, useUpdateProfile } from '@/features/hooks';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors } from '@/ui/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const profile = useProfile();
  const update = useUpdateProfile();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<AvatarKey>('cat');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setNickname(profile.data.nickname);
      setAvatar(profile.data.avatar);
    }
  }, [profile.data]);

  if (profile.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (profile.isError || !profile.data) return <Screen scroll={false}><ErrorState error={profile.error} onRetry={() => void profile.refetch()} /></Screen>;
  const p = profile.data;
  const dirty = nickname.trim() !== p.nickname || avatar !== p.avatar;

  const save = async () => {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) return setError(firstIssue(parsed.error));
    setError(null);
    const ok = await run(async () => {
      await update.mutateAsync({ nickname: parsed.data, avatar });
      return true;
    });
    if (ok) toast.show('保存したよ', 'success');
  };

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(p.friend_code);
      toast.show('フレンドコードをコピーしたよ', 'success');
    } catch {
      toast.show('コピーできなかったよ', 'error');
    }
  };

  const logout = async () => {
    await run(() => signOut());
  };

  const remove = async () => {
    const ok = await run(async () => {
      await deleteMyAccount();
      return true;
    });
    if (ok) qc.clear();
  };

  return (
    <Screen withNav>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="settings-back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text variant="title">設定</Text>
      </View>

      <Card style={styles.card}>
        <Text variant="heading" size={16}>プロフィール</Text>
        <View style={styles.avatarGrid}>
          {AVATARS.map((a) => (
            <Pressable key={a} onPress={() => setAvatar(a)} accessibilityRole="radio" accessibilityState={{ selected: a === avatar }} accessibilityLabel={`${a}のアイコン`} style={styles.avatarBtn}>
              <Avatar animal={a} size={56} ring={a === avatar ? colors.blue : undefined} />
            </Pressable>
          ))}
        </View>
        <TextField label="ニックネーム" value={nickname} onChangeText={(v) => { setNickname(v); setError(null); }} maxLength={NICKNAME_MAX} error={error} testID="settings-nickname" />
        <Button label="保存する" onPress={save} disabled={!dirty} testID="settings-save" />
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" size={16}>フレンドコード</Text>
        <Text variant="caption">このコードを友だちに教えると、フレンド申請してもらえるよ。知らない人には教えないでね。</Text>
        <View style={styles.codeRow}>
          <Text variant="num" size={26} style={styles.code} testID="friend-code">{p.friend_code}</Text>
          <Button label="コピー" size="sm" variant="soft" icon="copy-outline" onPress={copyCode} />
        </View>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading" size={16}>プライバシー</Text>
        <View style={styles.switchRow}>
          <View style={styles.grow}>
            <Text variant="bodyBold">勉強中の教科を友だちに見せる</Text>
            <Text variant="caption">オフにすると「勉強中」とだけ表示されるよ</Text>
          </View>
          <Switch
            value={p.share_subject}
            onValueChange={(v) => void run(() => update.mutateAsync({ share_subject: v }))}
            trackColor={{ true: colors.blue, false: '#D5D9E3' }}
            accessibilityLabel="勉強中の教科を友だちに見せる"
            testID="share-subject"
          />
        </View>
        <Text variant="caption">友だちに見えるのは、ニックネーム・アイコン・今日の達成数・連続日数・勉強中かどうかだけ。名前や学校などは表示されないよ。</Text>
      </Card>

      <Card style={styles.card}>
        <Button label="ログアウト" variant="soft" icon="log-out-outline" onPress={logout} testID="logout" />
        {confirmDelete ? (
          <View style={styles.danger}>
            <Text variant="bodyBold" color={colors.red}>アカウントを削除すると、記録・ハンコ・友だち関係がすべて消えて、元にもどせないよ。</Text>
            <View style={styles.row}>
              <Button label="やめる" variant="soft" size="md" onPress={() => setConfirmDelete(false)} style={styles.grow} />
              <Button label="削除する" variant="danger" size="md" onPress={remove} style={styles.grow} testID="delete-confirm" />
            </View>
          </View>
        ) : (
          <Button label="アカウントを削除" variant="ghost" size="md" onPress={() => setConfirmDelete(true)} testID="delete-account" />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  card: { gap: 14 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  avatarBtn: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  code: { letterSpacing: 3 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  grow: { flex: 1 },
  danger: { gap: 10, backgroundColor: colors.redSoft, borderRadius: 16, padding: 12 },
  row: { flexDirection: 'row', gap: 10 },
});
