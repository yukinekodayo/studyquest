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

/** 今日を含まない、連続した達成日を過去に作る(最後の日=昨日のstreakが lastStreak) */
async function seedStreak(uid: string, lastStreak: number, gapDays = 0): Promise<void> {
  for (let k = 0; k < lastStreak; k++) {
    // k=0 が昨日(gapDays日ずらせる)
    const daysAgo = 1 + gapDays + k;
    const streak = lastStreak - k;
    await db.admin(
      `insert into daily_completions (user_id, completed_date, must_total, streak_count)
       values ($1, public._user_today($1) - $2::int, 1, $3)`,
      [uid, daysAgo, streak],
    );
    await db.admin(
      `insert into stamps (user_id, stamp_type, earned_date, streak_count)
       values ($1, public.stamp_for_streak($3), public._user_today($1) - $2::int, $3)`,
      [uid, daysAgo, streak],
    );
  }
  await db.admin(
    `update user_stats set current_streak = $2, longest_streak = $2, total_days = $2,
       last_completed_date = public._user_today($1) - $3::int where user_id = $1`,
    [uid, lastStreak, 1 + gapDays],
  );
}

async function claim(uid: string, date?: string) {
  return db.as(uid).rpc('claim_stamp', date ?? null);
}

async function clearToday(uid: string) {
  const t = await addTask(uid, '今日の1個', 10);
  return db.as(uid).rpc('complete_task', t);
}

describe('stamp_for_streak: 7/30/60/100 の境界', () => {
  const cases: Array<[number, string]> = [
    [1, 'normal'], [2, 'normal'], [6, 'normal'],
    [7, 'blue'], [8, 'normal'], [14, 'blue'], [29, 'normal'],
    [30, 'green'], [31, 'normal'], [59, 'normal'],
    [60, 'gold'], [61, 'normal'], [99, 'normal'],
    [100, 'special'], [101, 'normal'], [200, 'special'],
  ];
  it.each(cases)('連続%i日 → %s', async (n, expected) => {
    const [r] = await db.admin('select public.stamp_for_streak($1) s', [n]);
    expect(r.s).toBe(expected);
  });
});

