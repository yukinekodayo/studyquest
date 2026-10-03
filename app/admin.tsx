import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { resolveAdminReport } from '@/api/chat';
import { REPORT_REASONS } from '@/domain/chat';
import { formatChatTime } from '@/domain/chat';
import { useAdminReports, useIsAdmin } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun, useToast } from '@/ui/Toast';
import { colors, themed } from '@/ui/theme';

/** 運営用: 通報されたメッセージの確認と対応(運営アカウントだけが開ける) */
export default function AdminScreen() {
  const router = useRouter();
  const run = useRun();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const reports = useAdminReports(isAdmin.data === true);

  if (isAdmin.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (isAdmin.data !== true) return <Redirect href="/home" />;

  const resolve = async (id: string, action: 'dismiss' | 'hide' | 'hide_mute') => {
    const ok = await run(async () => {
      await resolveAdminReport(id, action);
      return true;
    });
    if (ok) {
      haptic.success();
      toast.show(action === 'dismiss' ? '問題なしにしました' : action === 'hide' ? 'メッセージを非表示にしました' : '非表示にして、24時間の送信停止にしました', 'success');
      await qc.invalidateQueries({ queryKey: ['chat'] });
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="admin-back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="display" size={28}>通報の確認</Text>
      </View>
      <Text variant="caption">未対応の通報です。内容を読んで、対応を選んでください。</Text>

      {reports.isLoading ? <LoadingState /> : reports.isError ? <ErrorState error={reports.error} onRetry={() => void reports.refetch()} /> : (reports.data ?? []).length === 0 ? (
        <Card><Text variant="body" color={colors.inkSoft} align="center" testID="admin-empty">未対応の通報はありません</Text></Card>
      ) : (
        (reports.data ?? []).map((r) => (
          <Card key={r.id} style={styles.card} testID={`report-${r.sender_nickname}`}>
            <View style={styles.meta}>
              <Text variant="bodyBold" size={13} color={colors.red}>{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</Text>
              <Text variant="caption" size={11}>{formatChatTime(r.created_at)}・{r.report_count}件の通報{r.hidden ? '・非表示中' : ''}</Text>
            </View>
            <View style={styles.quote}><Text variant="body">{r.body}</Text></View>
            <Text variant="caption" size={12}>送った人：{r.sender_nickname}{r.group_name ? `（グループ「${r.group_name}」）` : '（1対1）'} ／ 通報した人：{r.reporter_nickname}</Text>
            {r.note ? <Text variant="caption" size={12}>通報の補足：{r.note}</Text> : null}
            <View style={styles.actions}>
              <Button label="問題なし" variant="soft" size="sm" onPress={() => resolve(r.id, 'dismiss')} testID={`dismiss-${r.sender_nickname}`} />
              <Button label="非表示" variant="tint" size="sm" onPress={() => resolve(r.id, 'hide')} testID={`hide-${r.sender_nickname}`} />
              <Button label="非表示+24時間停止" variant="danger" size="sm" onPress={() => resolve(r.id, 'hide_mute')} testID={`mute-${r.sender_nickname}`} />
            </View>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 40, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  card: { gap: 10 },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  quote: { backgroundColor: colors.beige, borderRadius: 14, padding: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
