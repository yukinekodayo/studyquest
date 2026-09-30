import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, errorOf, type TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

async function codeOf(uid: string): Promise<string> {
  return (await db.admin('select friend_code from profiles where id = $1', [uid]))[0].friend_code;
}
async function makeFriends(a: string, b: string): Promise<void> {
  await db.as(a).rpc('send_friend_request', await codeOf(b));
  const [req] = await db.as(b).q("select id from friend_requests where to_user = $1 and status = 'pending'", [b]);
  await db.as(b).rpc('respond_friend_request', req.id, true);
}
async function clearToday(uid: string): Promise<void> {
  const [t] = await db.as(uid).q("insert into tasks (title, planned_minutes) values ('x', 5) returning id");
  await db.as(uid).rpc('complete_task', t.id);
}

describe('グループ / 協力チャレンジ', () => {
  it('作成 → フレンドを招待 → 承認で参加。非フレンドは招待できない', async () => {
    const me = await db.signup('ゆうき');
    const haru = await db.signup('はる');
    const stranger = await db.signup('だれか');
    await makeFriends(me, haru);
    const gid = await db.as(me).rpc('create_group', ' テスト前がんばる会 ');
    expect(await errorOf(db.as(me).rpc('invite_to_group', gid, stranger))).toContain('SQ_NOT_FRIENDS');
    await db.as(me).rpc('invite_to_group', gid, haru);
    expect(await errorOf(db.as(me).rpc('invite_to_group', gid, haru))).toContain('SQ_ALREADY_INVITED');

    // 招待中はグループの中身は見えない、招待だけ見える
    expect(await errorOf(db.as(haru).rpc('get_group_detail', gid))).toContain('SQ_GROUP_NOT_FOUND');
    const before = await db.as(haru).rpc('my_groups');
    expect(before.groups).toHaveLength(0);
    expect(before.invites[0]).toMatchObject({ name: 'テスト前がんばる会', invited_by: 'ゆうき' });

    await db.as(haru).rpc('respond_group_invite', gid, true);
    const d = await db.as(haru).rpc('get_group_detail', gid);
    expect(d.members.map((m: { nickname: string }) => m.nickname)).toEqual(['はる', 'ゆうき']);
    expect(await errorOf(db.as(me).rpc('invite_to_group', gid, haru))).toContain('SQ_ALREADY_MEMBER');
  });

  it('非メンバーはグループ/メンバー情報を読めない', async () => {
    const me = await db.signup('a');
    const other = await db.signup('b');
    const gid = await db.as(me).rpc('create_group', 'G');
    expect(await db.as(other).q('select * from groups')).toHaveLength(0);
    expect(await db.as(other).q('select * from group_members')).toHaveLength(0);
    expect(await errorOf(db.as(other).rpc('get_group_detail', gid))).toContain('SQ_GROUP_NOT_FOUND');
    expect(await errorOf(db.as(other).rpc('leave_group', gid))).toContain('SQ_GROUP_NOT_FOUND');
    expect(await errorOf(db.as(other).rpc('respond_group_invite', gid, true))).toContain('SQ_INVITE_NOT_FOUND');
    expect(await errorOf(db.as(other).q("insert into group_members (group_id, user_id, status, joined_at) values ($1, $2, 'joined', now())", [gid, other]))).toMatch(/permission denied/);
  });

  it('今週のクリア数がメンバー合計で進み、目標はメンバー数×5', async () => {
    const me = await db.signup('a');
    const b = await db.signup('b');
    const c = await db.signup('c');
    await makeFriends(me, b);
    await makeFriends(me, c);
    const gid = await db.as(me).rpc('create_group', '協力');
    for (const u of [b, c]) {
      await db.as(me).rpc('invite_to_group', gid, u);
      await db.as(u).rpc('respond_group_invite', gid, true);
    }
    let d = await db.as(me).rpc('get_group_detail', gid);
    expect(d.week).toMatchObject({ target: 15, progress: 0 });
    await clearToday(me);
    await clearToday(b);
    d = await db.as(c).rpc('get_group_detail', gid);
    expect(d.week.progress).toBe(2);
    expect(d.members.find((m: { is_me: boolean }) => m.is_me).nickname).toBe('c');
    expect(d.members.filter((m: { cleared: boolean }) => m.cleared)).toHaveLength(2);
    const list = await db.as(me).rpc('my_groups');
    expect(list.groups[0]).toMatchObject({ name: '協力', member_count: 3 });
    expect(list.groups[0].week.progress).toBe(2);
  });

  it('参加前のクリアは今週の進捗に数えない', async () => {
    const me = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(me, b);
    await clearToday(b); // 参加前にクリア済み
    const gid = await db.as(me).rpc('create_group', 'G');
    await db.as(me).rpc('invite_to_group', gid, b);
    await db.as(b).rpc('respond_group_invite', gid, true);
    // 参加日(=今日)以降なので今日のクリアは数える
    expect((await db.as(me).rpc('get_group_detail', gid)).week.progress).toBe(1);
    await db.admin("update group_members set joined_at = now() + interval '1 day' where user_id = $1", [b]);
    expect((await db.as(me).rpc('get_group_detail', gid)).week.progress).toBe(0);
  });

  it('招待の辞退・脱退・オーナー移譲・全員抜けたら解散', async () => {
    const me = await db.signup('a');
    const b = await db.signup('b');
    await makeFriends(me, b);
    const gid = await db.as(me).rpc('create_group', 'G');
    await db.as(me).rpc('invite_to_group', gid, b);
    await db.as(b).rpc('respond_group_invite', gid, false);
    expect((await db.as(b).rpc('my_groups')).invites).toHaveLength(0);
    await db.as(me).rpc('invite_to_group', gid, b);
    await db.as(b).rpc('respond_group_invite', gid, true);
    await db.as(me).rpc('leave_group', gid);
    const [g] = await db.admin('select owner_id from groups where id = $1', [gid]);
    expect(g.owner_id).toBe(b);
    await db.as(b).rpc('leave_group', gid);
    expect(await db.admin('select * from groups where id = $1', [gid])).toHaveLength(0);
  });

  it('入力検証: 空/長い名前、定員10人', async () => {
    const me = await db.signup('a');
    expect(await errorOf(db.as(me).rpc('create_group', '   '))).toContain('SQ_INVALID_INPUT');
    expect(await errorOf(db.as(me).rpc('create_group', 'あ'.repeat(21)))).toContain('SQ_INVALID_INPUT');
    const gid = await db.as(me).rpc('create_group', 'G');
    for (let i = 0; i < 9; i++) {
      const u = await db.signup(`m${i}`);
      await makeFriends(me, u);
      await db.as(me).rpc('invite_to_group', gid, u);
    }
    const extra = await db.signup('extra');
    await makeFriends(me, extra);
    expect(await errorOf(db.as(me).rpc('invite_to_group', gid, extra))).toContain('SQ_GROUP_FULL');
  });
});

