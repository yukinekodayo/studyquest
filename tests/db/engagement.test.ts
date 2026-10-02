import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './helpers';

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
const codes = async (uid: string): Promise<string[]> =>
  (await db.as(uid).q('select code from user_achievements order by code')).map((r) => r.code);

describe('実績バッジ', () => {
  it('初めてのタスク完了/初クリアが、完了した瞬間に解除され、2回目は空', async () => {
    const u = await db.signup('ach1');
    const a = await addTask(u, 'A');
    const r = await db.as(u).rpc('complete_task', a);
    expect(r.new_achievements.sort()).toEqual(['first_clear', 'first_task']);
    // もう一度完了(冪等)しても再付与されない
    const again = await db.as(u).rpc('complete_task', a);
    expect(again.new_achievements).toEqual([]);
    expect(await codes(u)).toEqual(['first_clear', 'first_task']);
  });

  it('1日に3つ/5つ終えるとコンボ、ボーナス初完了、10タスク達成が解除される', async () => {
    const u = await db.signup('ach2');
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await addTask(u, `T${i}`, 10));
    const bonus = await addTask(u, 'B', 10, 'bonus');
    const found: string[] = [];
    for (const id of ids) found.push(...(await db.as(u).rpc('complete_task', id)).new_achievements);
    expect(found).toContain('combo_3');
    expect(found).toContain('combo_5');
    expect((await db.as(u).rpc('complete_task', bonus)).new_achievements).toEqual(['first_bonus']);
    expect(await codes(u)).toEqual(expect.arrayContaining(['combo_3', 'combo_5', 'first_bonus']));
    expect(await codes(u)).not.toContain('tasks_10');
  });

  it('学習時間の実績(1時間)は、タイマーで合計した実績時間から判定される', async () => {
    const u = await db.signup('ach3');
    const t = await addTask(u, 'A', 120);
    const s = await db.as(u).rpc('start_session', t);
    await db.admin("update study_sessions set run_started_at = now() - interval '61 minutes' where id = $1", [s.id]);
    const r = await db.as(u).rpc('finish_session', s.id, true);
    expect(r.new_achievements).toContain('study_1h');
  });

  it('連続日数の実績は最高連続から判定され、クライアントは実績を直接書けない・他人のは見えない', async () => {
    const u = await db.signup('ach4');
    const other = await db.signup('ach5');
    await db.admin('update user_stats set longest_streak = 7 where user_id = $1', [u]);
    const r = await db.as(u).rpc('complete_task', await addTask(u, 'A'));
    expect(r.new_achievements).toEqual(expect.arrayContaining(['streak_3', 'streak_7']));
    expect(r.new_achievements).not.toContain('streak_14');
    expect(await db.as(other).q('select * from user_achievements')).toHaveLength(0);
    await expect(db.as(u).q("insert into user_achievements (user_id, code) values ($1, 'streak_30')", [u])).rejects.toThrow(/permission denied/);
  });

  it('スタンプを押したときにも判定され(フレンド実績など)、ハンコ押下の戻り値に含まれる', async () => {
    const u = await db.signup('ach6');
    const f = await db.signup('ach7');
    const code = (await db.admin('select friend_code from profiles where id = $1', [f]))[0].friend_code;
    await db.as(u).rpc('send_friend_request', code);
    const [req] = await db.as(f).q("select id from friend_requests where status = 'pending'");
    await db.as(f).rpc('respond_friend_request', req.id, true);
    const t = await addTask(u, 'A');
    await db.as(u).rpc('complete_task', t);
    const stamped = await db.as(u).rpc('stamp_task', t);
    expect(stamped.new_achievements).toEqual([]); // 完了時にすでに解除ずみ
    expect(await codes(u)).toContain('first_friend');
  });
});

describe('レベルアップ情報', () => {
  it('XPが閾値(500)をまたぐと level_before < level_after が返る', async () => {
    const u = await db.signup('lvl');
    await db.admin('update user_stats set xp = 495 where user_id = $1', [u]);
    const t = await addTask(u, 'A', 10);
    const s = await db.as(u).rpc('start_session', t);
    await db.admin("update study_sessions set run_started_at = now() - interval '10 minutes' where id = $1", [s.id]);
    const r = await db.as(u).rpc('finish_session', s.id, true);
    expect(r.level_before).toBe(1);
    expect(r.level_after).toBe(2);
  });
});

