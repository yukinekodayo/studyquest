import { describe, expect, it } from 'vitest';
import { isValidFriendCode, normalizeFriendCode, signupSchema, taskInputSchema } from '@/domain/validation';
import { GENERIC_ERROR, NETWORK_ERROR, toUserMessage } from '@/domain/errors';

describe('タスク入力の検証', () => {
  const ok = { title: '英単語', planned_minutes: 20, kind: 'must' as const };
  it('正常値', () => expect(taskInputSchema.parse(ok)).toEqual(ok));
  it('前後の空白は除去', () => expect(taskInputSchema.parse({ ...ok, title: '  数学 ' }).title).toBe('数学'));
  it('空・空白のみ・長すぎるタイトルを拒否', () => {
    expect(taskInputSchema.safeParse({ ...ok, title: '' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...ok, title: '   ' }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...ok, title: 'あ'.repeat(41) }).success).toBe(false);
    expect(taskInputSchema.safeParse({ ...ok, title: 'あ'.repeat(40) }).success).toBe(true);
  });
  it('マイナス・0・小数・大きすぎる予定時間を拒否', () => {
    for (const m of [-1, 0, 1.5, 601, Number.NaN]) {
      expect(taskInputSchema.safeParse({ ...ok, planned_minutes: m }).success).toBe(false);
    }
  });
  it('種別は must/bonus のみ', () => {
    expect(taskInputSchema.safeParse({ ...ok, kind: 'x' }).success).toBe(false);
  });
});

describe('サインアップ入力', () => {
  const ok = { email: ' Test@Example.com ', password: 'abcdefgh', nickname: 'ゆうき', avatar: 'cat' };
  it('メールは小文字化・トリム', () => expect(signupSchema.parse(ok).email).toBe('test@example.com'));
  it('弱い/不正な入力を拒否', () => {
    expect(signupSchema.safeParse({ ...ok, password: 'short' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, email: 'nope' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, nickname: '' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, nickname: 'あ'.repeat(13) }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, avatar: 'dragon' }).success).toBe(false);
  });
});

describe('フレンドコード', () => {
  it('正規化', () => expect(normalizeFriendCode(' ab-cd 2345 ')).toBe('ABCD2345'));
  it('検証', () => {
    expect(isValidFriendCode('abcd2345')).toBe(true);
    expect(isValidFriendCode('ABCD234')).toBe(false);
    expect(isValidFriendCode('ABCD23450')).toBe(false);
    expect(isValidFriendCode('ABCD234O')).toBe(false); // 紛らわしい文字は使わない
  });
});

describe('エラー → ユーザー向けメッセージ(技術的な内容を見せない)', () => {
  it('サーバーのコード', () => {
    expect(toUserMessage({ message: 'SQ_CODE_NOT_FOUND', code: 'P0001' })).toContain('フレンドコード');
    expect(toUserMessage({ message: 'SQ_TASK_LIMIT' })).toContain('20個');
  });
  it('認証エラー', () => {
    expect(toUserMessage({ message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 })).toContain('パスワード');
    expect(toUserMessage({ message: 'User already registered', code: 'user_already_exists' })).toContain('登録されている');
  });
  it('通信エラー', () => {
    expect(toUserMessage(new TypeError('Network request failed'))).toBe(NETWORK_ERROR);
    expect(toUserMessage(new TypeError('Failed to fetch'))).toBe(NETWORK_ERROR);
  });
  it('DB制約/権限/認証切れ', () => {
    expect(toUserMessage({ message: 'new row violates check constraint "tasks_title_check"', code: '23514' })).toBe('入力内容を確認してね');
    expect(toUserMessage({ message: 'permission denied for table tasks', code: '42501' })).toBe('この操作はできないよ');
    expect(toUserMessage({ message: 'JWT expired', code: 'PGRST301', status: 401 })).toContain('ログイン');
  });
  it('未知のエラーは汎用メッセージで、生のメッセージや SQL を含まない', () => {
    const msg = toUserMessage({ message: 'relation "public.secret" does not exist at character 15', code: '42P01' });
    expect(msg).toBe(GENERIC_ERROR);
    expect(msg).not.toMatch(/relation|secret|42P01/);
    expect(toUserMessage(null)).toBe(GENERIC_ERROR);
    expect(toUserMessage('boom')).toBe(GENERIC_ERROR);
  });
});
