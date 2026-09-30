import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { loginSchema, signupSchema, firstIssue, type AvatarKey } from '@/domain/validation';
import type { ProfileRow } from '@/types/database';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  } catch {
    return 'Asia/Tokyo';
  }
}

export interface SignUpResult {
  session: Session | null;
  /** メール確認が必要な設定のとき true */
  needsConfirmation: boolean;
}

export async function signUp(input: {
  email: string;
  password: string;
  nickname: string;
  avatar: AvatarKey;
}): Promise<SignUpResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { email, password, nickname, avatar } = parsed.data;
  // 収集する情報は メール・パスワード・ニックネーム・アイコン・タイムゾーン のみ
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname, avatar, timezone: deviceTimeZone() } },
  });
  if (error) throw error;
  return { session: data.session, needsConfirmation: !data.session };
}

export async function signIn(input: { email: string; password: string }): Promise<void> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(firstIssue(parsed.error));
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function fetchMyProfile(userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'nickname' | 'avatar' | 'share_subject'>>,
): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) throw error;
}

/** アカウントと全データを削除し、端末のログイン状態も破棄する */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account' as never);
  if (error) throw error;
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}
