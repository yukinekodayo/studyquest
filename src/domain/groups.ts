export function daysLeftLabel(daysLeft: number): string {
  return daysLeft <= 0 ? '期限は今日まで' : `期限まであと${daysLeft}日`;
}
