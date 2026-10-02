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
async function codeOf(uid: string): Promise<string> {
  return (await db.admin('select friend_code from profiles where id = $1', [uid]))[0].friend_code;
}
async function makeFriends(a: string, b: string): Promise<void> {
  await db.as(a).rpc('send_friend_request', await codeOf(b));
  const [req] = await db.as(b).q("select id from friend_requests where to_user = $1 and status = 'pending'", [b]);
  await db.as(b).rpc('respond_friend_request', req.id, true);
}

describe('フレンド申請', () => {
  it('コードで申請 → 承認でフレンドになる', async () => {
    const a = await db.signup('はる');
    const b = await db.signup('りく');
    expect((await db.as(a).rpc('send_friend_request', await codeOf(b))).result).toBe('requested');
    // 申請中は相手のプロフィール(ニックネーム)だけ見える
    const pending = await db.as(b).q('select nickname from profiles where id = $1', [a]);
    expect(pending).toHaveLength(1);
    const [req] = await db.as(b).q("select id, from_user from friend_requests where status = 'pending'");
    expect(req.from_user).toBe(a);
    await db.as(b).rpc('respond_friend_request', req.id, true);
    const f = await db.as(a).q('select * from friendships');
    expect(f).toHaveLength(1);
    expect((await db.as(b).q('select * from friendships'))).toHaveLength(1);
  });

  it('自分/存在しないコード/重複/フレンド済みはエラー、コードは大文字小文字を区別しない', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    expect(await errorOf(db.as(a).rpc('send_friend_request', await codeOf(a)))).toContain('SQ_SELF_REQUEST');
    expect(await errorOf(db.as(a).rpc('send_friend_request', 'ZZZZZZZZ'))).toContain('SQ_CODE_NOT_FOUND');
    expect(await errorOf(db.as(a).rpc('send_friend_request', ''))).toContain('SQ_CODE_NOT_FOUND');
    const code = (await codeOf(b)).toLowerCase();
    await db.as(a).rpc('send_friend_request', ` ${code} `);
    expect(await errorOf(db.as(a).rpc('send_friend_request', code))).toContain('SQ_ALREADY_REQUESTED');
    const [req] = await db.as(b).q("select id from friend_requests where status = 'pending'");
    await db.as(b).rpc('respond_friend_request', req.id, true);
    expect(await errorOf(db.as(a).rpc('send_friend_request', code))).toContain('SQ_ALREADY_FRIENDS');
  });

  it('お互いに申請していれば自動でフレンドになる', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await db.as(a).rpc('send_friend_request', await codeOf(b));
    const r = await db.as(b).rpc('send_friend_request', await codeOf(a));
    expect(r.result).toBe('friends');
    expect(await db.as(a).q('select * from friendships')).toHaveLength(1);
  });

  it('申請の承認は宛先本人のみ。拒否された側は再申請できない(相手に悟らせない)', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    const c = await db.signup('c');
    await db.as(a).rpc('send_friend_request', await codeOf(b));
    const [req] = await db.as(b).q("select id from friend_requests where status = 'pending'");
    expect(await errorOf(db.as(c).rpc('respond_friend_request', req.id, true))).toContain('SQ_REQUEST_NOT_FOUND');
    expect(await errorOf(db.as(a).rpc('respond_friend_request', req.id, true))).toContain('SQ_REQUEST_NOT_FOUND');
    expect(await db.as(c).q('select * from friend_requests')).toHaveLength(0);
    await db.as(b).rpc('respond_friend_request', req.id, false);
    expect(await db.as(a).q('select * from friendships')).toHaveLength(0);
    expect(await errorOf(db.as(a).rpc('send_friend_request', await codeOf(b)))).toContain('SQ_ALREADY_REQUESTED');
  });

  it('フレンド削除で双方の関係が消え、再申請できる', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(a, b);
    await db.as(a).rpc('remove_friend', b);
    expect(await db.as(b).q('select * from friendships')).toHaveLength(0);
    expect(await db.as(b).q('select * from profiles where id = $1', [a])).toHaveLength(0);
    await db.as(b).rpc('send_friend_request', await codeOf(a));
  });
});

