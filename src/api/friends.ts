import { supabase } from '@/lib/supabase';
import { rpc } from './rpc';
import { isValidFriendCode, normalizeFriendCode } from '@/domain/validation';
import { ValidationError } from './auth';
import type { ProfileRow, ReactionKind, ReactionRow } from '@/types/database';

export const fetchFriendsOverview = () => rpc('friends_overview');

export async function sendFriendRequest(code: string) {
  const normalized = normalizeFriendCode(code);
  if (!isValidFriendCode(normalized)) throw new ValidationError('フレンドコードは8文字の英数字だよ');
  return rpc('send_friend_request', { p_code: normalized });
}

export interface IncomingRequest {
  id: string;
  from_user: string;
  nickname: string;
  avatar: ProfileRow['avatar'];
}

/** 届いているフレンド申請(申請者のニックネーム・アイコンだけ取得) */
export async function fetchIncomingRequests(myId: string): Promise<IncomingRequest[]> {
  const { data: reqs, error } = await supabase
    .from('friend_requests')
    .select('*')
    .eq('to_user', myId)
    .eq('status', 'pending')
    .order('created_at');
  if (error) throw error;
  if (reqs.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, nickname, avatar')
    .in('id', reqs.map((r) => r.from_user));
  if (pErr) throw pErr;
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return reqs.flatMap((r) => {
    const p = byId.get(r.from_user);
    return p ? [{ id: r.id, from_user: r.from_user, nickname: p.nickname, avatar: p.avatar }] : [];
  });
}

export const respondFriendRequest = (id: string, accept: boolean): Promise<void> =>
  rpc('respond_friend_request', { p_request_id: id, p_accept: accept }).then(() => undefined);
export const removeFriend = (friendId: string): Promise<void> =>
  rpc('remove_friend', { p_friend_id: friendId }).then(() => undefined);
export const sendReaction = (to: string, kind: ReactionKind): Promise<void> =>
  rpc('send_reaction', { p_to: to, p_kind: kind }).then(() => undefined);

export interface ReceivedReaction extends ReactionRow {
  nickname: string;
}

/** 今日もらった応援 */
export async function fetchReceivedReactions(myId: string, today: string): Promise<ReceivedReaction[]> {
  const { data, error } = await supabase
    .from('reactions')
    .select('*')
    .eq('to_user', myId)
    .eq('reaction_date', today)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (data.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, nickname')
    .in('id', [...new Set(data.map((r) => r.from_user))]);
  if (pErr) throw pErr;
  const names = new Map(profiles.map((p) => [p.id, p.nickname]));
  return data.map((r) => ({ ...r, nickname: names.get(r.from_user) ?? 'ともだち' }));
}
