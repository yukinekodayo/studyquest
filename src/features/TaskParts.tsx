import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';
import type { TaskRow } from '@/types/database';

/** タスク頭文字の丸(済ならハンコ、未ならくすんだ点線) */
export function TaskMark({ task, size = 38 }: { task: Pick<TaskRow, 'title' | 'status'>; size?: number }) {
  if (task.status === 'done') return <Stamp type="normal" size={size} />;
  return (
    <View style={[styles.empty, { width: size, height: size, borderRadius: size / 2 }, task.status === 'doing' && styles.doing]}>
      {task.status === 'doing' ? <Ionicons name="play" size={size * 0.4} color={colors.blue} /> : null}
    </View>
  );
}

/** 「20分」チップ */
export function MinutesChip({ minutes }: { minutes: number }) {
  return (
    <View style={styles.chip}>
      <Text variant="bodyBold" size={12} color={colors.inkSoft}>{minutes}分</Text>
    </View>
  );
}

/** 友だち/メンバーの進捗ドット(済ハンコ or 空) */
export function ProgressStamps({ total, done, size = 22 }: { total: number; done: number; size?: number }) {
  const n = Math.min(Math.max(total, 1), 8);
  return (
    <View style={styles.dots}>
      {Array.from({ length: n }, (_, i) =>
        i < done ? (
          <Stamp key={i} type="normal" size={size} />
        ) : (
          <View key={i} style={[styles.emptyDot, { width: size - 2, height: size - 2, borderRadius: size }]} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { borderWidth: 2, borderStyle: 'dashed', borderColor: '#C9CFDC', alignItems: 'center', justifyContent: 'center' },
  doing: { borderColor: colors.blue, borderStyle: 'solid', backgroundColor: colors.blueSoft },
  chip: { backgroundColor: colors.beige, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  dots: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  emptyDot: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C9CFDC' },
});