describe('友だちデータのアクセス制御(RLS)', () => {
  it('他人(非フレンド)のプロフィール/統計/タスク/セッション/達成/ハンコは見えない', async () => {
    const a = await db.signup('a');
    const stranger = await db.signup('stranger');
    const t = await addTask(a, 'A');
    await db.as(a).rpc('start_session', t);
    await db.as(a).rpc('complete_task', t);
    for (const table of ['profiles', 'user_stats', 'tasks', 'study_sessions', 'daily_completions', 'stamps']) {
      const col = table === 'profiles' ? 'id' : 'user_id';
      const rows = await db.as(stranger).q(`select * from ${table} where ${col} = $1`, [a]);
      expect(rows, table).toHaveLength(0);
    }
  });

  it('フレンドでもプロフィール以外(tasks等)は直接読めない。読めるのは集計関数のみ', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(a, b);
    await addTask(a, '秘密のタスク');
    expect(await db.as(b).q('select * from profiles where id = $1', [a])).toHaveLength(1);
    for (const table of ['user_stats', 'tasks', 'study_sessions', 'daily_completions', 'stamps']) {
      expect(await db.as(b).q(`select * from ${table} where user_id = $1`, [a]), table).toHaveLength(0);
    }
    // プロフィールにメール等の個人情報は含まれない
    const [p] = await db.as(b).q('select * from profiles where id = $1', [a]);
    expect(Object.keys(p).sort()).toEqual(['avatar', 'created_at', 'friend_code', 'id', 'nickname', 'share_subject', 'timezone']);
  });

  it('プロフィールは自分だけが更新でき、他人のは更新できない', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(a, b);
    expect(await db.as(b).q("update profiles set nickname = 'hack' where id = $1 returning id", [a])).toHaveLength(0);
    await db.as(a).q("update profiles set nickname = 'あたらしい', avatar = 'teal' where id = $1", [a]);
    expect((await db.admin('select nickname, avatar from profiles where id = $1', [a]))[0]).toEqual({ nickname: 'あたらしい', avatar: 'teal' });
    expect(await errorOf(db.as(a).q("update profiles set nickname = '' where id = $1", [a]))).toMatch(/check|violates/);
    expect(await errorOf(db.as(a).q("update profiles set avatar = 'dragon' where id = $1", [a]))).toMatch(/check|violates/);
  });

  it('friend_requests / reactions は当事者のみ閲覧可', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    const c = await db.signup('c');
    await makeFriends(a, b);
    await db.as(a).rpc('send_reaction', b, 'fire');
    expect(await db.as(c).q('select * from reactions')).toHaveLength(0);
    expect(await db.as(c).q('select * from friend_requests')).toHaveLength(0);
    expect(await db.as(c).q('select * from friendships')).toHaveLength(0);
    expect(await db.as(b).q('select * from reactions')).toHaveLength(1);
  });

  it('友だちの進捗(友だち一覧): 達成数・クリア・連続・勉強中が見える。非フレンドは含まれない', async () => {
    const me = await db.signup('ゆうき');
    const haru = await db.signup('はる');
    const sakura = await db.signup('さくら');
    const stranger = await db.signup('だれか');
    await makeFriends(me, haru);
    await makeFriends(me, sakura);

    const h = [await addTask(haru, '英単語'), await addTask(haru, '数学'), await addTask(haru, '読書'), await addTask(haru, '宿題')];
    await db.as(haru).rpc('complete_task', h[0]);
    await db.as(haru).rpc('complete_task', h[1]);
    await db.as(haru).rpc('start_session', h[2]);

    const s = await addTask(sakura, '国語', 10);
    await db.as(sakura).rpc('complete_task', s);

    const rows = await db.as(me).q('select * from public.friends_overview()');
    expect(rows.map((r) => r.nickname).sort()).toEqual(['ゆうき', 'さくら', 'はる'].sort());
    expect(rows[0].is_me).toBe(true);
    expect(rows.find((r) => r.nickname === 'だれか')).toBeUndefined();
    const hr = rows.find((r) => r.nickname === 'はる')!;
    expect(hr).toMatchObject({ must_total: 4, must_done: 2, cleared: false, studying: true, studying_subject: '読書' });
    const sr = rows.find((r) => r.nickname === 'さくら')!;
    expect(sr).toMatchObject({ must_total: 1, must_done: 1, cleared: true, current_streak: 1, studying: false });

    // 逆方向: 非フレンドから見た一覧に、自分以外は出ない
    const only = await db.as(stranger).q('select * from public.friends_overview()');
    expect(only).toHaveLength(1);
    expect(only[0].is_me).toBe(true);
  });

  it('勉強中の教科名を隠す設定にすると、友だちには「勉強中」だけ見える', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(a, b);
    await db.as(b).q('update profiles set share_subject = false where id = $1', [b]);
    const t = await addTask(b, '内緒の科目');
    await db.as(b).rpc('start_session', t);
    const rows = await db.as(a).q('select * from public.friends_overview()');
    const br = rows.find((r) => r.user_id === b)!;
    expect(br.studying).toBe(true);
    expect(br.studying_subject).toBeNull();
    expect(JSON.stringify(await db.as(a).rpc('study_party_rooms'))).not.toContain('内緒の科目');
    // 本人には見える
    const mine = (await db.as(b).q('select * from public.friends_overview()')).find((r) => r.is_me)!;
    expect(mine.studying_subject).toBe('内緒の科目');
  });
});

