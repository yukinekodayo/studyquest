import { afterAll, beforeAll, expect, it } from 'vitest';
import { stampForStreak } from '@/domain/stamps';
import { createTestDb, type TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

it('TypeScriptのハンコ判定とSQLの判定が 0〜1000日すべて一致する', async () => {
  const rows = await db.admin('select n, public.stamp_for_streak(n) s from generate_series(1, 1000) n');
  for (const r of rows) expect(stampForStreak(Number(r.n)), `streak ${r.n}`).toBe(r.s);
});
