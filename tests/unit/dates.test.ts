import { describe, expect, it } from 'vitest';
import { addMonths, buildMonthGrid, daysInMonth, formatJaDate, monthRange } from '@/domain/dates';

describe('dates', () => {
  it('日付の表示', () => {
    expect(formatJaDate('2026-09-30')).toBe('9月30日（水）');
    expect(formatJaDate('2026-04-23')).toBe('4月23日（木）');
  });
  it('月の日数(うるう年含む)', () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it('月の移動', () => {
    expect(addMonths(2026, 12, 1)).toEqual({ y: 2027, m: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ y: 2025, m: 12 });
  });
  it('月の範囲', () => {
    expect(monthRange(2026, 9)).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });
  it('2026年9月のカレンダー(月曜始まり): 1日は火曜', () => {
    const g = buildMonthGrid(2026, 9);
    expect(g[0]).toEqual([null, 1, 2, 3, 4, 5, 6]);
    expect(g[g.length - 1]).toEqual([28, 29, 30, null, null, null, null]);
    expect(g.every((w) => w.length === 7)).toBe(true);
  });
  it('日曜始まりの月(2026年3月1日は日曜)は先頭に6マス空く', () => {
    const g = buildMonthGrid(2026, 3);
    expect(g[0]).toEqual([null, null, null, null, null, null, 1]);
  });
});
