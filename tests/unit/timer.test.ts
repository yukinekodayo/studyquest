import { describe, expect, it } from 'vitest';
import {
  clockOffsetMs, elapsedSeconds, formatClock, formatElapsedJa, formatPlanned,
  remainingFraction, remainingSeconds, MAX_SESSION_SECONDS,
} from '@/domain/timer';

const T0 = Date.parse('2026-09-30T06:00:00Z');

describe('経過時間は開始時刻から計算される(setIntervalに依存しない)', () => {
  it('走行中: 累積 + (現在 - 走行開始)', () => {
    const s = { status: 'running' as const, run_started_at: '2026-09-30T06:00:00Z', accumulated_seconds: 120, actual_seconds: null };
    expect(elapsedSeconds(s, T0 + 30_000, 0)).toBe(150);
    // 10分間アプリを閉じていても、戻ったら正しい値
    expect(elapsedSeconds(s, T0 + 10 * 60_000, 0)).toBe(120 + 600);
  });
  it('一時停止中は増えない', () => {
    const s = { status: 'paused' as const, run_started_at: null, accumulated_seconds: 300, actual_seconds: null };
    expect(elapsedSeconds(s, T0 + 999_000, 0)).toBe(300);
  });
  it('終了後は確定した実学習時間', () => {
    const s = { status: 'finished' as const, run_started_at: null, accumulated_seconds: 300, actual_seconds: 290 };
    expect(elapsedSeconds(s, T0, 0)).toBe(290);
  });
  it('端末時計がずれていてもサーバー時刻基準で補正される', () => {
    const serverNow = '2026-09-30T06:05:00Z';
    const clientNow = T0 - 60 * 60_000; // 端末は1時間遅れ
    const offset = clockOffsetMs(serverNow, clientNow);
    const s = { status: 'running' as const, run_started_at: '2026-09-30T06:00:00Z', accumulated_seconds: 0, actual_seconds: null };
    expect(elapsedSeconds(s, clientNow, offset)).toBe(300);
    expect(elapsedSeconds(s, clientNow + 5_000, offset)).toBe(305);
  });
  it('負の値にならず、8時間で頭打ち', () => {
    const s = { status: 'running' as const, run_started_at: '2026-09-30T06:00:10Z', accumulated_seconds: 0, actual_seconds: null };
    expect(elapsedSeconds(s, T0, 0)).toBe(0);
    expect(elapsedSeconds(s, T0 + 3 * 24 * 3600_000, 0)).toBe(MAX_SESSION_SECONDS);
  });
});

describe('表示', () => {
  it('残り時間', () => {
    expect(remainingSeconds(30, 11 * 60 + 18)).toBe(18 * 60 + 42);
    expect(remainingSeconds(30, 31 * 60)).toBe(-60);
    expect(remainingFraction(30, 0)).toBe(1);
    expect(remainingFraction(30, 15 * 60)).toBe(0.5);
    expect(remainingFraction(30, 99 * 60)).toBe(0);
  });
  it('formatClock', () => {
    expect(formatClock(18 * 60 + 42)).toBe('18:42');
    expect(formatClock(9 * 60 + 20)).toBe('09:20');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(-5)).toBe('00:00');
    expect(formatClock(3600 + 5 * 60 + 9)).toBe('1:05:09');
  });
  it('formatElapsedJa', () => {
    expect(formatElapsedJa(11 * 60)).toBe('11分');
    expect(formatElapsedJa(5 * 60 + 40)).toBe('5分40秒');
    expect(formatElapsedJa(30)).toBe('30秒');
  });
  it('formatPlanned: 合計予定時間', () => {
    expect(formatPlanned(20 + 30 + 20 + 15)).toBe('1時間25分');
    expect(formatPlanned(60)).toBe('1時間');
    expect(formatPlanned(45)).toBe('45分');
    expect(formatPlanned(0)).toBe('0分');
  });
});
