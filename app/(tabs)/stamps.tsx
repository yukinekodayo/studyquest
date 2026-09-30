import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addMonths, buildMonthGrid, parseYmd, toYmd, WEEK_HEADERS_MON_FIRST } from '@/domain/dates';
import { DAILY_STAMP_TYPES, STAMP_META, type StampType } from '@/domain/stamps';
import { useMonthStamps, useRefetchOnFocus, useStats } from '@/features/hooks';
import { Card } from '@/ui/Card';
import { EmptyStamp, Stamp } from '@/ui/Stamp';
import { Screen } from '@/ui/Screen';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { colors, radius } from '@/ui/theme';

/** ハンコ帳: カレンダーで達成状況を見る */
export default function StampsScreen() {
  const router = useRouter();
  const stats = useStats();
  const today = stats.data?.today;
  const t = today ? parseYmd(today) : null;
  const [offset, setOffset] = useState(0);

  const ym = useMemo(() => (t ? addMonths(t.y, t.m, offset) : { y: 1970, m: 1 }), [t, offset]);
  const stamps = useMonthStamps(ym.y, ym.m);
  useRefetchOnFocus(() => { void stats.refetch(); void stamps.refetch(); });

  if (stats.isLoading) return <Screen scroll={false}><LoadingState /></Screen>;
  if (stats.isError || !stats.data || !t) return <Screen scroll={false}><ErrorState error={stats.error} onRetry={() => void stats.refetch()} /></Screen>;

  const s = stats.data;
  const byDate = new Map((stamps.data ?? []).map((st) => [st.earned_date, st.stamp_type]));
  const grid = buildMonthGrid(ym.y, ym.m);
  const isCurrentMonth = offset === 0;
  const counts = s.stamp_counts;
  const kinds = DAILY_STAMP_TYPES.filter((k) => (counts[k] ?? 0) > 0).length;

  return (
    <Screen withNav>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="stamps-back">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </Pressable>
        <Text variant="title">ハンコ帳</Text>
      </View>

      <View style={styles.tiles}>
        <Stat icon="flame" color={colors.orange} label="現在の連続" value={s.current_streak} testID="stat-current" />
        <Stat icon="star" color={colors.blue} label="最高連続" value={s.longest_streak} testID="stat-longest" />
        <Stat icon="checkmark" color={colors.green} label="累計達成" value={s.total_days} testID="stat-total" />
      </View>

      <Card style={styles.cal}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setOffset((o) => o - 1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="前の月" testID="prev-month">
            <Ionicons name="chevron-back" size={22} color={colors.blue} />
          </Pressable>
          <View style={styles.monthCenter}>
            <Text variant="bodyBold" size={18} testID="month-label">{ym.y}年{ym.m}月</Text>
            {isCurrentMonth ? <Text variant="caption" size={11}>今月の達成 {s.month_days}日</Text> : null}
          </View>
          <Pressable onPress={() => setOffset((o) => Math.min(0, o + 1))} disabled={isCurrentMonth} style={[styles.arrow, isCurrentMonth && styles.arrowOff]} accessibilityRole="button" accessibilityLabel="次の月" testID="next-month">
            <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? colors.inkFaint : colors.blue} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEK_HEADERS_MON_FIRST.map((w) => <Text key={w} variant="label" size={12} align="center" style={styles.cell}>{w}</Text>)}
        </View>
        {stamps.isLoading ? <LoadingState /> : stamps.isError ? <ErrorState error={stamps.error} onRetry={() => void stamps.refetch()} /> : grid.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (d === null) return <View key={di} style={styles.cell} />;
              const ymd = toYmd(ym.y, ym.m, d);
              const type = byDate.get(ymd) as StampType | undefined;
              const isToday = ymd === today;
              const future = ymd > (today ?? '');
              return (
                <View key={di} style={[styles.cell, styles.dayCell, isToday && styles.todayCell]} testID={type ? `day-${d}-${type}` : `day-${d}`}>
                  <Text variant="caption" size={11} color={isToday ? colors.blue : colors.inkSoft}>{d}</Text>
                  {type ? <Stamp type={type} size={34} /> : <View style={future ? styles.futureDot : undefined}>{future ? null : <EmptyStamp size={30} />}</View>}
                </View>
              );
            })}
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.collectHead}>
          <Text variant="heading" size={17}>集めたハンコ</Text>
          <Text variant="caption" testID="kinds">{kinds} / {DAILY_STAMP_TYPES.length} 種類</Text>
        </View>
        <View style={styles.collectRow}>
          {DAILY_STAMP_TYPES.map((k) => {
            const n = counts[k] ?? 0;
            return (
              <View key={k} style={styles.collectItem} testID={`collect-${k}`}>
                <Stamp type={k} size={54} locked={n === 0} />
                <Text variant="bodyBold" size={13}>{STAMP_META[k].name}</Text>
                <Text variant="caption" size={11}>{n > 0 ? `×${n}` : STAMP_META[k].requirement}</Text>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

function Stat({ icon, color, label, value, testID }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: number; testID: string }) {
  return (
    <Card style={styles.stat}>
      <View style={styles.statHead}>
        <Ionicons name={icon} size={14} color={color} />
        <Text variant="label" size={12}>{label}</Text>
      </View>
      <Text variant="num" size={30} testID={testID}>{value}<Text variant="bodyBold" size={13}> 日</Text></Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, padding: 12, gap: 2, borderRadius: radius.lg },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cal: { gap: 6, paddingHorizontal: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  monthCenter: { alignItems: 'center' },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.4 },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1 },
  dayCell: { alignItems: 'center', gap: 2, minHeight: 56, paddingVertical: 2, borderRadius: 12 },
  todayCell: { backgroundColor: colors.blueSoft },
  futureDot: { width: 30, height: 30 },
  collectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  collectRow: { flexDirection: 'row', justifyContent: 'space-between' },
  collectItem: { flex: 1, alignItems: 'center', gap: 2 },
});
