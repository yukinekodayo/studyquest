/**
 * 技術的なエラーをそのまま見せず、ユーザー向けの短い日本語に変換する。
 * サーバー(SQL)は 'SQ_...' 形式のコードで例外を投げる。
 */
const SQ_MESSAGES: Record<string, string> = {
  SQ_UNAUTHENTICATED: 'ログインし直してください',
  SQ_TASK_NOT_FOUND: 'このタスクは見つかりませんでした。すでに削除されたかもしれません',
  SQ_TASK_NOT_TODAY: '今日のタスクだけ操作できます',
  SQ_TASK_ALREADY_DONE: 'このタスクはすでに完了しています',
  SQ_MSG_QUIET: '夜(22時〜7時)はメッセージを送れません。ゆっくり休んで、また明日',
  SQ_MSG_RATE: '送るペースが速すぎます。少し待ってください',
  SQ_MSG_NG: '不適切な言葉が含まれているので、送れません',
  SQ_MSG_PERSONAL: '電話番号・メールアドレス・ID・リンクは送れません(あなたと友だちの個人情報を守るためです)',
  SQ_MSG_CARE: 'つらい気持ちがあるのかもしれません。ひとりで抱えこまず、家族や学校の先生など、身近な信頼できる大人に話してみてください',
  SQ_MSG_MUTED: 'ルール違反の報告があったため、しばらくメッセージを送れません',
  SQ_MSG_BLOCKED: 'この相手とは、メッセージのやりとりができません',
  SQ_MSG_NOT_FOUND: 'メッセージが見つかりませんでした',
  SQ_FORBIDDEN: 'この操作はできません',
  SQ_TASK_NOT_DONE: 'まだ完了していないタスクには、ハンコを押せません',
  SQ_TASK_DATE_INVALID: '日付が正しくありません',
  SQ_TASK_LIMIT: '1日に作れるタスクは20個までです',
  SQ_NOT_CLEARED: 'その日はまだクリアしていないので、ハンコは押せません',
  SQ_SESSION_NOT_FOUND: 'タイマーが見つかりませんでした',
  SQ_SESSION_FINISHED: 'このタイマーはすでに終了しています',
  SQ_INVALID_INPUT: '入力内容を確認してください',
  SQ_CODE_NOT_FOUND: 'そのフレンドコードは見つかりませんでした。もう一度確認してください',
  SQ_SELF_REQUEST: '自分にはフレンド申請できません',
  SQ_ALREADY_FRIENDS: 'すでにフレンドです',
  SQ_ALREADY_REQUESTED: 'すでに申請ずみです。返事を待ちましょう',
  SQ_TOO_MANY_REQUESTS: '申請が多すぎます。少し待ってからにしてください',
  SQ_REQUEST_NOT_FOUND: 'この申請は見つかりませんでした',
  SQ_NOT_FRIENDS: 'フレンドだけが使える機能です',
  SQ_GROUP_NOT_FOUND: 'グループが見つかりませんでした',
  SQ_TOO_MANY_GROUPS: '参加できるグループは10個までです',
  SQ_ALREADY_MEMBER: 'すでにグループのメンバーです',
  SQ_ALREADY_INVITED: 'すでに招待ずみです',
  SQ_GROUP_FULL: 'このグループは満員です(10人まで)',
  SQ_INVITE_NOT_FOUND: 'この招待は見つかりませんでした',
};

const AUTH_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'メールアドレスかパスワードが違います',
  user_already_exists: 'このメールアドレスはすでに登録されています',
  email_exists: 'このメールアドレスはすでに登録されています',
  weak_password: 'パスワードが弱すぎます。もう少し長くしてください',
  email_not_confirmed: 'メールの確認がまだです。届いたメールのリンクを開いてください',
  over_request_rate_limit: '試行回数が多すぎます。少し待ってからもう一度お試しください',
  over_email_send_rate_limit: 'メールの送信が多すぎます。少し待ってからもう一度お試しください',
  signup_disabled: '現在、新規登録を受け付けていません',
  validation_failed: '入力内容を確認してください',
  session_not_found: 'ログインし直してください',
  refresh_token_not_found: 'ログインし直してください',
};

export const GENERIC_ERROR = 'うまくいきませんでした。もう一度お試しください';
export const NETWORK_ERROR = '通信できませんでした。ネットワークを確認してください';
export const AUTH_EXPIRED = 'ログインの有効期限が切れました。もう一度ログインしてください';

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

function isErrorLike(e: unknown): e is ErrorLike {
  return typeof e === 'object' && e !== null;
}

export function toUserMessage(error: unknown): string {
  if (!isErrorLike(error)) return GENERIC_ERROR;
  const message = typeof error.message === 'string' ? error.message : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const status = typeof error.status === 'number' ? error.status : undefined;

  const sq = /SQ_[A-Z_]+/.exec(message)?.[0];
  if (sq && SQ_MESSAGES[sq]) return SQ_MESSAGES[sq];

  if (code && AUTH_CODE_MESSAGES[code]) return AUTH_CODE_MESSAGES[code];

  // 通信系(fetchの失敗はブラウザ/端末で文言が異なる)
  if (/network request failed|failed to fetch|networkerror|load failed|timeout|timed out|ECONN|ENOTFOUND/i.test(message)) {
    return NETWORK_ERROR;
  }
  if (/AuthRetryableFetchError|fetch/i.test(String(error.name ?? '')) && !message) return NETWORK_ERROR;

  // 認証切れ
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt (expired|invalid)/i.test(message)) {
    return AUTH_EXPIRED;
  }
  // DB制約(空のタスク名・長すぎる名前・マイナス時間など)
  if (code === '23514' || code === '22001' || code === '22P02' || code === '23502') return '入力内容を確認してください';
  if (code === '23505') return 'すでに登録されています';
  // 権限がない/他人のデータ
  if (code === '42501' || code === 'PGRST116') return 'この操作はできません';
  if (status === 429) return '試行回数が多すぎます。少し待ってからもう一度お試しください';
  if (status !== undefined && status >= 500) return 'サーバーが混み合っています。少し待ってからもう一度お試しください';

  return GENERIC_ERROR;
}

/** 認証切れとして扱うべきエラーか(ログイン画面に戻す判定に使う) */
export function isAuthExpired(error: unknown): boolean {
  return toUserMessage(error) === AUTH_EXPIRED;
}
