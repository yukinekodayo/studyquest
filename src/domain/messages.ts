/** 時間帯のあいさつ */
export function greetingFor(hour: number): string {
  if (hour >= 4 && hour < 11) return 'おはよう';
  if (hour >= 11 && hour < 18) return 'こんにちは';
  return 'こんばんは';
}

/** タスクを終えたときの一言(今日これで何個目か)。プレッシャーでなく、勢いを後押しする言い方に */
export function comboMessage(doneToday: number, remaining: number): string {
  if (remaining === 0) return 'ぜんぶ終わりました。おつかれさまです';
  if (remaining === 1) return 'あと1つ。ラストいきましょう';
  if (doneToday <= 1) return 'まず1つクリア。いい始まりです';
  if (doneToday === 2) return '2つ目クリア。流れに乗ってきました';
  if (doneToday === 3) return '3つ目クリア。集中できています';
  return `${doneToday}つ目クリア。すごい集中力です`;
}

/** ホームの上の一言(あと何個か) */
export function remainingLabel(remaining: number, total: number): string {
  if (total === 0) return '';
  if (remaining === 0) return 'ぜんぶ達成';
  if (remaining === 1) return 'ラスト1つ';
  return `あと${remaining}つ`;
}

/** 先週との比較(増えたときだけ前向きに伝える。減ったときは何も言わない) */
export function weekDeltaLabel(thisWeek: number, prevWeek: number): string | null {
  const diff = thisWeek - prevWeek;
  if (prevWeek <= 0 || diff <= 0) return null;
  return `先週より +${diff}分`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;
export const weekdayLabel = (ymd: string): string => WEEKDAYS[new Date(`${ymd}T00:00:00Z`).getUTCDay()] ?? '';