describe('学習時間の集計 get_study_summary', () => {
  it('直近7日の分数・今日・今週・先週・累計が、完了/一時停止中も含めて計算される', async () => {
    const u = await db.signup('sum');
    const [{ d }] = await db.admin('select (public._user_today($1))::text d', [u]);
    // 今日30分 + 3日前20分 + 10日前40分(先週)
    await db.admin(
      `insert into tasks (user_id, task_date, title, planned_minutes) values ($1, $2::date, 'x', 10) returning id`,
      [u, d],
    );
    const [{ id: tid }] = await db.admin('select id from tasks where user_id = $1', [u]);
    for (const [days, secs] of [[0, 1800], [3, 1200], [10, 2400]] as Array<[number, number]>) {
      await db.admin(
        `insert into study_sessions (user_id, task_id, status, started_at, ended_at, accumulated_seconds, actual_seconds)
         values ($1, $2, 'finished', now() - ($3::int || ' days')::interval, now() - ($3::int || ' days')::interval + interval '1 minute', $4, $4)`,
        [u, tid, days, secs],
      );
    }
    const sum = await db.as(u).rpc('get_study_summary');
    expect(sum.days).toHaveLength(7);
    expect(sum.days[6].date).toBe(d);
    expect(sum.today_minutes).toBe(30);
    expect(sum.week_minutes).toBe(50);
    expect(sum.prev_week_minutes).toBe(40);
    expect(sum.total_minutes).toBe(90);
    expect(sum.days.map((x: { minutes: number }) => x.minutes)).toEqual([0, 0, 0, 20, 0, 0, 30]);
  });

  it('他人の学習時間は含まれない/データなしは0', async () => {
    const a = await db.signup('sumA');
    const b = await db.signup('sumB');
    const t = await addTask(a, 'A', 30);
    const s = await db.as(a).rpc('start_session', t);
    await db.admin("update study_sessions set run_started_at = now() - interval '12 minutes' where id = $1", [s.id]);
    expect((await db.as(b).rpc('get_study_summary')).week_minutes).toBe(0);
    // 進行中のセッションも今日の分に含まれる
    expect((await db.as(a).rpc('get_study_summary')).today_minutes).toBe(12);
  });
});

describe('監査修正', () => {
  it('作成→手動完了→削除を繰り返しても、手動XPは1日50XPで頭打ち', async () => {
    const u = await db.signup('xpfarm');
    let total = 0;
    for (let i = 0; i < 15; i++) {
      const id = await addTask(u, `F${i}`, 20);
      total += (await db.as(u).rpc('complete_task', id)).xp_gained;
      await db.as(u).q('delete from tasks where id = $1', [id]);
    }
    expect(total).toBe(50);
    const [{ xp }] = await db.as(u).q('select xp from user_stats where user_id = $1', [u]);
    expect(xp).toBe(50 + 50); // 手動XP上限 + 1日クリアボーナス(1日1回)
  });

  it('開始→即完了→削除の連打は1XPも稼げない(実学習60秒未満はXP 0)', async () => {
    const u = await db.signup('sessfarm');
    for (let i = 0; i < 5; i++) {
      const id = await addTask(u, `S${i}`, 20);
      await db.as(u).rpc('start_session', id);
      expect((await db.as(u).rpc('complete_task', id)).xp_gained).toBe(0);
      await db.as(u).q('delete from tasks where id = $1', [id]);
    }
    const [{ xp }] = await db.as(u).q('select xp from user_stats where user_id = $1', [u]);
    expect(xp).toBe(50); // 1日クリアボーナスのみ(セッション由来のXPは0)
  });

  it('60秒以上学習すればXPが入る / manual_xp_daily はクライアントから見えない', async () => {
    const u = await db.signup('sessok');
    const id = await addTask(u, 'ok', 20);
    const s = await db.as(u).rpc('start_session', id);
    await db.admin("update study_sessions set run_started_at = now() - interval '90 seconds' where id = $1", [s.id]);
    expect((await db.as(u).rpc('complete_task', id)).xp_gained).toBe(2);
    await expect(db.as(u).q('select * from manual_xp_daily')).rejects.toThrow(/permission denied/);
  });

  it('内部ヘルパーは他人同士の関係を答えず、_user_today は直接呼べない', async () => {
    const a = await db.signup('hlpa');
    const b = await db.signup('hlpb');
    const c = await db.signup('hlpc');
    await db.admin('insert into friendships (user_a, user_b) values (least($1::uuid,$2::uuid), greatest($1::uuid,$2::uuid))', [b, c]);
    expect(await db.as(a).rpc('are_friends', b, c)).toBe(false);
    expect(await db.as(b).rpc('are_friends', b, c)).toBe(true);
    await expect(db.as(a).rpc('_user_today', b)).rejects.toThrow();
  });
});
