/**
 * タイマーの時間計算。setInterval のカウントには依存せず、
 * サーバーの「累積秒 + 走行開始時刻」と時計のずれから毎回計算する。
 * アプリを閉じても/バックグラウンドにしても、戻ったときに正しい時間になる。
 */
export const MAX_SESSION_SECONDS = 8 * 60 * 60;

export type SessionStatus = 'running' | 'paused' | 'finished';

export interface SessionState {
  id: string;
  task_id: string;
  status: SessionStatus;
  started_at: string;
  run_started_at: string | null;
  accumulated_seconds: number;
  actual_seconds: number | null;
  server_now: string;
}

/** サーバー時刻 - 端末時刻(ミリ秒)。端末時計がずれていても正しい経過時間を出す */
export function clockOffsetMs(serverNowIso: string, clientNowMs: number): number {
  return Date.parse(serverNowIso) - clientNowMs;
}

export function elapsedSeconds(
  s: Pick<SessionState, 'status' | 'run_started_at' | 'accumulated_seconds' | 'actual_seconds'>,
  clientNowMs: number,
  offsetMs: number,
): number {
  if (s.status === 'finished') return s.actual_seconds ?? s.accumulated_seconds;
  let total = s.accumulated_seconds;
  if (s.status === 'running' && s.run_started_at) {
    const seg = Math.floor((clientNowMs + offsetMs - Date.parse(s.run_started_at)) / 1000);
    total += Math.max(0, seg);
  }
  return Math.min(total, MAX_SESSION_SECONDS);
}

export function remainingSeconds(plannedMinutes: number, elapsed: number): number {
  return plannedMinutes * 60 - elapsed;
}

/** 残り時間の円グラフ用(0〜1)。超過したら0 */
export function remainingFraction(plannedMinutes: number, elapsed: number): number {
  const total = plannedMinutes * 60;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, (total - elapsed) / total));
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** 18:42 / 1:05:09 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** 11分 / 5分40秒 / 30秒 */
export function formatElapsedJa(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}秒`;
  return sec === 0 ? `${m}分` : `${m}分${sec}秒`;
}

/** 85 → 1時間25分 / 60 → 1時間 / 20 → 20分 */
export function formatPlanned(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}分`;
  return r === 0 ? `${h}時間` : `${h}時間${r}分`;
}
