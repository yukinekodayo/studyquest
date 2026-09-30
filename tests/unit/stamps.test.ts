import { describe, expect, it } from 'vitest';
import { nextBigMilestone, stampForStreak, streakIfClearedToday } from '@/domain/stamps';

describe('stampForStreak: 7/30/60/100日の境界', () => {
  const table: Array<[number, string]> = [
    [1, 'normal'], [6, 'normal'], [7, 'blue'], [8, 'normal'], [14, 'blue'], [29, 'normal'],
    [30, 'green'], [31, 'normal'], [59, 'normal'], [60, 'gold'], [61, 'normal'],
    [99, 'normal'], [100, 'special'], [101, 'normal'], [200, 'special'], [210, 'green'],
  ];
  it.each(table)('%i日 → %s', (n, expected) => expect(stampForStreak(n)).toBe(expected));
  it('0や負数・小数は通常', () => {
    expect(stampForStreak(0)).toBe('normal');
    expect(stampForStreak(-7)).toBe('normal');
    expect(stampForStreak(7.5)).toBe('normal');
  });
});

describe('予告表示', () => {
  it('今日クリアしたときの連続日数は昨日までの連続+1', () => {
    expect(streakIfClearedToday(0)).toBe(1);
    expect(streakIfClearedToday(6)).toBe(7);
    expect(streakIfClearedToday(-3)).toBe(1);
  });
  it('次の大きな節目(緑・金・特別)までの残り日数', () => {
    expect(nextBigMilestone(7)).toEqual({ type: 'green', streak: 30, remaining: 23 });
    expect(nextBigMilestone(29)).toEqual({ type: 'green', streak: 30, remaining: 1 });
    expect(nextBigMilestone(30)).toEqual({ type: 'gold', streak: 60, remaining: 30 });
    expect(nextBigMilestone(60)).toEqual({ type: 'green', streak: 90, remaining: 30 });
    expect(nextBigMilestone(99)).toEqual({ type: 'special', streak: 100, remaining: 1 });
    expect(nextBigMilestone(0)).toEqual({ type: 'green', streak: 30, remaining: 30 });
  });
});
