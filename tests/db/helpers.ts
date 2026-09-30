import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { TEMPLATE_DB } from './globalSetup';

export type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface TestDb {
  /** スーパーユーザー(RLS無視)で実行 */
  admin: (sql: string, params?: unknown[]) => Promise<Row[]>;
  /** authenticated ロール + auth.uid() = userId で1トランザクション実行 */
  as: (userId: string) => {
    q: (sql: string, params?: unknown[]) => Promise<Row[]>;
    rpc: (fn: string, ...args: unknown[]) => Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  signup: (nickname: string, extra?: Record<string, unknown>) => Promise<string>;
  close: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL!;
  const name = `t_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const root = new pg.Client({ connectionString: adminUrl });
  await root.connect();
  await root.query(`create database ${name} template ${TEMPLATE_DB}`);
  await root.end();

  const pool = new pg.Pool({
    connectionString: adminUrl.replace(/\/[^/]*$/, `/${name}`),
    max: 4,
  });

  const admin: TestDb['admin'] = async (sql, params) => (await pool.query(sql, params as unknown[])).rows;

  const as: TestDb['as'] = (userId) => {
    const q = async (sql: string, params?: unknown[]) => {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query('set local role authenticated');
        await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        const res = await c.query(sql, params as unknown[]);
        await c.query('commit');
        return res.rows;
      } catch (e) {
        await c.query('rollback');
        throw e;
      } finally {
        c.release();
      }
    };
    const rpc = async (fn: string, ...args: unknown[]) => {
      const ph = args.map((_, i) => `$${i + 1}`).join(', ');
      const rows = await q(`select public.${fn}(${ph}) as r`, args.map((a) => (Array.isArray(a) ? a : a)));
      return rows[0]?.r;
    };
    return { q, rpc };
  };

  const signup: TestDb['signup'] = async (nickname, extra = {}) => {
    const id = randomUUID();
    await admin('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
      id,
      `${id}@example.com`,
      JSON.stringify({ nickname, ...extra }),
    ]);
    return id;
  };

  return { admin, as, signup, close: () => pool.end() };
}

/** テキストのエラーコード(SQ_...)を取り出す */
export async function errorOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  return '';
}