describe('1日の完全達成', () => {
  it('全部完了した瞬間に達成し、ハンコが1つ付く', async () => {
    const u = await db.signup('clear');
    const ids = [
      await addTask(u, '英単語', 20),
      await addTask(u, '数学', 30),
      await addTask(u, '宿題', 20),
      await addTask(u, '読書', 15),
    ];
    for (const id of ids.slice(0, 3)) {
      const r = await db.as(u).rpc('complete_task', id);
      expect(r.day.cleared).toBe(false);
      expect(r.day.must_done).toBeGreaterThan(0);
    }
    const last = await db.as(u).rpc('complete_task', ids[3]);
    expect(last.day).toMatchObject({ cleared: true, newly_cleared: true, must_total: 4, must_done: 4, streak: 1, stamp_type: 'normal' });
    expect(await db.as(u).q('select * from daily_completions')).toHaveLength(1);
    // ハンコはユーザーが押すまで作られない
    expect(await db.as(u).q('select * from stamps')).toHaveLength(0);
    expect(await claim(u)).toMatchObject({ stamp_type: 'normal', streak: 1, newly_claimed: true });
    expect(await db.as(u).q('select * from stamps')).toHaveLength(1);
  });

  it('同じ日に何度完了/未完了を繰り返してもハンコ・達成・XPは二重にならない', async () => {
    const u = await db.signup('dup');
    const a = await addTask(u, 'A', 30);
    const first = await db.as(u).rpc('complete_task', a);
    expect(first.day.newly_cleared).toBe(true);
    const xp1 = (await db.as(u).rpc('get_my_stats')).xp;
    const again = await db.as(u).rpc('complete_task', a);
    expect(again.day).toMatchObject({ cleared: true, newly_cleared: false });
    expect(again.xp_gained).toBe(0);
    await db.as(u).rpc('uncomplete_task', a);
    const re = await db.as(u).rpc('complete_task', a);
    expect(re.day.newly_cleared).toBe(false);
    expect(re.xp_gained).toBe(0);
    expect((await db.as(u).rpc('get_my_stats')).xp).toBe(xp1);
    // 追加タスクを作って完了しても、その日のハンコは増えない
    const b = await addTask(u, 'B');
    const r = await db.as(u).rpc('complete_task', b);
    expect(r.day.newly_cleared).toBe(false);
    await claim(u);
    expect((await claim(u)).newly_claimed).toBe(false); // 2回押しても1つだけ
    expect(await db.as(u).q('select * from stamps')).toHaveLength(1);
    const st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ total_days: 1, current_streak: 1, longest_streak: 1, cleared_today: true });
  });

  it('「できたらやる」だけでは達成にならず、絶対やるが0個でも達成しない', async () => {
    const u = await db.signup('bonus');
    const b = await addTask(u, 'ボーナス', 10, 'bonus');
    const r = await db.as(u).rpc('complete_task', b);
    expect(r.day.cleared).toBe(false);
    const m = await addTask(u, '必須', 10, 'must');
    const r2 = await db.as(u).rpc('complete_task', m);
    expect(r2.day.newly_cleared).toBe(true);
  });

  it('最後の未完了タスクを削除/ボーナス化した場合も、サーバー側で達成判定される', async () => {
    const u = await db.signup('del');
    const a = await addTask(u, 'A');
    const b = await addTask(u, 'B');
    await db.as(u).rpc('complete_task', a);
    expect(await db.as(u).q('select * from daily_completions')).toHaveLength(0);
    await db.as(u).q('delete from tasks where id = $1', [b]);
    expect(await db.as(u).q('select * from daily_completions')).toHaveLength(1);

    const u2 = await db.signup('kind');
    const c = await addTask(u2, 'C');
    const d = await addTask(u2, 'D');
    await db.as(u2).rpc('complete_task', c);
    await db.as(u2).q("update tasks set kind = 'bonus' where id = $1", [d]);
    expect(await db.as(u2).q('select * from daily_completions')).toHaveLength(1);
  });

  it('達成後にタスクを削除しても、ハンコ・達成記録は消えない', async () => {
    const u = await db.signup('keep');
    const a = await addTask(u, 'A');
    await db.as(u).rpc('complete_task', a);
    await claim(u);
    await db.as(u).q('delete from tasks');
    expect(await db.as(u).q('select * from stamps')).toHaveLength(1);
    expect((await db.as(u).rpc('get_my_stats')).total_days).toBe(1);
  });

  it('XP: タイマーなしの手動完了は控えめ、タイマーは学習時間ぶん(予定が上限)', async () => {
    const u = await db.signup('xp');
    const a = await addTask(u, 'A', 30);
    const r = await db.as(u).rpc('complete_task', a);
    expect(r.xp_gained).toBe(5);
    const b = await addTask(u, 'B', 10);
    const s = await db.as(u).rpc('start_session', b);
    await db.admin("update study_sessions set run_started_at = now() - interval '25 minutes' where id = $1", [s.id]);
    const r2 = await db.as(u).rpc('finish_session', s.id, true);
    expect(r2.xp_gained).toBe(10); // 予定10分が上限
    const st = await db.as(u).rpc('get_my_stats');
    expect(st.xp).toBe(5 + 10 + 50); // +達成ボーナス50
    expect(st.level).toBe(1);
  });

  it('過去日のタスクは完了できない(後出しで連続を作れない)', async () => {
    const u = await db.signup('past');
    const a = await addTask(u, 'A');
    await db.admin("update tasks set task_date = task_date - 1 where id = $1", [a]);
    expect(await db.as(u).rpc('complete_task', a).catch((e) => e.message)).toContain('SQ_TASK_NOT_TODAY');
    expect(await db.as(u).rpc('start_session', a).catch((e) => e.message)).toContain('SQ_TASK_NOT_TODAY');
  });
});

