import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, achievementOf, toAchievementDefs } from '@/domain/achievements';
import { comboMessage, greetingFor, remainingLabel, weekDeltaLabel, weekdayLabel } from '@/domain/messages';

describe('実績の定義', () => {
  it('SQLの _award_achievements のコードと、TypeScriptの定義が完全に一致する', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../supabase/migrations/20260930000006_engagement.sql'), 'utf8');
    const block = sql.slice(sql.indexOf('with cand(code, ok)'), sql.indexOf('), ins as ('));
    const sqlCodes = [...block.matchAll(/\('([a-z0-9_]+)',/g)].map((m) => m[1]).sort();
    expect(sqlCodes.length).toBeGreaterThan(10);
    expect(ACHIEVEMENTS.map((a) => a.code).sort()).toEqual(sqlCodes);
  });
  it('コードは重複せず、名前と説明がある', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.code)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.name && a.description).toBeTruthy();
  });
  it('解除コードを表示順の定義に変換(未知のコードは無視)', () => {
    expect(toAchievementDefs(['streak_7', 'first_task', 'unknown']).map((a) => a.code)).toEqual(['first_task', 'streak_7']);
    expect(toAchievementDefs(undefined)).toEqual([]);
    expect(achievementOf('first_clear')?.name).toBe('初クリア');
  });
});

describe('メッセージ', () => {
  it('時間帯のあいさつ', () => {
    expect(greetingFor(6)).toBe('おはよう');
    expect(greetingFor(10)).toBe('おはよう');
    expect(greetingFor(11)).toBe('こんにちは');
    expect(greetingFor(17)).toBe('こんにちは');
    expect(greetingFor(18)).toBe('こんばんは');
    expect(greetingFor(2)).toBe('こんばんは');
  });
  it('タスクを終えたときの一言は、勢いを後押しする', () => {
    expect(comboMessage(4, 0)).toContain('ぜんぶ終わりました');
    expect(comboMessage(3, 1)).toContain('あと1つ');
    expect(comboMessage(1, 3)).toContain('まず1つ');
    expect(comboMessage(2, 2)).toContain('2つ目');
    expect(comboMessage(3, 2)).toContain('3つ目');
    expect(comboMessage(6, 2)).toContain('6つ目');
  });
  it('ホームの残り表示', () => {
    expect(remainingLabel(3, 4)).toBe('あと3つ');
    expect(remainingLabel(1, 4)).toBe('ラスト1つ');
    expect(remainingLabel(0, 4)).toBe('ぜんぶ達成');
    expect(remainingLabel(0, 0)).toBe('');
  });
  it('先週との比較は、増えたときだけ前向きに伝える', () => {
    expect(weekDeltaLabel(150, 130)).toBe('先週より +20分');
    expect(weekDeltaLabel(100, 130)).toBeNull();
    expect(weekDeltaLabel(100, 100)).toBeNull();
    expect(weekDeltaLabel(100, 0)).toBeNull();
  });
  it('曜日', () => {
    expect(weekdayLabel('2026-09-30')).toBe('水');
    expect(weekdayLabel('2026-10-04')).toBe('日');
  });
});
