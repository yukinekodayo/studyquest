/**
 * ハンコの種類と判定。SQL側の public.stamp_for_streak と同じ規則(テストで整合性を確認)。
 * 実際の付与はサーバーが行う。ここは表示・予告用。
 */
export type StampType = 'normal' | 'blue' | 'green' | 'gold' | 'special' | 'team';

export const DAILY_STAMP_TYPES = ['normal', 'blue', 'green', 'gold', 'special'] as const;
export type DailyStampType = (typeof DAILY_STAMP_TYPES)[number];

export function stampForStreak(streak: number): StampType {
  if (!Number.isInteger(streak) || streak < 1) return 'normal';
  if (streak % 100 === 0) return 'special';
  if (streak % 60 === 0) return 'gold';
  if (streak % 30 === 0) return 'green';
  if (streak % 7 === 0) return 'blue';
  return 'normal';
}

export interface StampMeta {
  name: string;
  /** ハンコの中央に出す短い文字 */
  mark: string;
  /** 節目ハンコは「N日連続」を小さく出す */
  sub?: string;
  requirement: string;
  color: string;
}

export const STAMP_META: Record<StampType, StampMeta> = {
  normal: { name: '通常', mark: '済', requirement: '毎日クリア', color: '#D8323A' },
  blue: { name: '青', mark: '7', sub: '日連続', requirement: '7日連続', color: '#2F6FE0' },
  green: { name: '緑', mark: '30', sub: '日連続', requirement: '30日連続', color: '#2E9E5B' },
  gold: { name: '金', mark: '60', sub: '日連続', requirement: '60日連続', color: '#D9A21B' },
  special: { name: '特別', mark: '100', sub: '日連続', requirement: '100日連続', color: '#7A4FD3' },
  team: { name: '協力', mark: '協', sub: 'TEAM', requirement: 'グループ達成', color: '#5B7FA6' },
};

/** 今日クリアしたときの連続日数(昨日までの連続が prevStreak) */
export function streakIfClearedToday(prevStreak: number): number {
  return Math.max(0, prevStreak) + 1;
}

export interface Milestone {
  type: StampType;
  streak: number;
  remaining: number;
}

/** 現在の連続日数から見て、次の「大きな節目」(緑・金・特別)まで */
export function nextBigMilestone(currentStreak: number): Milestone {
  for (let n = currentStreak + 1; n <= currentStreak + 400; n++) {
    const t = stampForStreak(n);
    if (t === 'green' || t === 'gold' || t === 'special') {
      return { type: t, streak: n, remaining: n - currentStreak };
    }
  }
  return { type: 'special', streak: currentStreak + 100, remaining: 100 };
}
