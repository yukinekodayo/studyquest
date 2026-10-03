import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { signUp } from '@/api/auth';
import { AVATARS, NICKNAME_MAX, type AvatarKey } from '@/domain/validation';
import { haptic } from '@/lib/haptics';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PressableScale } from '@/ui/PressableScale';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun, useToast } from '@/ui/Toast';
import { colors, fonts, themed } from '@/ui/theme';

export default function SignupScreen() {
  const run = useRun();
  const toast = useToast();
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<AvatarKey>('blue');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sentMail, setSentMail] = useState(false);

  const submit = async () => {
    const result = await run(() => signUp({ email, password, nickname, avatar }));
    if (result?.needsConfirmation) {
      setSentMail(true);
      toast.show('確認メールを送りました', 'success');
    }
  };

  if (sentMail) {
    return (
      <Screen>
        <Card style={styles.form}>
          <Text variant="title">メールを確認してください</Text>
          <Text variant="body" color={colors.inkSoft}>{email} に確認メールを送りました。メールのリンクを開いたら、ログインできるようになります。</Text>
          <Link href="/login" style={styles.link}>ログイン画面へ</Link>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Text variant="display" size={32} style={styles.title}>はじめましょう</Text>
      <Card style={styles.form}>
        <View style={styles.avatarSection}>
          <Text variant="label">アイコンの色</Text>
          <View style={styles.avatarGrid}>
            {AVATARS.map((a) => (
              <PressableScale key={a} onPress={() => { haptic.select(); setAvatar(a); }} accessibilityRole="radio" accessibilityState={{ selected: a === avatar }} accessibilityLabel={`${a}の色`} style={styles.avatarBtn} pressedScale={0.9} testID={`avatar-${a}`}>
                <Avatar name={nickname || 'あ'} color={a} size={52} ring={a === avatar ? colors.blue : undefined} />
              </PressableScale>
            ))}
          </View>
        </View>
        <TextField label="ニックネーム" value={nickname} onChangeText={setNickname} maxLength={NICKNAME_MAX} placeholder="例：ゆうき" hint="本名は使わないでください(友だちに表示されます)" testID="signup-nickname" />
        <TextField label="メールアドレス" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" testID="signup-email" />
        <TextField label="パスワード" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" placeholder="8文字以上" testID="signup-password" />
        <Button label="登録してはじめる" onPress={submit} testID="signup-submit" />
        <Text variant="caption" align="center">住所・電話番号・学校名などは聞きませんし、表示もしません。</Text>
      </Card>
      <View style={styles.footer}>
        <Text variant="body" color={colors.inkSoft}>登録ずみの人は</Text>
        <Link href="/login" style={styles.link} accessibilityRole="link">ログイン</Link>
      </View>
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  title: { paddingTop: 12 },
  form: { gap: 16 },
  avatarSection: { gap: 8 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'space-between' },
  avatarBtn: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  link: { fontFamily: fonts.bold, color: colors.blue, fontSize: 15 },
}));
