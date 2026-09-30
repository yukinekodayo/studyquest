import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

/** 「2 / 4」の4分割バー */
export function ProgressSegments({ total, done, height = 8, doneColor = colors.blue }: { total: number; done: number; height?: number; doneColor?: string }) {
  const n = Math.max(total, 1);
  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={[styles.seg, { height, backgroundColor: i < done ? doneColor : colors.blueSoft }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  seg: { flex: 1, borderRadius: 999 },
});