describe('応援リアクション', () => {
  it('友だちにだけ送れる。同じ種類は1日1回(冪等)。種類は4つのみ', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    const c = await db.signup('c');
    await makeFriends(a, b);
    expect(await errorOf(db.as(a).rpc('send_reaction', c, 'fire'))).toContain('SQ_NOT_FRIENDS');
    expect(await errorOf(db.as(a).rpc('send_reaction', b, 'angry'))).toContain('SQ_INVALID_INPUT');
    await db.as(a).rpc('send_reaction', b, 'fire');
    await db.as(a).rpc('send_reaction', b, 'fire');
    await db.as(a).rpc('send_reaction', b, 'clap');
    const rows = await db.as(b).q('select kind from reactions order by kind');
    expect(rows.map((r) => r.kind)).toEqual(['clap', 'fire']);
    const ov = (await db.as(a).q('select * from public.friends_overview()')).find((r) => r.user_id === b)!;
    expect(ov.my_reactions.sort()).toEqual(['clap', 'fire']);
    // クライアントは直接reactionsに書けない
    expect(
      await errorOf(db.as(a).q("insert into reactions (from_user, to_user, kind, reaction_date) values ($1, $2, 'fire', current_date)", [a, c])),
    ).toMatch(/permission denied/);
  });
});

describe('一緒に勉強する(スタディパーティー)', () => {
  it('同じ教科を勉強中の自分+友だちがまとまり、非フレンドは含まれない', async () => {
    const me = await db.signup('ゆうき');
    const haru = await db.signup('はる');
    const riku = await db.signup('りく');
    const stranger = await db.signup('だれか');
    await makeFriends(me, haru);
    await makeFriends(me, riku);
    await db.as(haru).rpc('start_session', await addTask(haru, '数学'));
    await db.as(riku).rpc('start_session', await addTask(riku, ' 数学 '));
    await db.as(stranger).rpc('start_session', await addTask(stranger, '数学'));
    await db.as(riku).rpc('start_session', await addTask(riku, '数学2')); // rikuは数学を一時停止→数学2

    const rooms = await db.as(me).rpc('study_party_rooms');
    const math = rooms.find((r: { subject: string }) => r.subject.trim() === '数学');
    expect(math.count).toBe(1);
    expect(math.members.map((m: { nickname: string }) => m.nickname)).toEqual(['はる']);
    expect(JSON.stringify(rooms)).not.toContain('だれか');
  });

  it('「一緒にやる」で同名の未完了タスクを開始、なければボーナスタスクを作って開始', async () => {
    const me = await db.signup('ゆうき');
    const haru = await db.signup('はる');
    await makeFriends(me, haru);
    await db.as(haru).rpc('start_session', await addTask(haru, '数学', 30));
    const mine = await addTask(me, '数学', 30);
    const r = await db.as(me).rpc('join_study_party', '数学');
    expect(r.task_id).toBe(mine);
    expect(r.session.status).toBe('running');
    const rooms = await db.as(me).rpc('study_party_rooms');
    expect(rooms[0].count).toBe(2);
    expect(rooms[0].members.some((m: { is_me: boolean }) => m.is_me)).toBe(true);

    await db.as(me).rpc('finish_session', r.session.id, false);
    const r2 = await db.as(me).rpc('join_study_party', '英語リスニング');
    const [t] = await db.as(me).q('select kind, planned_minutes, status from tasks where id = $1', [r2.task_id]);
    expect(t).toEqual({ kind: 'bonus', planned_minutes: 20, status: 'doing' });
    expect(await errorOf(db.as(me).rpc('join_study_party', ''))).toContain('SQ_INVALID_INPUT');
  });
});