describe('連続日数とハンコの境界(サーバー判定)', () => {
  // 昨日までの連続 = N-1 のとき、今日達成すると連続 N
  const cases: Array<[number, string]> = [
    [1, 'normal'], [2, 'normal'], [6, 'blue'], [7, 'normal'], [13, 'blue'],
    [29, 'green'], [30, 'normal'], [59, 'gold'], [60, 'normal'],
    [99, 'special'], [100, 'normal'],
  ];
  it.each(cases)('昨日まで連続%i日 → 今日達成でハンコが決まる', async (prev, _) => {
    const u = await db.signup(`streak${prev}`);
    if (prev > 0) await seedStreak(u, prev);
    const r = await clearToday(u);
    const n = prev + 1;
    const [exp] = await db.admin('select public.stamp_for_streak($1) s', [n]);
    expect(r.day).toMatchObject({ newly_cleared: true, streak: n, stamp_type: exp.s });
    expect(await claim(u)).toMatchObject({ stamp_type: exp.s, streak: n });
    const stamps = await db.as(u).q('select stamp_type, streak_count from stamps order by earned_date desc limit 1');
    expect(stamps[0]).toMatchObject({ stamp_type: exp.s, streak_count: n });
    const st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ current_streak: n, longest_streak: n, total_days: n });
  });

  it('連続7/30/60/100日目に、それぞれ 青/緑/金/特別 ハンコが付く', async () => {
    const expected: Record<number, string> = { 7: 'blue', 30: 'green', 60: 'gold', 100: 'special' };
    for (const [n, type] of Object.entries(expected)) {
      const u = await db.signup(`ms${n}`);
      await seedStreak(u, Number(n) - 1);
      const r = await clearToday(u);
      expect(r.day.stamp_type).toBe(type);
      expect(r.day.streak).toBe(Number(n));
      expect((await claim(u)).stamp_type).toBe(type);
    }
  });

  it('1日休むと連続はリセット。ただし過去のハンコ・最高連続・累計は残る', async () => {
    const u = await db.signup('reset');
    await seedStreak(u, 8, 1); // 一昨日まで8日連続、昨日は休み
    // 今日の時点(まだ未達成)でも連続は0表示、累計・最高は保持
    let st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ current_streak: 0, longest_streak: 8, total_days: 8 });
    const r = await clearToday(u);
    expect(r.day).toMatchObject({ streak: 1, stamp_type: 'normal' });
    await claim(u);
    st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ current_streak: 1, longest_streak: 8, total_days: 9 });
    const stamps = await db.as(u).q('select count(*)::int n, count(*) filter (where stamp_type = \'blue\')::int blue from stamps');
    expect(stamps[0]).toMatchObject({ n: 9, blue: 1 }); // 過去の7日目の青ハンコが残っている
  });

  it('リセット後も過去に獲得した青ハンコは消えない', async () => {
    const u = await db.signup('keepblue');
    await seedStreak(u, 7, 3);
    await clearToday(u);
    await claim(u);
    const st = await db.as(u).rpc('get_my_stats');
    expect(st.stamp_counts.blue).toBe(1);
    expect(st.stamp_counts.normal).toBe(7); // 1..6 と今日の1
    expect(st.current_streak).toBe(1);
    expect(st.longest_streak).toBe(7);
  });

  it('連続数は「昨日の達成」から決まる(昨日達成していれば+1)', async () => {
    const u = await db.signup('yday');
    await seedStreak(u, 3);
    const st0 = await db.as(u).rpc('get_my_stats');
    expect(st0.current_streak).toBe(3); // 昨日達成 → 今日まだでも連続は維持表示
    const r = await clearToday(u);
    expect(r.day.streak).toBe(4);
  });

  it('月の達成数が集計される', async () => {
    const u = await db.signup('month');
    await clearToday(u);
    const st = await db.as(u).rpc('get_my_stats');
    expect(st.month_days).toBeGreaterThanOrEqual(1);
  });
});

