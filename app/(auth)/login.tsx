import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { signIn } from '@/api/auth';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun } from '@/ui/Toast';
import { colors, fonts } from '@/ui/theme';

export default function LoginScreen() {
  const run = useRun();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async () => {
    await run(() => signIn({ email, password }));
  };

  return (
    <Screen>
      <FadeIn index={0}>
        <View style={styles.hero}>
          <Stamp type="normal" size={72} />
          <Text variant="display" size={36} style={styles.brand}>StudyQuest</Text>
          <Text variant="body" color={colors.inkSoft}>今日のやること、ぜんぶクリアしよう。</Text>
        </View>
      </FadeIn>
      <FadeIn index={1}>
        <Card style={styles.form}>
          <TextField label="メールアドレス" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" placeholder="you@example.com" testID="login-email" />
          <TextField label="パスワード" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" textContentType="password" placeholder="8文字以上" testID="login-password" onSubmitEditing={submit} />
          <Button label="ログイン" onPress={submit} testID="login-submit" />
        </Card>
      </FadeIn>
      <View style={styles.footer}>
        <Text variant="body" color={colors.inkSoft}>はじめての人は</Text>
        <Link href="/signup" style={styles.link} accessibilityRole="link">新しく登録する</Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, paddingTop: 32, paddingBottom: 12 },
  brand: { letterSpacing: 1, marginTop: 6 },
  form: { gap: 16 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  link: { fontFamily: fonts.bold, color: colors.blue, fontSize: 15 },
});
