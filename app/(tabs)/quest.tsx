import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useStartTask } from '@/features/actions';
import { useRefetchOnFocus, useReorderTasks, useTodayTasks } from '@/features/hooks';
import { TaskSheet } from '@/features/TaskSheet';
import { mustProgress, moveWithinKind, totalPlannedMinutes } from '@/domain/quest';
import { formatPlanned } from '@/domain/timer';
import type { TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ProgressSegments } from '@/ui/ProgressSegments';
import { Screen } from '@/ui/Screen';
import { Stamp } from '@/ui/Stamp';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

export default function QuestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ add?: string }>();
  const tasks = useTodayTasks();
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
      <Pressable style={styles.rowMain} onPress={() => (editing ? setSheet({ open: true, task: t, kind: t.kind }) : router.push(`/quest/${t.id}`))} accessibilityRole="button" accessibilityLabel={t.title}>
        <View style={styles.subject}>
          <Text variant="display" size={20} color={colors.inkSoft}>{t.title.slice(0, 1)}</Text>
          {t.status === 'done' ? <View style={styles.subjectStamp}><Stamp type="normal" size={26} /></View> : null}
        </View>
        <View style={styles.rowText}>
          <Text variant="bodyBold" size={16} numberOfLines={1}>{t.title}</Text>
          <Text variant="caption">{t.planned_minutes}分（目安）</Text>
        </View>
      </Pressable>
      {editing ? (
        <View style={styles.editBtns}>
          <IconBtn icon="arrow-up" label="上へ" onPress={() => move(t.id, -1)} />
          <IconBtn icon="arrow-down" label="下へ" onPress={() => move(t.id, 1)} />
          <IconBtn icon="create-outline" label="編集" onPress={() => setSheet({ open: true, task: t, kind: t.kind })} testID={`edit-${t.title}`} />
        </View>
      ) : t.status === 'done' ? (
        <View style={styles.doneWrap}>
          <Ionicons name="checkmark" size={16} color={colors.green} />
          <Text variant="bodyBold" size={14} color={colors.green}>完了</Text>
        </View>
      ) : (
        <Button label={t.status === 'doing' ? 'つづける' : '開始'} size="sm" onPress={() => startTask(t.id)} testID={`start-${t.title}`} style={styles.startBtn} />
      )}
    </View>
  );

  return (
    <Screen withNav onRefresh={() => void tasks.refetch()} refreshing={tasks.isRefetching}>
      <View style={styles.header}>
        <Text variant="title">今日のやること</Text>
        <Pressable onPress={() => setEditing((v) => !v)} hitSlop={10} accessibilityRole="button" testID="toggle-edit" style={styles.editToggle}>
          <Text variant="bodyBold" color={colors.blue} size={16}>{editing ? '完了' : '編集'}</Text>
        </Pressable>
      </View>

      <Card style={styles.summary}>
        <View style={styles.summaryCol}>
          <View style={styles.inline}>
            <Ionicons name="time-outline" size={15} color={colors.inkSoft} />
            <Text variant="label">合計予定時間</Text>
          </View>
          <Text variant="num" size={24} testID="total-minutes">{formatPlanned(totalPlannedMinutes(list))}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.summaryCol}>
          <Text variant="label">今日の進捗</Text>
          <Text variant="num" color={colors.blue} size={26} testID="quest-progress">
            {progress.done}<Text variant="bodyBold" size={15} color={colors.inkSoft}>/{progress.total}</Text>
          </Text>
          <ProgressSegments total={progress.total} done={progress.done} height={6} />
        </View>
      </Card>

      <View style={styles.sectionHead}>
        <Text variant="heading" size={17}>絶対やる</Text>
        <Text variant="caption" style={styles.sectionNote}>ぜんぶ達成でハンコ</Text>
      </View>
      <Card style={styles.list}>
        {must.length === 0 ? <Text variant="body" color={colors.inkSoft} align="center" style={styles.emptyRow}>まだ何もないよ。下のボタンで追加しよう</Text> : must.map(renderRow)}
      </Card>

      {bonus.length > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text variant="heading" size={17}>できたらやる</Text>
            <Text variant="caption" style={styles.sectionNote}>ボーナス（XPだけ）</Text>
          </View>
          <Card style={styles.list}>{bonus.map(renderRow)}</Card>
        </>
      ) : null}

      <Pressable onPress={() => setSheet({ open: true, task: null, kind: 'must' })} style={styles.addBtn} accessibilityRole="button" accessibilityLabel="タスクを追加" testID="add-task">
        <Ionicons name="add" size={22} color={colors.blue} />
        <Text variant="bodyBold" color={colors.blue} size={16}>タスクを追加</Text>
      </Pressable>

      <TaskSheet visible={sheet.open} task={sheet.task} defaultKind={sheet.kind} onClose={() => { setSheet((s) => ({ ...s, open: false })); if (params.add === '1') router.setParams({ add: '' }); }} />
    </Screen>
  );
}

function IconBtn({ icon, label, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable onPress={onPress} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={label} testID={testID} hitSlop={4}>
      <Ionicons name={icon} size={18} color={colors.blue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  summaryCol: { flex: 1, gap: 4 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.line },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 4 },
  sectionNote: { color: colors.inkSoft },
  list: { paddingVertical: 4, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 68 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  subject: { width: 46, height: 46, borderRadius: 14, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  subjectStamp: { position: 'absolute', right: -8, bottom: -8 },
  rowText: { flex: 1 },
  editBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  doneWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 64, justifyContent: 'flex-end' },
  startBtn: { minWidth: 72 },
  emptyRow: { paddingVertical: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 60, borderRadius: radius.lg, borderWidth: 2, borderStyle: 'dashed', borderColor: colors.blueBorder, backgroundColor: 'rgba(255,255,255,0.6)' },
});
