import { supabase } from '@/lib/supabase';
import { rpc } from './rpc';
import type { AchievementRow, StampRow } from '@/types/database';

export const getMyStats = () => rpc('get_my_stats');

export async function fetchStampsBetween(from: string, to: string): Promise<StampRow[]> {
  const { data, error } = await supabase
    .from('stamps')
    .select('*')
    .gte('earned_date', from)
    .lte('earned_date', to)
    .order('earned_date');
  if (error) throw error;
  return data;
}

/** 直近の連続記録の表示用(今日を含む過去N日の達成日) */
export async function fetchRecentStamps(fromDate: string): Promise<StampRow[]> {
  const { data, error } = await supabase
    .from('stamps')
    .select('*')
    .gte('earned_date', fromDate)
    .order('earned_date');
  if (error) throw error;
  return data;
}

/** ハンコを押す(date 省略で今日)。サーバーが連続日数から種類を決める */
export const claimStamp = (date?: string) => rpc('claim_stamp', { p_date: date ?? null });

export const getStudySummary = () => rpc('get_study_summary');

export async function fetchAchievements(): Promise<AchievementRow[]> {
  const { data, error } = await supabase.from('user_achievements').select('*').order('unlocked_at');
  if (error) throw error;
  return data;
}
