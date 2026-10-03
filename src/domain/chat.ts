export const CHAT_MAX_LENGTH = 200;

/** 定型の一言(ワンタップで送れる)。SQL の _quick_phrases() と同じ(テストで一致を確認) */
export const QUICK_PHRASES = ['がんばろう', '今日これやる', '終わった', 'おつかれさま', 'あと少し', '一緒にやろう', 'ナイス', 'すごい'] as const;

/** 夜(22時〜7時)はメッセージを送れない。サーバーでも同じ規則で止める */
export const isQuietHour = (hour: number): boolean => hour >= 22 || hour < 7;

export const REPORT_REASONS = [
  { value: 'abuse', label: '悪口・いやな言葉' },
  { value: 'bullying', label: 'いじめ・しつこい嫌がらせ' },
  { value: 'personal_info', label: '個人情報(電話・住所・学校など)' },
  { value: 'spam', label: '迷惑な内容・宣伝' },
  { value: 'other', label: 'そのほか' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** 時刻の表示: たった今 / 12:34 / 昨日 12:34 / 10/2 */
export function formatChatTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'たった今';
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const hm = `${d.getHours()}:${pad(d.getMinutes())}`;
  if (sameDay(d, now)) return hm;
  const yesterday = new Date(now.getTime() - 24 * 3600_000);
  if (sameDay(d, yesterday)) return `昨日 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 未読の合計(バッジ用)。99件を超えたら 99+ */
export function unreadLabel(n: number): string {
  return n > 99 ? '99+' : String(n);
}
