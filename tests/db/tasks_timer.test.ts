import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, errorOf, type TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

async function addTask(uid: string, title: string, minutes = 20, kind = 'must'): Promise<string> {
  const rows = await db
    .as(uid)
    .q('insert into tasks (title, planned_minutes, kind) values ($1, $2, $3) returning id', [title, minutes, kind]);
  return rows[0].id;
}

describe('サインアップ/プロフィール', () => {
  it('プロフィールとstatsが作られ、フレンドコードは8文字', async () => {
    const u = await db.signup('ゆうき', { avatar: 'green' });
    const [p] = await db.admin('select * from profiles where id = $1', [u]);
    expect(p.nickname).toBe('ゆうき');
    expect(p.avatar).toBe('green');
    expect(p.friend_code).toMatch(/^[A-Z2-9]{8}$/);
    const [s] = await db.admin('select * from user_stats where user_id = $1', [u]);
    expect(s.xp).toBe(0);
  });

  it('不正なニックネーム/アバター/タイムゾーンは安全な値にフォールバック', async () => {
    const u = await db.signup('あ'.repeat(30), { avatar: 'dragon', timezone: 'Mars/Base' });
    const [p] = await db.admin('select * from profiles where id = $1', [u]);
    expect(p.nickname).toBe('ゲスト');
    expect(p.avatar).toBe('blue');
    expect(p.timezone).toBe('Asia/Tokyo');
  });
});

