/** 日付は 'YYYY-MM-DD' 文字列で扱い、端末のタイムゾーンに依存しない(UTC演算) */
export type YMD = string;

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

export function parseYmd(ymd: YMD): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

export function toYmd(y: number, m: number, d: number): YMD {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function weekdayIndex(ymd: YMD): number {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 9月30日（水） */
export function formatJaDate(ymd: YMD): string {
  const { m, d } = parseYmd(ymd);
  return `${m}月${d}日（${WEEKDAYS_JA[weekdayIndex(ymd)]}）`;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function monthRange(y: number, m: number): { from: YMD; to: YMD } {
  return { from: toYmd(y, m, 1), to: toYmd(y, m, daysInMonth(y, m)) };
}

/** 月曜始まりのカレンダー。null は空白マス */
export function buildMonthGrid(y: number, m: number): Array<Array<number | null>> {
  const first = weekdayIndex(toYmd(y, m, 1)); // 0=日
  const offset = (first + 6) % 7; // 月=0
  const cells: Array<number | null> = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth(y, m); d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEK_HEADERS_MON_FIRST = ['月', '火', '水', '木', '金', '土', '日'] as const;
