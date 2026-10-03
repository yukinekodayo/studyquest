import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStartTask } from '@/features/actions';
import { useStats, useRefetchOnFocus, useReorderTasks, useTodayTasks } from '@/features/hooks';
import { TaskSheet } from '@/features/TaskSheet';
import { formatJaDate } from '@/domain/dates';
import { mustProgress, moveWithinKind, totalPlannedMinutes } from '@/domain/quest';
import { subjectColor } from '@/domain/subjects';
import { formatPlanned } from '@/domain/timer';
import type { TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { PressableScale } from '@/ui/PressableScale';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { PendingStamp, Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

export default function QuestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const tasks = useTodayTasks();
  const stats = useStats();
  const startTask = useStartTask();
  const reorder = useReorderTasks();
  const run = useRun();
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState<{ open: boolean; task: TaskRow | null; kind: 'must' | 'bonus' }>({ open: false, task: null, kind: 'must' });

  useRefetchOnFocus(tasks.refetch);
  useEffect(() => {
    if (params.add === '1') setSheet({ open: true, task: null, kind: 'must' });
  }, [params.add]);

  if (tasks.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (tasks.isError || !tasks.data) return <Screen scroll={false}><ErrorState error={tasks.error} onRetry={tasks.refetch} /></Screen>;

  const list = tasks.data;
  const progress = mustProgress(list);
  const must = list.filter((t) => t.kind === 'must');
  const bonus = list.filter((t) => t.kind === 'bonus');
  const move = (id: string, dir: -1 | 1) => {
    const ids = moveWithinKind(list, id, dir);
    if (ids) void run(() => reorder.mutateAsync(ids));
  };

  const renderRow = (t: TaskRow, i: number) => (
    <View key={t.id} style={[styles.row, i > 0 && styles.rowBorder]} testID={`quest-task-${t.title}`}>
      <PressableScale style={styles.rowMain} pressedScale={0.985} onPress={() => (editing ? setSheet({ open: true, task: t, kind: t.kind }) : router.push(`/quest/${t.id}`))} accessibilityRole="button" accessibilityLabel={t.title}>
        <View style={[styles.subject, { backgroundColor: subjectColor(t.title).bg }]}>
          <Text serif size={20} color={subjectColor(t.title).fg} style={styles.subjectText}>{Array.from(t.title)[0]}</Text>
        </View>
        <View style={styles.rowText}>
          <Text variant="bodyBold" size={16} numberOfLines={1}>{t.title}</Text>
          <Text variant="caption" size={13}>{t.planned_minutes}分（目安）</Text>
        </View>
      </PressableScale>
      {editing ? (
        <View style={styles.editBtns}>
          <IconBtn icon="arrow-up" label="上へ" onPress={() => move(t.id, -1)} />
          <IconBtn icon="arrow-down" label="下へ" onPress={() => move(t.id, 1)} />
          <IconBtn icon="create-outline" label="編集" onPress={() => setSheet({ open: true, task: t, kind: t.kind })} testID={`edit-${t.title}`} />
        </View>
      ) : t.status === 'done' ? (
        <View style={styles.doneWrap}>
          {t.stamped_at ? <Stamp type="normal" size={30} /> : <PendingStamp size={30} />}
          <Text variant="bodyBold" size={14} color={t.stamped_at ? colors.green : colors.blue}>{t.stamped_at ? '完了' : '押す'}</Text>
        </View>
      ) : (
        <Button label={t.status === 'doing' ? 'つづける' : '開始'} size="sm" onPress={() => startTask(t.id)} testID={`start-${t.title}`} style={styles.startBtn} />
      )}
    </View>
  );

  return (
    <Screen withNav onRefresh={() => void tasks.refetch()} refreshing={tasks.isRefetching}>
      <FadeIn index={0}>
        <View style={styles.header}>
          <Text variant="display" size={32}>今日のやること</Text>
          <Pressable onPress={() => setEditing((v) => !v)} hitSlop={10} accessibilityRole="button" testID="toggle-edit" style={styles.editToggle}>
            <Text variant="bodyBold" color={colors.blue} size={16}>{editing ? '完了' : '編集'}</Text>
          </Pressable>
        </View>
        <View style={styles.meta}>
          <Text variant="caption" size={13}>{stats.data ? formatJaDate(stats.data.today) : ''}</Text>
          <Text variant="caption" size={13}>合計 <Text variant="bodyBold" size={14} testID="total-minutes">{formatPlanned(totalPlannedMinutes(list))}</Text></Text>
          <Text variant="caption" size={13}>完了 <Text variant="bodyBold" size={14} testID="quest-progress">{progress.done}/{progress.total}</Text></Text>
        </View>
        <View style={styles.bar}><ProgressSegments total={progress.total} done={progress.done} height={5} /></View>
      </FadeIn>

      <FadeIn index={1}>
        <View style={styles.sectionHead}>
          <Text variant="heading" size={17}>絶対やる</Text>
          <Text variant="caption" size={12}>ぜんぶ達成でハンコがもらえます</Text>
        </View>
        <Card style={styles.list}>
          {must.length === 0 ? <Text variant="body" color={colors.inkSoft} align="center" style={styles.emptyRow}>まだ何もありません。下のボタンで追加しましょう</Text> : must.map(renderRow)}
        </Card>
      </FadeIn>

      {bonus.length > 0 ? (
        <FadeIn index={2}>
          <View style={styles.sectionHead}>
            <Text variant="heading" size={17}>できたらやる</Text>
            <Text variant="caption" size={12}>ボーナス（XPのみ）</Text>
          </View>
          <Card style={styles.list}>{bonus.map(renderRow)}</Card>
        </FadeIn>
      ) : null}

      <FadeIn index={3}>
        <PressableScale onPress={() => setSheet({ open: true, task: null, kind: 'must' })} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="タスクを追加" testID="add-task" feedback>
          <Ionicons name="add" size={22} color={colors.blue} />
          <Text variant="bodyBold" color={colors.blue} size={16}>タスクを追加</Text>
        </PressableScale>
      </FadeIn>

      <TaskSheet visible={sheet.open} task={sheet.task} defaultKind={sheet.kind} onClose={() => { setSheet((s) => ({ ...s, open: false })); if (params.add === '1') router.setParams({ add: '' }); }} />
    </Screen>
  );
}

function IconBtn({ icon, label, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  return (
    <PressableScale onPress={onPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={label} testID={testID} feedback pressedScale={0.9}>
      <Ionicons name={icon} size={18} color={colors.blue} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: 16, marginTop: 4 },
  bar: { marginTop: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  list: { paddingVertical: 4, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 68 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 },
  subject: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  subjectText: { includeFontPadding: false },
  rowText: { flex: 1 },
  editBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  doneWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 76, justifyContent: 'flex-end' },
  startBtn: { minWidth: 76, borderRadius: radius.md },
  emptyRow: { paddingVertical: 24 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 56, borderRadius: radius.lg, backgroundColor: colors.beige },
});
