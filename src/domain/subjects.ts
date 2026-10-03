export interface SubjectColor {
  /** 文字・枠線の色 */
  fg: string;
  /** 背景の薄い色 */
  bg: string;
}

const PALETTE = {
  blue: { fg: '#2350D2', bg: '#E6ECFB' },
  red: { fg: '#C8372D', bg: '#FBE9E7' },
  green: { fg: '#2B7A4B', bg: '#E3F1E8' },
  orange: { fg: '#C06A12', bg: '#FCEFDD' },
  purple: { fg: '#7A4BC2', bg: '#F0E9FA' },
  teal: { fg: '#16808A', bg: '#DFF2F3' },
  gold: { fg: '#9A7414', bg: '#F8F0D9' },
  pink: { fg: '#C23B7A', bg: '#FAE6EF' },
} as const satisfies Record<string, SubjectColor>;

/** タスク名に含まれる語から教科を判定する(上から順に最初に一致したもの) */
const RULES: Array<{ color: SubjectColor; words: string[] }> = [
  { color: PALETTE.red, words: ['国語', '漢字', '古文', '漢文', '現代文', '作文', '読解'] },
  { color: PALETTE.blue, words: ['数学', '算数', '計算', '微分', '積分', '図形', '関数'] },
  { color: PALETTE.green, words: ['英語', '英単語', '英文', '英会話', 'リスニング', '音読', 'English'] },
  { color: PALETTE.orange, words: ['理科', '物理', '化学', '生物', '地学', '実験'] },
  { color: PALETTE.purple, words: ['社会', '歴史', '地理', '公民', '政治', '日本史', '世界史'] },
  { color: PALETTE.teal, words: ['宿題', 'ドリル', 'プリント'] },
  { color: PALETTE.gold, words: ['読書', '本'] },
  { color: PALETTE.pink, words: ['復習', '予習', '音楽', '美術', '体育', '家庭', '技術'] },
];

const FALLBACK: SubjectColor = { fg: '#656A78', bg: '#EDEAE2' };

/** タスク名から教科の色を返す。どれにも当てはまらない場合は灰色 */
export function subjectColor(title: string): SubjectColor {
  const t = title.toLowerCase();
  for (const rule of RULES) {
    if (rule.words.some((w) => t.includes(w.toLowerCase()))) return rule.color;
  }
  return FALLBACK;
}
