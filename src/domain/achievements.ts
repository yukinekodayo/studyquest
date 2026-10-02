import type { Ionicons } from '@expo/vector-icons';

export interface AchievementDef {
  /** DB の user_achievements.code と同じ */
  code: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}

/** 実績バッジの一覧(表示順)。判定はサーバー(SQL の _award_achievements)で行う */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: 'first_task', name: 'はじめの一歩', description: '最初のタスクを完了した', icon: 'footsteps' },
  { code: 'first_clear', name: '初クリア', description: '今日のクエストを初めてクリアした', icon: 'ribbon' },
  { code: 'combo_3', name: '3連続', description: '1日に3つのタスクを終えた', icon: 'flash' },
  { code: 'combo_5', name: '5連続', description: '1日に5つのタスクを終えた', icon: 'rocket' },
  { code: 'first_bonus', name: 'プラスワン', description: '「できたらやる」を初めて終えた', icon: 'add-circle' },
  { code: 'streak_3', name: '3日連続', description: '3日連続でクリアした', icon: 'flame' },
  { code: 'streak_7', name: '1週間連続', description: '7日連続でクリアした', icon: 'calendar' },
  { code: 'streak_14', name: '2週間連続', description: '14日連続でクリアした', icon: 'trophy' },
  { code: 'streak_30', name: '1か月連続', description: '30日連続でクリアした', icon: 'medal' },
  { code: 'days_5', name: '5日クリア', description: '合計5日クリアした', icon: 'checkmark-done' },
  { code: 'days_30', name: '30日クリア', description: '合計30日クリアした', icon: 'checkmark-done-circle' },
  { code: 'days_100', name: '100日クリア', description: '合計100日クリアした', icon: 'star' },
  { code: 'tasks_10', name: 'タスク10個', description: 'タスクを合計10個終えた', icon: 'layers' },
  { code: 'tasks_50', name: 'タスク50個', description: 'タスクを合計50個終えた', icon: 'albums' },
  { code: 'tasks_200', name: 'タスク200個', description: 'タスクを合計200個終えた', icon: 'library' },
  { code: 'study_1h', name: '学習1時間', description: '合計1時間学習した', icon: 'time' },
  { code: 'study_10h', name: '学習10時間', description: '合計10時間学習した', icon: 'hourglass' },
  { code: 'study_50h', name: '学習50時間', description: '合計50時間学習した', icon: 'school' },
  { code: 'level_5', name: 'Lv.5', description: 'レベル5に到達した', icon: 'trending-up' },
  { code: 'level_10', name: 'Lv.10', description: 'レベル10に到達した', icon: 'podium' },
  { code: 'first_friend', name: 'はじめての友だち', description: '友だちができた', icon: 'people' },
];

const BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

export const achievementOf = (code: string): AchievementDef | undefined => BY_CODE.get(code);

/** 解除コードの配列を、定義のある実績だけにして表示順に並べる */
export function toAchievementDefs(codes: readonly string[] | undefined): AchievementDef[] {
  const set = new Set(codes ?? []);
  return ACHIEVEMENTS.filter((a) => set.has(a.code));
}
