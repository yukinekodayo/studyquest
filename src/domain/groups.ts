export const GROUP_TARGET_OPTIONS = [3, 7, 14, 30] as const;
export const DEFAULT_GROUP_TARGET = 7;

export function streakHint(current: number, target: number, reached: boolean, clearedToday: boolean): string {
  if (reached) return `みんなで${current}日連続! 目標の${target}日を達成しました`;
  if (clearedToday) return '今日もチームでクリアできました。この調子です';
  return current > 0 ? `だれか1人が今日クリアすると ${current + 1}日連続になります` : 'だれか1人が今日クリアすると、連続がスタートします';
}
