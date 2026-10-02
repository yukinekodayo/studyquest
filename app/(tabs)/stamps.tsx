import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { claimStamp } from '@/api/stats';
import { addMonths, buildMonthGrid, parseYmd, toYmd, WEEK_HEADERS_MON_FIRST } from '@/domain/dates';
import { DAILY_STAMP_TYPES, STAMP_META, type StampType } from '@/domain/stamps';
import { useMonthStamps, useRefetchOnFocus, useStats } from '@/features/hooks';
import { haptic } from '@/lib/haptics';
import { Card } from '@/ui/Card';
import { PressableScale } from '@/ui/PressableScale';
import { EmptyStamp, PendingStamp, Stamp } from '@/ui/Stamp';
import { Screen } from '@/ui/Screen';
import { ErrorState, LoadingState } from '@/ui/States';
import { Text } from '@/ui/Text';
import { useRun } from '@/ui/Toast';
import { colors } from '@/ui/theme';

/** ハンコ帳: カレンダーで達成状況を見る(押し忘れた日はタップで押せる) */
export default function StampsScreen() {
  const router = useRouter();
  const run = useRun();
  const qc = useQueryClient();
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
  const unclaimed = new Set(s.unclaimed_dates);
  const press = async (ymd: string) => {
    const r = await run(() => claimStamp(ymd));
    if (r) {
      void haptic.stamp();
      await qc.invalidateQueries();
    }
  };
  const isCurrentMonth = offset === 0;
  const counts = s.stamp_counts;
  const kinds = DAILY_STAMP_TYPES.filter((k) => (counts[k] ?? 0) > 0).length;

  return (
    <Screen withNav>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate('/profile'))} style={styles.back} accessibilityRole="button" accessibilityLabel="もどる" testID="stamps-back">
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <Text variant="display" size={30}>ハンコ帳</Text>
      </View>

      <View style={styles.stats}>
        <Stat label="現在の連続" value={s.current_streak} testID="stat-current" />
        <View style={styles.vline} />
        <Stat label="最高連続" value={s.longest_streak} testID="stat-longest" />
        <View style={styles.vline} />
        <Stat label="累計達成" value={s.total_days} testID="stat-total" />
      </View>

      {unclaimed.size > 0 ? (
        <Card tone="blue" style={styles.pending} testID="pending-banner">
          <Text variant="bodyBold" size={14} color={colors.blue}>まだ押していないハンコが{unclaimed.size}日分あります。カレンダーの「押」をタップしてください</Text>
        </Card>
      ) : null}

      <Card style={styles.cal}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => { haptic.select(); setOffset((o) => o - 1); }} style={styles.arrow} accessibilityRole="button" accessibilityLabel="前の月" testID="prev-month">
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </Pressable>
          <Text variant="title" size={20} testID="month-label">{ym.y}年{ym.m}月</Text>
          <Pressable onPress={() => { haptic.select(); setOffset((o) => Math.min(0, o + 1)); }} disabled={isCurrentMonth} style={[styles.arrow, isCurrentMonth && styles.arrowOff]} accessibilityRole="button" accessibilityLabel="次の月" testID="next-month">
            <Ionicons name="chevron-forward" size={22} color={isCurrentMonth ? colors.inkFaint : colors.ink} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEK_HEADERS_MON_FIRST.map((w) => <Text key={w} variant="caption" size={12} align="center" style={styles.cell}>{w}</Text>)}
        </View>
        {stamps.isLoading ? <LoadingState /> : stamps.isError ? <ErrorState error={stamps.error} onRetry={() => void stamps.refetch()} /> : grid.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((d, di) => {
              if (d === null) return <View key={di} style={styles.cell} />;
              const ymd = toYmd(ym.y, ym.m, d);
              const type = byDate.get(ymd) as StampType | undefined;
              const isToday = ymd === today;
              const future = ymd > (today ?? '');
              const canPress = !type && unclaimed.has(ymd);
              return (
                <PressableScale key={di} disabled={!canPress} onPress={() => press(ymd)} pressedScale={0.9} accessibilityRole={canPress ? 'button' : undefined} accessibilityLabel={canPress ? `${d}日のハンコを押す` : undefined} style={[styles.cell, styles.dayCell, isToday && styles.todayCell]} testID={type ? `day-${d}-${type}` : canPress ? `day-${d}-pending` : `day-${d}`}>
                  <Text variant="caption" size={12} color={isToday ? colors.blue : colors.inkSoft}>{d}</Text>
                  {type ? <Stamp type={type} size={34} /> : canPress ? <PendingStamp size={34} /> : <View style={styles.slot}>{future ? null : <EmptyStamp size={0} />}</View>}
                </PressableScale>
              );
            })}
          </View>
        ))}
      </Card>

      <Card>
        <View style={styles.collectHead}>
          <Text variant="heading" size={17}>集めたハンコ</Text>
          <Text variant="caption" testID="kinds">{DAILY_STAMP_TYPES.length}種類中 {kinds}種類</Text>
        </View>
        <View style={styles.collectRow}>
          {DAILY_STAMP_TYPES.map((k) => {
            const n = counts[k] ?? 0;
            return (
              <View key={k} style={styles.collectItem} testID={`collect-${k}`}>
                <Stamp type={k} size={56} locked={n === 0} />
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

function Stat({ label, value, testID }: { label: string; value: number; testID: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="caption" size={13}>{label}</Text>
      <Text variant="num" size={34} testID={testID}>{value}<Text variant="bodyBold" size={14}> 日</Text></Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 40, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1, gap: 2, paddingHorizontal: 4 },
  vline: { width: 1, height: 44, backgroundColor: colors.track, marginHorizontal: 8 },
  pending: { paddingVertical: 12 },
  cal: { gap: 6, paddingHorizontal: 10 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 4 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowOff: { opacity: 0.4 },
  weekRow: { flexDirection: 'row' },
  cell: { flex: 1 },
  dayCell: { alignItems: 'center', gap: 2, minHeight: 54, paddingVertical: 3, borderRadius: 12 },
  todayCell: { backgroundColor: colors.blueSoft },
  slot: { width: 34, height: 34 },
  collectHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  collectRow: { flexDirection: 'row', justifyContent: 'space-between' },
  collectItem: { flex: 1, alignItems: 'center', gap: 3 },
});
