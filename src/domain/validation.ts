import { z } from 'zod';

export const AVATARS = ['cat', 'frog', 'panda', 'rabbit', 'shiba', 'bear', 'penguin', 'fox'] as const;
export type AvatarKey = (typeof AVATARS)[number];

export const TASK_TITLE_MAX = 40;
export const PLANNED_MINUTES_CHOICES = [10, 15, 20, 30, 45, 60] as const;
export const NICKNAME_MAX = 12;
export const GROUP_NAME_MAX = 20;
export const FRIEND_CODE_LENGTH = 8;

export const taskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'やることを入力してね')
    .max(TASK_TITLE_MAX, `${TASK_TITLE_MAX}文字までだよ`),
  planned_minutes: z
    .number()
    .int('分は整数で入力してね')
    .min(1, '1分以上にしてね')
    .max(600, '600分までだよ'),
  kind: z.enum(['must', 'bonus']),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'ニックネームを入力してね')
  .max(NICKNAME_MAX, `${NICKNAME_MAX}文字までだよ`);

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式を確認してね')),
  password: z.string().min(8, 'パスワードは8文字以上にしてね').max(72, 'パスワードが長すぎるよ'),
  nickname: nicknameSchema,
  avatar: z.enum(AVATARS),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式を確認してね')),
  password: z.string().min(1, 'パスワードを入力してね'),
});

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'グループ名を入力してね')
  .max(GROUP_NAME_MAX, `${GROUP_NAME_MAX}文字までだよ`);

/** フレンドコード: 前後の空白/ハイフンを除去して大文字化。8文字の英数字(紛らわしい文字なし) */
export function normalizeFriendCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
export function isValidFriendCode(input: string): boolean {
  return /^[A-Z2-9]{8}$/.test(normalizeFriendCode(input)) && !/[IO]/.test(normalizeFriendCode(input));
}

/** zod のエラーから最初のメッセージを取り出す */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? '入力内容を確認してね';
}
