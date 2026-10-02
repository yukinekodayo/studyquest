import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { addTask, deleteTask, uncompleteTask, updateTask } from '@/api/tasks';
import { PLANNED_MINUTES_CHOICES, TASK_SUGGESTIONS, TASK_TITLE_MAX, taskInputSchema, firstIssue } from '@/domain/validation';
import { haptic } from '@/lib/haptics';
import type { TaskKind, TaskRow } from '@/types/database';
import { Button } from '@/ui/Button';
import { PressableScale } from '@/ui/PressableScale';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { useRun } from '@/ui/Toast';
import { colors, radius } from '@/ui/theme';

interface TaskSheetProps {
  visible: boolean;
  onClose: () => void;
  /** 指定すると編集モード */
  task?: TaskRow | null;
  defaultKind?: TaskKind;
}

/** タスク追加/編集シート。候補をタップするだけで入力できる */
export function TaskSheet({ visible, onClose, task, defaultKind = 'must' }: TaskSheetProps) {
  const run = useRun();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState<number>(20);
  const [kind, setKind] = useState<TaskKind>('must');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(task?.title ?? '');
    setMinutes(task?.planned_minutes ?? 20);
    setKind(task?.kind ?? defaultKind);
    setError(null);
    setConfirmDelete(false);
  }, [visible, task, defaultKind]);

  const choices = PLANNED_MINUTES_CHOICES.includes(minutes as (typeof PLANNED_MINUTES_CHOICES)[number])
    ? [...PLANNED_MINUTES_CHOICES]
    : [...PLANNED_MINUTES_CHOICES, minutes].sort((a, b) => a - b);

  const finish = async () => {
    await qc.invalidateQueries();
    onClose();
  };

  const save = async () => {
    const parsed = taskInputSchema.safeParse({ title, planned_minutes: minutes, kind });
    if (!parsed.success) {
      haptic.warning();
      setError(firstIssue(parsed.error));
      return;
    }
    setError(null);
    const ok = await run(async () => {
      if (task) await updateTask(task.id, parsed.data);
      else await addTask(parsed.data);
      return true;
    });
    if (ok) {
      haptic.success();
      await finish();
    }
  };

  const remove = async () => {
    if (!task) return;
    const ok = await run(async () => {
      await deleteTask(task.id);
      return true;
    });
    if (ok) await finish();
  };

  const undo = async () => {
    if (!task) return;
    const ok = await run(async () => {
      await uncompleteTask(task.id);
      return true;
    });
    if (ok) await finish();
  };

  return (
    <Sheet visible={visible} title={task ? 'タスクを編集' : 'タスクを追加'} onClose={onClose}>
      <View style={styles.section}>
        <TextField label="なにをやる？" value={title} onChangeText={(v) => { setTitle(v); setError(null); }} placeholder="例：英語の音読" maxLength={TASK_TITLE_MAX} error={error} returnKeyType="done" onSubmitEditing={save} testID="task-title-input" autoFocus={!task} />
        {!task ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.suggest}>
            {TASK_SUGGESTIONS.map((s) => (
              <PressableScale key={s} onPress={() => { haptic.select(); setTitle(s); setError(null); }} style={[styles.suggestChip, title === s && styles.suggestOn]} pressedScale={0.94} accessibilityRole="button" testID={`suggest-${s}`}>
                <Text variant="bodyBold" size={13} color={title === s ? colors.white : colors.blue}>{s}</Text>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
      </View>
      <View style={styles.section}>
        <Text variant="label">目安の時間</Text>
        <View style={styles.grid}>
          {choices.map((m) => (
            <PressableScale key={m} onPress={() => { haptic.select(); setMinutes(m); }} style={[styles.choice, minutes === m && styles.choiceOn]} pressedScale={0.95} accessibilityRole="radio" accessibilityState={{ selected: minutes === m }} testID={`minutes-${m}`}>
              <Text variant="bodyBold" color={minutes === m ? colors.white : colors.ink}>{m}分</Text>
            </PressableScale>
          ))}
        </View>
      </View>
      <View style={styles.section}>
        <Text variant="label">区分</Text>
        <KindOption selected={kind === 'must'} title="絶対やる" body="ぜんぶ達成でハンコがもらえます" onPress={() => setKind('must')} testID="kind-must" />
        <KindOption selected={kind === 'bonus'} title="できたらやる" body="ボーナス。XPだけもらえます" onPress={() => setKind('bonus')} testID="kind-bonus" />
      </View>
      <Button label={task ? '保存する' : '追加する'} icon={task ? 'checkmark' : 'add'} onPress={save} testID="task-save" />
      {task?.status === 'done' ? <Button label="未完了にもどす" variant="soft" size="md" onPress={undo} testID="task-undo" /> : null}
      {task ? (
        confirmDelete ? (
          <View style={styles.confirm}>
            <Text variant="bodyBold" align="center">「{task.title}」を削除しますか？</Text>
            <View style={styles.confirmRow}>
              <Button label="やめる" variant="soft" size="md" onPress={() => setConfirmDelete(false)} style={styles.grow} />
              <Button label="削除する" variant="danger" size="md" onPress={remove} style={styles.grow} testID="task-delete-confirm" />
            </View>
          </View>
        ) : (
          <Button label="このタスクを削除" variant="ghost" size="md" icon="trash-outline" onPress={() => setConfirmDelete(true)} testID="task-delete" />
        )
      ) : null}
    </Sheet>
  );
}

function KindOption({ selected, title, body, onPress, testID }: { selected: boolean; title: string; body: string; onPress: () => void; testID: string }) {
  return (
    <PressableScale onPress={() => { haptic.select(); onPress(); }} style={[styles.kind, selected && styles.kindOn]} pressedScale={0.98} accessibilityRole="radio" accessibilityState={{ selected }} testID={testID}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.grow}>
        <Text variant="bodyBold" size={16}>{title}</Text>
        <Text variant="caption">{body}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  suggest: { gap: 8, paddingVertical: 2 },
  suggestChip: { paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  suggestOn: { backgroundColor: colors.blue },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  choice: { width: '31%', flexGrow: 1, minHeight: 50, borderRadius: radius.md, backgroundColor: colors.beige, alignItems: 'center', justifyContent: 'center' },
  choiceOn: { backgroundColor: colors.blue },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 62, borderRadius: radius.md, backgroundColor: colors.beige },
  kindOn: { backgroundColor: colors.blueSoft },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.inkFaint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.blue },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.blue },
  grow: { flex: 1 },
  confirm: { gap: 10, backgroundColor: colors.redSoft, borderRadius: radius.md, padding: 12 },
  confirmRow: { flexDirection: 'row', gap: 10 },
});
