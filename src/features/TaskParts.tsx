import { StyleSheet, View } from 'react-native';
import { Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';
import type { TaskRow } from '@/types/database';

/** タスクの印: 完了なら「済」ハンコ、未完了は輪(勉強中は青い輪)。showInitial で頭文字入り */
export function TaskMark({ task, size = 38, showInitial = false }: { task: Pick<TaskRow, 'title' | 'status'>; size?: number; showInitial?: boolean }) {
  if (task.status === 'done') return <Stamp type="normal" size={size} />;
  const doing = task.status === 'doing';
  return (
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, doing && styles.ringDoing]}>
      {showInitial ? (
        <Text serif size={size * 0.42} color={doing ? colors.blue : colors.inkSoft} style={styles.initial}>
          {Array.from(task.title)[0]}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 1.5, borderColor: '#C9C6BD', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  ringDoing: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  initial: { includeFontPadding: false },
});
