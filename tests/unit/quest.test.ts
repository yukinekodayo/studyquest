import { describe, expect, it } from 'vitest';
import { moveWithinKind, mustProgress, pickNextTask, totalPlannedMinutes } from '@/domain/quest';

type T = { id: string; kind: 'must' | 'bonus'; status: 'todo' | 'doing' | 'done'; planned_minutes: number };
const t = (id: string, kind: T['kind'], status: T['status'], planned_minutes = 10): T => ({ id, kind, status, planned_minutes });

describe('今日のクエストの集計', () => {
  const tasks = [t('a', 'must', 'done', 20), t('b', 'must', 'todo', 30), t('c', 'must', 'done', 20), t('d', 'must', 'todo', 15), t('e', 'bonus', 'todo', 10)];
  it('達成数はボーナスを含まない(2/4)', () => {
    expect(mustProgress(tasks)).toEqual({ total: 4, done: 2, remaining: 2, cleared: false });
  });
  it('合計予定時間 = 1時間25分(85分)、ボーナスは含まない', () => {
    expect(totalPlannedMinutes(tasks)).toBe(85);
  });
  it('全部完了でクリア。絶対やるが0個ならクリアではない', () => {
    expect(mustProgress([t('a', 'must', 'done'), t('b', 'bonus', 'todo')]).cleared).toBe(true);
    expect(mustProgress([t('b', 'bonus', 'done')]).cleared).toBe(false);
    expect(mustProgress([]).cleared).toBe(false);
  });
});

describe('次のタスク', () => {
  it('勉強中があればそれ、なければ最初の未完了の絶対やる', () => {
    expect(pickNextTask([t('a', 'must', 'done'), t('b', 'must', 'todo'), t('c', 'must', 'doing')])?.id).toBe('c');
    expect(pickNextTask([t('a', 'must', 'done'), t('b', 'must', 'todo'), t('c', 'must', 'todo')])?.id).toBe('b');
  });
  it('絶対やるが終わったらボーナス、全部終わったら undefined', () => {
    expect(pickNextTask([t('a', 'must', 'done'), t('e', 'bonus', 'todo')])?.id).toBe('e');
    expect(pickNextTask([t('a', 'must', 'done'), t('e', 'bonus', 'done')])).toBeUndefined();
  });
  it('除外指定したタスクは選ばない', () => {
    expect(pickNextTask([t('a', 'must', 'todo'), t('b', 'must', 'todo')], 'a')?.id).toBe('b');
  });
});

describe('並び替え', () => {
  const list = [{ id: 'a', kind: 'must' as const }, { id: 'e', kind: 'bonus' as const }, { id: 'b', kind: 'must' as const }];
  it('同じ種類の中で入れ替わる(間のボーナスを飛び越える)', () => {
    expect(moveWithinKind(list, 'b', -1)).toEqual(['b', 'e', 'a']);
    expect(moveWithinKind(list, 'a', 1)).toEqual(['b', 'e', 'a']);
  });
  it('端では動かない/存在しないIDは null', () => {
    expect(moveWithinKind(list, 'a', -1)).toBeNull();
    expect(moveWithinKind(list, 'b', 1)).toBeNull();
    expect(moveWithinKind(list, 'zzz', 1)).toBeNull();
  });
});
