import { StyleSheet, View } from 'react-native';
import { PendingStamp, Stamp } from '@/ui/Stamp';
import { Text } from '@/ui/Text';
import { colors, themed } from '@/ui/theme';
import type { TaskRow } from '@/types/database';

/** タスクの印: 押したら「済」ハンコ、完了だけなら「押」の印、未完了は輪(勉強中は青い輪)。showInitial で頭文字入り */
export function TaskMark({ task, size = 38, showInitial = false }: { task: Pick<TaskRow, 'title' | 'status' | 'stamped_at'>; size?: number; showInitial?: boolean }) {
  // 完了しても、ハンコを自分で押すまでは「押す」の印(青い点線)のまま
  if (task.status === 'done') return task.stamped_at ? <Stamp type="normal" size={size} /> : <PendingStamp size={size} />;
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

const styles = themed(() => StyleSheet.create({
  ring: { borderWidth: 1.5, borderColor: colors.ringBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  ringDoing: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  initial: { includeFontPadding: false },
}));
