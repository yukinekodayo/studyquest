import { z } from 'zod';

/** アイコンの色(名前の頭文字が入る)。DBの profiles.avatar と同じ値 */
export const AVATARS = ['blue', 'green', 'indigo', 'rose', 'amber', 'teal', 'violet', 'slate'] as const;
export type AvatarKey = (typeof AVATARS)[number];

export const TASK_TITLE_MAX = 40;
export const PLANNED_MINUTES_CHOICES = [10, 15, 20, 30, 45, 60] as const;
/** タスク追加シートの候補(タップで入力) */
export const TASK_SUGGESTIONS = ['英単語', '数学', '英語', '国語', '理科', '社会', '宿題', '読書', '復習'] as const;
export const NICKNAME_MAX = 12;
export const GROUP_NAME_MAX = 20;
export const FRIEND_CODE_LENGTH = 8;

export const taskInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'やることを入力してください')
    .max(TASK_TITLE_MAX, `${TASK_TITLE_MAX}文字までです`),
  planned_minutes: z
    .number()
    .int('分は整数で入力してください')
    .min(1, '1分以上にしてください')
    .max(600, '600分までです'),
  kind: z.enum(['must', 'bonus']),
});
export type TaskInput = z.infer<typeof taskInputSchema>;

export const nicknameSchema = z
  .string()
  .trim()
  .min(1, 'ニックネームを入力してください')
  .max(NICKNAME_MAX, `${NICKNAME_MAX}文字までです`);

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式を確認してください')),
  password: z.string().min(8, 'パスワードは8文字以上にしてください').max(72, 'パスワードが長すぎます'),
  nickname: nicknameSchema,
  avatar: z.enum(AVATARS),
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('メールアドレスの形式を確認してください')),
  password: z.string().min(1, 'パスワードを入力してください'),
});

export const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'グループ名を入力してください')
  .max(GROUP_NAME_MAX, `${GROUP_NAME_MAX}文字までです`);

/** フレンドコード: 前後の空白/ハイフンを除去して大文字化。8文字の英数字(紛らわしい文字なし) */
export function normalizeFriendCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
export function isValidFriendCode(input: string): boolean {
  return /^[A-Z2-9]{8}$/.test(normalizeFriendCode(input)) && !/[IO]/.test(normalizeFriendCode(input));
}

/** zod のエラーから最初のメッセージを取り出す */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? '入力内容を確認してください';
}