describe('タスク: 追加・編集・削除・並び替え', () => {
  it('追加すると todo で並び順が自動採番される', async () => {
    const u = await db.signup('a');
    await addTask(u, '英単語', 20);
    await addTask(u, '数学', 30);
    const rows = await db.as(u).q('select title, status, sort_order, task_date::text d from tasks order by sort_order');
    expect(rows.map((r) => r.title)).toEqual(['英単語', '数学']);
    expect(rows.map((r) => r.sort_order)).toEqual([1, 2]);
    expect(rows[0].status).toBe('todo');
    const [{ t }] = await db.admin('select public._user_today($1)::text t', [u]);
    expect(rows[0].d).toBe(t);
  });

  it('空/空白/長すぎるタイトルと不正な予定時間を拒否', async () => {
    const u = await db.signup('b');
    const bad = async (title: string, minutes: number) =>
      errorOf(db.as(u).q('insert into tasks (title, planned_minutes) values ($1, $2)', [title, minutes]));
    expect(await bad('', 10)).toMatch(/check|violates/);
    expect(await bad('   ', 10)).toMatch(/check|violates/);
    expect(await bad('あ'.repeat(41), 10)).toMatch(/check|violates/);
    expect(await bad('ok', 0)).toMatch(/check|violates/);
    expect(await bad('ok', -5)).toMatch(/check|violates/);
    expect(await bad('ok', 601)).toMatch(/check|violates/);
    expect(await bad('あ'.repeat(40), 600)).toBe('');
  });

  it('タイトルは前後の空白が除去される', async () => {
    const u = await db.signup('c');
    const id = await addTask(u, '  読書  ', 15);
    const [r] = await db.as(u).q('select title from tasks where id = $1', [id]);
    expect(r.title).toBe('読書');
  });

  it('過去日・遠すぎる未来日・1日21個目は拒否', async () => {
    const u = await db.signup('d');
    expect(
      await errorOf(
        db.as(u).q("insert into tasks (title, planned_minutes, task_date) values ('x', 10, public.app_today() - 1)"),
      ),
    ).toContain('SQ_TASK_DATE_INVALID');
    expect(
      await errorOf(
        db.as(u).q("insert into tasks (title, planned_minutes, task_date) values ('x', 10, public.app_today() + 8)"),
      ),
    ).toContain('SQ_TASK_DATE_INVALID');
    for (let i = 0; i < 20; i++) await addTask(u, `t${i}`, 5);
    expect(await errorOf(addTask(u, 'over', 5))).toContain('SQ_TASK_LIMIT');
  });

  it('編集(タイトル/時間/種別)と削除ができ、reorderで並び替えられる', async () => {
    const u = await db.signup('e');
    const a = await addTask(u, 'A');
    const b = await addTask(u, 'B');
    const c = await addTask(u, 'C');
    await db.as(u).q("update tasks set title = 'B2', planned_minutes = 45 where id = $1", [b]);
    await db.as(u).rpc('reorder_tasks', [c, a, b]);
    let rows = await db.as(u).q('select title, planned_minutes from tasks order by sort_order');
    expect(rows.map((r) => r.title)).toEqual(['C', 'A', 'B2']);
    expect(rows[2].planned_minutes).toBe(45);
    await db.as(u).q('delete from tasks where id = $1', [a]);
    rows = await db.as(u).q('select title from tasks order by sort_order');
    expect(rows.map((r) => r.title)).toEqual(['C', 'B2']);
  });

  it('他人のタスクに触れない/存在しないIDはエラー', async () => {
    const u1 = await db.signup('u1');
    const u2 = await db.signup('u2');
    const t = await addTask(u1, '秘密');
    expect(await db.as(u2).q('select * from tasks')).toHaveLength(0);
    expect(await db.as(u2).q("update tasks set title = 'hack' where id = $1 returning id", [t])).toHaveLength(0);
    expect(await db.as(u2).q('delete from tasks where id = $1 returning id', [t])).toHaveLength(0);
    expect(await errorOf(db.as(u2).rpc('complete_task', t))).toContain('SQ_TASK_NOT_FOUND');
    expect(await errorOf(db.as(u2).rpc('start_session', t))).toContain('SQ_TASK_NOT_FOUND');
    expect(await errorOf(db.as(u2).rpc('reorder_tasks', [t]))).toContain('SQ_TASK_NOT_FOUND');
    expect(await errorOf(db.as(u1).rpc('complete_task', '00000000-0000-0000-0000-000000000000'))).toContain(
      'SQ_TASK_NOT_FOUND',
    );
    // 他人のtask_id/user_idでの挿入はRLSで拒否
    expect(
      await errorOf(db.as(u2).q('insert into tasks (user_id, title, planned_minutes) values ($1, $2, 5)', [u1, 'x'])),
    ).toMatch(/permission denied|row-level security/);
  });

  it('クライアントは status/xp/達成テーブルを直接書き換えられない', async () => {
    const u = await db.signup('f');
    const t = await addTask(u, 'X');
    expect(await errorOf(db.as(u).q("update tasks set status = 'done' where id = $1", [t]))).toMatch(/permission denied/);
    expect(await errorOf(db.as(u).q('update tasks set xp_awarded = 999 where id = $1', [t]))).toMatch(/permission denied/);
    expect(await errorOf(db.as(u).q('update tasks set user_id = gen_random_uuid() where id = $1', [t]))).toMatch(
      /permission denied/,
    );
    expect(await errorOf(db.as(u).q("insert into tasks (title, planned_minutes, status) values ('y', 5, 'done')"))).toMatch(
      /permission denied/,
    );
    expect(
      await errorOf(db.as(u).q("insert into daily_completions (user_id, completed_date, must_total, streak_count) values ($1, current_date, 1, 1)", [u])),
    ).toMatch(/permission denied/);
    expect(await errorOf(db.as(u).q("insert into stamps (user_id, stamp_type, earned_date) values ($1, 'gold', current_date)", [u]))).toMatch(
      /permission denied/,
    );
    expect(await errorOf(db.as(u).q('update user_stats set xp = 99999'))).toMatch(/permission denied/);
    expect(await errorOf(db.as(u).q("update profiles set friend_code = 'AAAAAAAA'"))).toMatch(/permission denied/);
  });
});

