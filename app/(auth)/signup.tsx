import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { signUp } from '@/api/auth';
import { AVATARS, NICKNAME_MAX, type AvatarKey } from '@/domain/validation';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors } from '@/ui/theme';

export default function SignupScreen() {
  const run = useRun();
  const toast = useToast();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<AvatarKey>('cat');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentMail, setSentMail] = useState(false);

  const submit = async () => {
    const result = await run(() => signUp({ email, password, nickname, avatar }));
    if (result?.needsConfirmation) {
      setSentMail(true);
      toast.show('確認メールを送ったよ', 'success');
    }
  };

  if (sentMail) {
    return (
      <Screen>
        <Card style={styles.form}>
          <Text variant="title">メールを確認してね</Text>
          <Text variant="body" color={colors.inkSoft}>{email} に確認メールを送ったよ。メールのリンクを開いたら、ログインできるようになるよ。</Text>
          <Link href="/login" style={styles.link}>ログイン画面へ</Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="title" style={styles.title}>はじめよう</Text>
      <Card style={styles.form}>
        <View style={styles.avatarSection}>
          <Text variant="label">アイコンをえらぶ</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a) => (
              <Pressable key={a} onPress={() => setAvatar(a)} accessibilityRole="radio" accessibilityState={{ selected: a === avatar }} accessibilityLabel={`${a}のアイコン`} style={styles.avatarBtn} testID={`avatar-${a}`}>
                <Avatar animal={a} size={60} ring={a === avatar ? colors.blue : undefined} />
              </Pressable>
            ))}
          </View>
        </View>
        <TextField label="ニックネーム" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX} placeholder="例：ゆうき" hint="本名は使わないでね(友だちに表示されるよ)" testID="signup-nickname" />
        <TextField label="メールアドレス" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" testID="signup-email" />
        <TextField label="パスワード" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="8文字以上" testID="signup-password" />
        <Button label="登録してはじめる" onPress={submit} testID="signup-submit" />
        <Text variant="caption" align="center">住所・電話番号・学校名などは聞かないし、表示もしないよ。</Text>
      </Card>
      <View style={styles.footer}>
        <Text variant="body" color={colors.inkSoft}>登録ずみの人は</Text>
        <Link href="/login" style={styles.link} accessibilityRole="link">ログイン</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: 12 },
  form: { gap: 16 },
  avatarSection: { gap: 8 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  avatarBtn: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  link: { fontFamily: 'ZenMaruGothic_900Black', color: colors.blue, fontSize: 15 },
});