describe('アカウント削除', () => {
  it('自分のデータが全部消え、フレンドの一覧からもいなくなる。グループはオーナーが引き継がれる', async () => {
    const me = await db.signup('me');
    const friend = await db.signup('friend');
    const other = await db.signup('other');
    await makeFriends(me, friend);
    await makeFriends(me, other);
    await clearToday(me);
    await db.as(me).rpc('send_reaction', friend, 'fire');
    const gid = await db.as(me).rpc('create_group', 'G');
    await db.as(me).rpc('invite_to_group', gid, friend);
    await db.as(friend).rpc('respond_group_invite', gid, true);

    await db.as(me).rpc('delete_my_account');

    for (const t of ['profiles', 'user_stats', 'tasks', 'study_sessions', 'daily_completions', 'stamps', 'friendships', 'friend_requests', 'reactions']) {
      const col = t === 'profiles' ? 'id' : t === 'friendships' ? 'user_a' : t === 'friend_requests' ? 'from_user' : t === 'reactions' ? 'from_user' : 'user_id';
      const rows = await db.admin(`select * from ${t} where ${col} = $1`, [me]);
      expect(rows, t).toHaveLength(0);
    }
    expect(await db.admin('select * from auth.users where id = $1', [me])).toHaveLength(0);
    // 友だち側は影響を受けない
    expect((await db.as(friend).q('select * from public.friends_overview()')).map((r) => r.nickname)).toEqual(['friend']);
    const [g] = await db.admin('select owner_id from groups where id = $1', [gid]);
    expect(g.owner_id).toBe(friend);
    expect(await errorOf(db.as(friend).rpc('send_reaction', me, 'fire'))).toContain('SQ_NOT_FRIENDS');
  });

  it('他人のアカウントは消せない(自分のIDにしか作用しない)', async () => {
    const a = await db.signup('a');
    const b = await db.signup('b');
    await db.as(a).rpc('delete_my_account');
    expect(await db.admin('select id from profiles where id = $1', [b])).toHaveLength(1);
  });
});
