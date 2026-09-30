/**
 * 技術的なエラーをそのまま見せず、ユーザー向けの短い日本語に変換する。
 * サーバー(SQL)は 'SQ_...' 形式のコードで例外を投げる。
 */
const SQ_MESSAGES: Record<string, string> = {
  SQ_UNAUTHENTICATED: 'ログインしなおしてね',
  SQ_TASK_NOT_FOUND: 'このタスクは見つからなかったよ。もう消えたのかも',
  SQ_TASK_NOT_TODAY: '今日のタスクだけ操作できるよ',
  SQ_TASK_ALREADY_DONE: 'このタスクはもう完了しているよ',
  SQ_TASK_DATE_INVALID: '日付が正しくないよ',
  SQ_TASK_LIMIT: '1日に作れるタスクは20個までだよ',
  SQ_NOT_CLEARED: 'その日はまだクリアしていないから、ハンコは押せないよ',
  SQ_SESSION_NOT_FOUND: 'タイマーが見つからなかったよ',
  SQ_SESSION_FINISHED: 'このタイマーはもう終了しているよ',
  SQ_INVALID_INPUT: '入力内容を確認してね',
  SQ_CODE_NOT_FOUND: 'そのフレンドコードは見つからなかったよ。もう一度確認してね',
  SQ_SELF_REQUEST: '自分にはフレンド申請できないよ',
  SQ_ALREADY_FRIENDS: 'もうフレンドだよ',
  SQ_ALREADY_REQUESTED: 'すでに申請ずみだよ。返事をまとう',
  SQ_TOO_MANY_REQUESTS: '申請しすぎだよ。少し待ってからにしてね',
  SQ_REQUEST_NOT_FOUND: 'この申請は見つからなかったよ',
  SQ_NOT_FRIENDS: 'フレンドだけに使える機能だよ',
  SQ_GROUP_NOT_FOUND: 'グループが見つからなかったよ',
  SQ_TOO_MANY_GROUPS: '参加できるグループは10個までだよ',
  SQ_ALREADY_MEMBER: 'もうグループのメンバーだよ',
  SQ_ALREADY_INVITED: 'もう招待ずみだよ',
  SQ_GROUP_FULL: 'このグループは満員だよ(10人まで)',
  SQ_INVITE_NOT_FOUND: 'この招待は見つからなかったよ',
};

const AUTH_CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: 'メールアドレスかパスワードがちがうみたい',
  user_already_exists: 'このメールアドレスはもう登録されているよ',
  email_exists: 'このメールアドレスはもう登録されているよ',
  weak_password: 'パスワードが弱すぎるよ。もう少し長くしてみてね',
  email_not_confirmed: 'メールの確認がまだみたい。届いたメールのリンクを開いてね',
  over_request_rate_limit: 'ためしすぎだよ。少し待ってからもう一度ね',
  over_email_send_rate_limit: 'メールを送りすぎだよ。少し待ってからもう一度ね',
  signup_disabled: '今は新しく登録できないみたい',
  validation_failed: '入力内容を確認してね',
  session_not_found: 'ログインしなおしてね',
  refresh_token_not_found: 'ログインしなおしてね',
};

export const GENERIC_ERROR = 'うまくいかなかったよ。もう一度ためしてね';
export const NETWORK_ERROR = '通信できなかったよ。ネットワークを確認してね';
export const AUTH_EXPIRED = 'ログインの有効期限が切れたよ。もう一度ログインしてね';

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
  if (code === '23514' || code === '22001' || code === '22P02' || code === '23502') return '入力内容を確認してね';
  if (code === '23505') return 'すでに登録されているよ';
  // 権限がない/他人のデータ
  if (code === '42501' || code === 'PGRST116') return 'この操作はできないよ';
  if (status === 429) return 'ためしすぎだよ。少し待ってからもう一度ね';
  if (status !== undefined && status >= 500) return 'サーバーがいそがしいみたい。少し待ってからもう一度ね';

  return GENERIC_ERROR;
}

/** 認証切れとして扱うべきエラーか(ログイン画面に戻す判定に使う) */
export function isAuthExpired(error: unknown): boolean {
  return toUserMessage(error) === AUTH_EXPIRED;
}