describe('ハンコを押す(claim_stamp)', () => {
  it('達成しても押すまでハンコは無く、押し忘れても連続日数は途切れない', async () => {
    const u = await db.signup('claim');
    await clearToday(u);
    let st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ cleared_today: true, today_stamp_claimed: false, today_stamp_type: 'normal', today_streak: 1 });
    expect(st.unclaimed_dates).toHaveLength(1);
    expect(st.stamp_counts).toEqual({});
    expect(st).toMatchObject({ current_streak: 1, total_days: 1 });
    await claim(u);
    st = await db.as(u).rpc('get_my_stats');
    expect(st).toMatchObject({ today_stamp_claimed: true, unclaimed_dates: [] });
    expect(st.stamp_counts).toEqual({ normal: 1 });
  });

  it('達成していない日は押せない(未来日・他人の達成日も不可)', async () => {
    const u = await db.signup('noclear');
    const other = await db.signup('other');
    await addTask(u, 'A');
    expect(await claim(u).catch((e) => e.message)).toContain('SQ_NOT_CLEARED');
    await clearToday(other);
    const [{ d }] = await db.admin('select (public._user_today($1))::text d', [other]);
    expect(await claim(u, d).catch((e) => e.message)).toContain('SQ_NOT_CLEARED');
    expect(await claim(u, '2999-01-01').catch((e) => e.message)).toContain('SQ_NOT_CLEARED');
    expect(await db.as(u).q('select * from stamps')).toHaveLength(0);
  });

  it('押し忘れた過去の日も、後から押せる(種類はその日の連続日数で決まる)', async () => {
    const u = await db.signup('late');
    // 6日連続(=昨日まで)を達成だけして押していない状態にする
    for (let k = 0; k < 6; k++) {
      await db.admin(
        `insert into daily_completions (user_id, completed_date, must_total, streak_count)
         values ($1, public._user_today($1) - $2::int, 1, $3)`, [u, 1 + k, 6 - k]);
    }
    await db.admin(`update user_stats set current_streak = 6, longest_streak = 6, total_days = 6,
      last_completed_date = public._user_today($1) - 1 where user_id = $1`, [u]);
    const r = await clearToday(u); // 今日で7日連続
    expect(r.day).toMatchObject({ streak: 7, stamp_type: 'blue' });
    expect((await db.as(u).rpc('get_my_stats')).unclaimed_dates).toHaveLength(7);
    const [{ d }] = await db.admin('select (public._user_today($1) - 6)::text d', [u]);
    expect(await claim(u, d)).toMatchObject({ stamp_type: 'normal', streak: 1, newly_claimed: true });
    expect(await claim(u)).toMatchObject({ stamp_type: 'blue', streak: 7 });
    expect((await db.as(u).rpc('get_my_stats')).unclaimed_dates).toHaveLength(5);
  });
});

describe('タスクの「済」ハンコ(ユーザーが押す)', () => {
  it('完了しただけでは押されていない。押すと記録され、2回押しても1回分', async () => {
    const u = await db.signup('tstamp');
    const t = await addTask(u, 'A');
    const [{ stamped_at: s0 }] = await db.as(u).q('select stamped_at from tasks where id = $1', [t]);
    expect(s0).toBeNull();
    // 未完了のタスクには押せない
    expect(await db.as(u).rpc('stamp_task', t).catch((e) => e.message)).toContain('SQ_TASK_NOT_DONE');
    await db.as(u).rpc('complete_task', t);
    const [{ stamped_at: s1 }] = await db.as(u).q('select stamped_at from tasks where id = $1', [t]);
    expect(s1).toBeNull(); // 完了=自動では押されない
    expect(await db.as(u).rpc('stamp_task', t)).toMatchObject({ newly_stamped: true });
    expect(await db.as(u).rpc('stamp_task', t)).toMatchObject({ newly_stamped: false });
    const [{ stamped_at: s2 }] = await db.as(u).q('select stamped_at from tasks where id = $1', [t]);
    expect(s2).not.toBeNull();
  });

  it('押さなくても、完了すれば1日の達成にはカウントされる', async () => {
    const u = await db.signup('tstamp2');
    const t = await addTask(u, 'A');
    const r = await db.as(u).rpc('complete_task', t);
    expect(r.day.cleared).toBe(true);
  });

  it('未完了に戻すとハンコも外れる。他人のタスクには押せず、クライアントから直接は書けない', async () => {
    const u = await db.signup('tstamp3');
    const other = await db.signup('tstamp4');
    const t = await addTask(u, 'A');
    await db.as(u).rpc('complete_task', t);
    expect(await db.as(other).rpc('stamp_task', t).catch((e) => e.message)).toContain('SQ_TASK_NOT_FOUND');
    expect(await db.as(u).q('update tasks set stamped_at = now() where id = $1', [t]).catch((e) => e.message)).toMatch(/permission denied/);
    await db.as(u).rpc('stamp_task', t);
    await db.as(u).rpc('uncomplete_task', t);
    const [{ stamped_at }] = await db.as(u).q('select stamped_at from tasks where id = $1', [t]);
    expect(stamped_at).toBeNull();
    await db.as(u).rpc('complete_task', t);
    expect(await db.as(u).rpc('stamp_task', t)).toMatchObject({ newly_stamped: true });
  });
});
