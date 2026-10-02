import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { weekDeltaLabel, weekdayLabel } from '@/domain/messages';
import { formatPlanned } from '@/domain/timer';
import type { StudySummary } from '@/types/database';
import { Card } from '@/ui/Card';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

const CHART_H = 84;
const MIN_SCALE_MIN = 30; // 少ない日でも、棒が極端に大きく見えないように

function Bar({ minutes, max, isToday, label, showValue }: { minutes: number; max: number; isToday: boolean; label: string; showValue: boolean }) {
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(grow, { toValue: 1, duration: 600, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [grow, minutes]);
  const h = minutes > 0 ? Math.max(6, (minutes / max) * CHART_H) : 3;
  return (
    <View style={styles.col}>
      <View style={styles.valueSlot}>
        {showValue && minutes > 0 ? <Text variant="numMedium" size={11} color={colors.ink}>{minutes}分</Text> : null}
      </View>
      <View style={styles.barArea}>
        <Animated.View
          style={[
            styles.bar,
            // 1色(青)だけで、今日を濃く・他の日を淡くして強調する
            { backgroundColor: minutes === 0 ? colors.track : isToday ? colors.blue : colors.blueBorder, height: grow.interpolate({ inputRange: [0, 1], outputRange: [3, h] }) },
          ]}
        />
      </View>
      <Text variant={isToday ? 'bodyBold' : 'caption'} size={12} color={isToday ? colors.ink : colors.inkSoft}>{label}</Text>
    </View>
  );
}

/** 今週の学習時間(直近7日)。進歩が目に見えると、続けるのが楽しくなる */
export function WeeklyStudyCard({ summary, showTotal = false }: { summary: StudySummary; showTotal?: boolean }) {
  const max = Math.max(MIN_SCALE_MIN, ...summary.days.map((d) => d.minutes));
  const best = summary.days.reduce((a, b) => (b.minutes > a.minutes ? b : a), summary.days[0] ?? { date: '', minutes: 0 });
  const delta = weekDeltaLabel(summary.week_minutes, summary.prev_week_minutes);
  const a11y = `直近7日の学習時間。${summary.days.map((d) => `${weekdayLabel(d.date)}曜日 ${d.minutes}分`).join('、')}。合計 ${formatPlanned(summary.week_minutes)}`;

  return (
    <Card testID="weekly-study">
      <View style={styles.head}>
        <Text variant="heading" size={17}>今週の学習</Text>
        {delta ? <Text variant="bodyBold" size={13} color={colors.green} testID="week-delta">{delta}</Text> : null}
      </View>
      <View style={styles.totalRow}>
        <Text variant="num" size={32} testID="week-total">{formatPlanned(summary.week_minutes)}</Text>
        <Text variant="caption" size={12}>今日 {summary.today_minutes}分</Text>
      </View>
      <View style={styles.chart} accessible accessibilityLabel={a11y}>
        {summary.days.map((d, i) => (
          <Bar key={d.date} minutes={d.minutes} max={max} isToday={i === summary.days.length - 1} label={weekdayLabel(d.date)} showValue={d.date === best.date || i === summary.days.length - 1} />
        ))}
      </View>
      {summary.week_minutes === 0 ? (
        <Text variant="caption" size={12} align="center" style={styles.empty} testID="week-empty">タイマーで勉強すると、ここに学習時間がたまっていきます</Text>
      ) : null}
      {showTotal ? (
        <View style={styles.totalLine}>
          <Text variant="caption" size={13}>これまでの合計</Text>
          <Text variant="bodyBold" size={15} testID="study-total">{formatPlanned(summary.total_minutes)}</Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 14 },
  col: { flex: 1, alignItems: 'center', gap: 4 },
  valueSlot: { height: 14, justifyContent: 'flex-end' },
  barArea: { height: CHART_H, justifyContent: 'flex-end', alignSelf: 'stretch', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.line },
  bar: { width: 18, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  empty: { marginTop: 10 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, marginTop: 14, paddingTop: 12 },
});