describe('タイマー', () => {
  it('開始でdoing、一時停止/再開、終了で実学習時間が記録される', async () => {
    const u = await db.signup('timer');
    const t = await addTask(u, '数学', 30);
    const s = await db.as(u).rpc('start_session', t);
    expect(s.status).toBe('running');
    const [{ status }] = await db.as(u).q('select status from tasks where id = $1', [t]);
    expect(status).toBe('doing');

    // 10分経過したことにする(開始時刻ベースで計算されることの確認)
    await db.admin("update study_sessions set run_started_at = now() - interval '10 minutes', started_at = now() - interval '10 minutes' where id = $1", [s.id]);
    const paused = await db.as(u).rpc('pause_session', s.id);
    expect(paused.status).toBe('paused');
    expect(paused.accumulated_seconds).toBeGreaterThanOrEqual(600);
    expect(paused.accumulated_seconds).toBeLessThan(605);
    expect(paused.run_started_at).toBeNull();

    // 停止中の時間は加算されない
    await db.admin("update study_sessions set started_at = now() - interval '2 hours' where id = $1", [s.id]);
    const resumed = await db.as(u).rpc('resume_session', s.id);
    expect(resumed.status).toBe('running');
    expect(resumed.accumulated_seconds).toBe(paused.accumulated_seconds);

    await db.admin("update study_sessions set run_started_at = now() - interval '5 minutes' where id = $1", [s.id]);
    const res = await db.as(u).rpc('finish_session', s.id, true);
    expect(res.day.cleared).toBe(true); // このタスクだけなので達成
    const [row] = await db.as(u).q('select status, actual_seconds, ended_at, started_at from study_sessions where id = $1', [s.id]);
    expect(row.status).toBe('finished');
    expect(row.actual_seconds).toBeGreaterThanOrEqual(900);
    expect(row.actual_seconds).toBeLessThan(910);
    expect(row.ended_at).not.toBeNull();
    const [tk] = await db.as(u).q('select status, xp_awarded from tasks where id = $1', [t]);
    expect(tk.status).toBe('done');
    expect(tk.xp_awarded).toBe(15); // 15分学習 = 15XP
  });

  it('別タスクを開始すると実行中のタイマーは一時停止する(同時に走るのは1つ)', async () => {
    const u = await db.signup('timer2');
    const a = await addTask(u, 'A');
    const b = await addTask(u, 'B');
    const sa = await db.as(u).rpc('start_session', a);
    const sb = await db.as(u).rpc('start_session', b);
    const rows = await db.as(u).q('select task_id, status from study_sessions order by started_at');
    expect(rows.find((r) => r.task_id === a)?.status).toBe('paused');
    expect(rows.find((r) => r.task_id === b)?.status).toBe('running');
    // 同じタスクを再度startしても新しいセッションは増えない
    const again = await db.as(u).rpc('start_session', b);
    expect(again.id).toBe(sb.id);
    await db.as(u).rpc('resume_session', sa.id);
    const rows2 = await db.as(u).q("select count(*)::int n from study_sessions where status = 'running'");
    expect(rows2[0].n).toBe(1);
    const active = await db.as(u).rpc('get_active_session');
    expect(active.id).toBe(sa.id);
    expect((await db.as(u).rpc('get_session_state', b)).status).toBe('paused');
  });

  it('やめる(complete=false)は記録を残してタスクを未完了に戻す', async () => {
    const u = await db.signup('timer3');
    const t = await addTask(u, 'A');
    const s = await db.as(u).rpc('start_session', t);
    await db.as(u).rpc('finish_session', s.id, false);
    const [tk] = await db.as(u).q('select status from tasks where id = $1', [t]);
    expect(tk.status).toBe('todo');
    const [row] = await db.as(u).q('select status, actual_seconds from study_sessions where id = $1', [s.id]);
    expect(row.status).toBe('finished');
    expect(row.actual_seconds).not.toBeNull();
  });

  it('完了済みタスクは開始できない/他人のセッションは操作できない/終了済みは再開できない', async () => {
    const u1 = await db.signup('t1');
    const u2 = await db.signup('t2');
    const t = await addTask(u1, 'A');
    const s = await db.as(u1).rpc('start_session', t);
    expect(await errorOf(db.as(u2).rpc('pause_session', s.id))).toContain('SQ_SESSION_NOT_FOUND');
    expect(await errorOf(db.as(u2).rpc('finish_session', s.id, true))).toContain('SQ_SESSION_NOT_FOUND');
    expect(await db.as(u2).q('select * from study_sessions')).toHaveLength(0);
    await db.as(u1).rpc('finish_session', s.id, true);
    expect(await errorOf(db.as(u1).rpc('start_session', t))).toContain('SQ_TASK_ALREADY_DONE');
    expect(await errorOf(db.as(u1).rpc('resume_session', s.id))).toContain('SQ_SESSION_FINISHED');
    // 二重finishは冪等でXPは増えない
    const again = await db.as(u1).rpc('finish_session', s.id, true);
    expect(again.already_finished).toBe(true);
  });

  it('異常に長い放置でも学習時間は8時間で頭打ち', async () => {
    const u = await db.signup('cap');
    const t = await addTask(u, 'A', 600);
    const s = await db.as(u).rpc('start_session', t);
    await db.admin("update study_sessions set run_started_at = now() - interval '3 days' where id = $1", [s.id]);
    await db.as(u).rpc('finish_session', s.id, true);
    const [row] = await db.as(u).q('select actual_seconds from study_sessions where id = $1', [s.id]);
    expect(row.actual_seconds).toBe(28800);
  });
});
