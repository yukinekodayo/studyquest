import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { formatClock, formatElapsedJa, remainingFraction } from '@/domain/timer';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

const SIZE = 264;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/** 残り時間の円。時間は呼び出し側が「開始時刻ベース」で計算した経過秒を渡す */
export function TimerRing({ plannedMinutes, elapsed, paused }: { plannedMinutes: number; elapsed: number; paused: boolean }) {
  const remaining = plannedMinutes * 60 - elapsed;
  const over = remaining < 0;
  const frac = remainingFraction(plannedMinutes, elapsed);
  const arc = over ? C : C * frac;
  return (
    <View style={styles.wrap} accessibilityRole="timer" accessibilityLabel={over ? `予定より${formatClock(-remaining)}超過` : `のこり${formatClock(remaining)}`}>
      <Svg width={SIZE} height={SIZE}>
        <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke={colors.blueSoft} strokeWidth={STROKE} fill={colors.white} />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          stroke={over ? colors.green : colors.blue}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${arc} ${C}`}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          opacity={paused ? 0.5 : 1}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text variant="label" size={14}>{paused ? '一時停止中' : over ? '予定より' : 'のこり'}</Text>
        <Text variant="display" size={over ? 52 : 58} style={styles.clock} testID="timer-clock" color={over ? colors.green : colors.ink}>
          {over ? `+${formatClock(-remaining)}` : formatClock(remaining)}
        </Text>
        <Text variant="caption" size={13}>{plannedMinutes}分中 {formatElapsedJa(elapsed)} 経過</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignSelf: 'center' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 4 },
  clock: { fontVariant: ['tabular-nums'] },
});
