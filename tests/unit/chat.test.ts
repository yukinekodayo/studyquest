import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatChatTime, isQuietHour, QUICK_PHRASES, REPORT_REASONS, unreadLabel } from '@/domain/chat';
import { toUserMessage } from '@/domain/errors';

describe('チャットのルール(TypeScript と SQL で一致)', () => {
  const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260930000009_chat.sql'), 'utf8');
  it('定型の一言が SQL と完全に一致する', () => {
    const m = /_quick_phrases\(\)[\s\S]*?array\[(.*?)\]/.exec(sql);
    const sqlPhrases = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect([...QUICK_PHRASES]).toEqual(sqlPhrases);
  });
  it('通報の理由が SQL の制約と一致する', () => {
    const m = /reason\s+text not null check \(reason in \((.*?)\)\)/.exec(sql);
    const sqlReasons = [...(m?.[1] ?? '').matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(REPORT_REASONS.map((r) => r.value)).toEqual(sqlReasons);
  });
  it('夜の時間帯(22時〜7時)がSQLと同じ境界', () => {
    expect(sql).toContain('hr >= 22 or hr < 7');
    expect(isQuietHour(21)).toBe(false);
    expect(isQuietHour(22)).toBe(true);
    expect(isQuietHour(0)).toBe(true);
    expect(isQuietHour(6)).toBe(true);
    expect(isQuietHour(7)).toBe(false);
  });
});

describe('表示', () => {
  const now = new Date(2026, 9, 3, 15, 0, 0);
  it('時刻の表示', () => {
    expect(formatChatTime(new Date(2026, 9, 3, 14, 59, 40).toISOString(), now)).toBe('たった今');
    expect(formatChatTime(new Date(2026, 9, 3, 9, 5).toISOString(), now)).toBe('9:05');
    expect(formatChatTime(new Date(2026, 9, 2, 20, 30).toISOString(), now)).toBe('昨日 20:30');
    expect(formatChatTime(new Date(2026, 8, 20, 8, 0).toISOString(), now)).toBe('9/20');
  });
  it('未読バッジ', () => {
    expect(unreadLabel(3)).toBe('3');
    expect(unreadLabel(100)).toBe('99+');
  });
});

describe('チャットのエラー文言(やさしく、具体的に)', () => {
  it('送れなかった理由が分かる', () => {
    expect(toUserMessage({ message: 'SQ_MSG_QUIET' })).toContain('22時');
    expect(toUserMessage({ message: 'SQ_MSG_PERSONAL' })).toContain('個人情報');
    expect(toUserMessage({ message: 'SQ_MSG_NG' })).toContain('不適切');
    expect(toUserMessage({ message: 'SQ_MSG_RATE' })).toContain('少し待って');
    expect(toUserMessage({ message: 'SQ_MSG_BLOCKED' })).toContain('やりとり');
  });
  it('つらい気持ちの言葉には、責めずに信頼できる大人への相談をすすめる', () => {
    const m = toUserMessage({ message: 'SQ_MSG_CARE' });
    expect(m).toContain('信頼できる大人');
    expect(m).not.toMatch(/禁止|違反|エラー/);
  });
});
