import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, errorOf, type TestDb } from './helpers';

let db: TestDb;
let dayTz = '';
let nightTz = '';
beforeAll(async () => {
  db = await createTestDb();
  // 実行時刻に関係なく「昼」と「夜(22時〜7時)」を作れるよう、ちょうどよいタイムゾーンを探す
  const pick = async (cond: string) =>
    (await db.admin(`select name from pg_timezone_names where name ~ '^[A-Z][a-z]+/' and ${cond} order by name limit 1`))[0].name as string;
  dayTz = await pick("extract(hour from now() at time zone name) between 10 and 16");
  nightTz = await pick("(extract(hour from now() at time zone name) >= 23 or extract(hour from now() at time zone name) < 6)");
});
afterAll(async () => {
  await db.close();
});

const codeOf = async (uid: string) => (await db.admin('select friend_code from profiles where id = $1', [uid]))[0].friend_code as string;
async function user(name: string): Promise<string> {
  const id = await db.signup(name);
  await db.admin('update profiles set timezone = $2 where id = $1', [id, dayTz]);
  return id;
}
async function friends(a: string, b: string): Promise<void> {
  await db.as(a).rpc('send_friend_request', await codeOf(b));
  const [req] = await db.as(b).q("select id from friend_requests where to_user = $1 and status = 'pending'", [b]);
  await db.as(b).rpc('respond_friend_request', req.id, true);
}
async function group(owner: string, members: string[]): Promise<string> {
  const gid = await db.as(owner).rpc('create_group', 'G');
  for (const m of members) {
    await friends(owner, m);
    await db.as(owner).rpc('invite_to_group', gid, m);
    await db.as(m).rpc('respond_group_invite', gid, true);
  }
  return gid;
}
const send = (u: string, target: { group?: string; user?: string }, body: string, quick = false) =>
  db.as(u).rpc('send_message', target.group ?? null, target.user ?? null, body, quick);
const read = (u: string, target: { group?: string; user?: string }) =>
  db.as(u).rpc('get_messages', target.group ?? null, target.user ?? null, null, 50);

describe('グループのチャット', () => {
  it('メンバー同士で送受信できる(新しい順・送信者の名前つき)。非メンバーは読めない/送れない', async () => {
    const a = await user('はる');
    const b = await user('りく');
    const out = await user('だれか');
    const gid = await group(a, [b]);
    await send(a, { group: gid }, 'こんにちは');
    await send(b, { group: gid }, '今日は数学やるよ');
    const msgs = await read(a, { group: gid });
    expect(msgs.map((m: { body: string }) => m.body)).toEqual(['今日は数学やるよ', 'こんにちは']);
    expect(msgs[0]).toMatchObject({ nickname: 'りく', is_mine: false });
    expect(msgs[1]).toMatchObject({ nickname: 'はる', is_mine: true });
    expect(await errorOf(read(out, { group: gid }))).toContain('SQ_GROUP_NOT_FOUND');
    expect(await errorOf(send(out, { group: gid }, 'こんにちは'))).toContain('SQ_GROUP_NOT_FOUND');
    // messages テーブルへの直接アクセスは不可
    expect(await errorOf(db.as(a).q('select * from messages'))).toMatch(/permission denied/);
    expect(await errorOf(db.as(a).q("insert into messages (sender_id, group_id, body) values ($1, $2, 'x')", [a, gid]))).toMatch(/permission denied/);
  });

  it('招待中・脱退した人は読めない', async () => {
    const a = await user('o1');
    const b = await user('o2');
    const c = await user('o3');
    const gid = await group(a, [b]);
    await friends(a, c);
    await db.as(a).rpc('invite_to_group', gid, c); // 招待中
    expect(await errorOf(read(c, { group: gid }))).toContain('SQ_GROUP_NOT_FOUND');
    await send(a, { group: gid }, 'やあ');
    await db.as(b).rpc('leave_group', gid);
    expect(await errorOf(read(b, { group: gid }))).toContain('SQ_GROUP_NOT_FOUND');
  });
});

describe('友だち1対1のチャット', () => {
  it('フレンド同士だけ。非フレンドは送れない・読めない', async () => {
    const a = await user('d1');
    const b = await user('d2');
    const s = await user('d3');
    await friends(a, b);
    await send(a, { user: b }, 'やあ');
    expect((await read(b, { user: a })).map((m: { body: string }) => m.body)).toEqual(['やあ']);
    expect(await errorOf(send(a, { user: s }, 'やあ'))).toContain('SQ_NOT_FRIENDS');
    expect(await errorOf(read(s, { user: a }))).toContain('SQ_NOT_FRIENDS');
    // 第三者は、2人のやりとりを覗けない
    expect(await read(s, { group: await group(s, []) })).toEqual([]);
  });

  it('フレンドを外すと、履歴は読めなくなる', async () => {
    const a = await user('f1');
    const b = await user('f2');
    await friends(a, b);
    await send(a, { user: b }, 'やあ');
    await db.as(a).rpc('remove_friend', b);
    expect(await errorOf(read(b, { user: a }))).toContain('SQ_NOT_FRIENDS');
  });
});

describe('安全のチェック(送れない内容)', () => {
  it.each([
    ['電話番号', '090-1234-5678に電話して', 'SQ_MSG_PERSONAL'],
    ['全角の電話番号', '０９０１２３４５６７８です', 'SQ_MSG_PERSONAL'],
    ['メール/ID', 'DMはinsta @taro123 まで', 'SQ_MSG_PERSONAL'],
    ['リンク', 'https://example.com/abc を見て', 'SQ_MSG_PERSONAL'],
    ['リンク(wwwのみ)', 'www.example.com', 'SQ_MSG_PERSONAL'],
    ['悪口', 'おまえなんか死ね', 'SQ_MSG_NG'],
    ['悪口(ひらがな)', 'しね', 'SQ_MSG_NG'],
    ['つらい気持ち', '死にたい', 'SQ_MSG_CARE'],
    ['つらい気持ち(全角英数混じり)', '自殺したい', 'SQ_MSG_CARE'],
  ])('%s は送れない', async (_n, body, code) => {
    const a = await user('s1');
    const b = await user('s2');
    await friends(a, b);
    expect(await errorOf(send(a, { user: b }, body))).toContain(code);
    expect(await read(b, { user: a })).toEqual([]); // 何も保存されない
  });

  it('ふつうの会話(数字や勉強の話)は送れる', async () => {
    const a = await user('ok1');
    const b = await user('ok2');
    await friends(a, b);
    for (const body of ['数学の問題を12問解いた', '30分やって20分休む', '明日は5時に起きる', 'テスト100点とるぞ！']) {
      await send(a, { user: b }, body);
    }
    expect(await read(b, { user: a })).toHaveLength(4);
  });

  it('空/長すぎる(200文字超)は送れない', async () => {
    const a = await user('len1');
    const b = await user('len2');
    await friends(a, b);
    expect(await errorOf(send(a, { user: b }, '   '))).toContain('SQ_INVALID_INPUT');
    expect(await errorOf(send(a, { user: b }, 'あ'.repeat(201)))).toContain('SQ_INVALID_INPUT');
    await send(a, { user: b }, 'あ'.repeat(200));
  });

  it('宛先は「グループ」か「友だち」のどちらか一方', async () => {
    const a = await user('t1');
    expect(await errorOf(send(a, {}, 'x'))).toContain('SQ_INVALID_INPUT');
  });
});

describe('定型の一言', () => {
  it('決まった文言だけ送れる(それ以外を「定型」として送るのは不可)', async () => {
    const a = await user('q1');
    const b = await user('q2');
    await friends(a, b);
    await send(a, { user: b }, 'がんばろう', true);
    expect((await read(b, { user: a }))[0]).toMatchObject({ body: 'がんばろう', kind: 'quick' });
    expect(await errorOf(send(a, { user: b }, 'なんでもいい文章', true))).toContain('SQ_INVALID_INPUT');
  });
});

describe('夜の制限・連投・保持期間', () => {
  it('夜(22時〜7時)は送れないが、読むことはできる', async () => {
    const a = await user('n1');
    const b = await user('n2');
    await friends(a, b);
    await send(a, { user: b }, '昼のメッセージ');
    await db.admin('update profiles set timezone = $2 where id = $1', [a, nightTz]);
    expect(await errorOf(send(a, { user: b }, '夜のメッセージ'))).toContain('SQ_MSG_QUIET');
    expect(await errorOf(send(a, { user: b }, 'がんばろう', true))).toContain('SQ_MSG_QUIET');
    expect(await read(a, { user: b })).toHaveLength(1);
  });

  it('短時間に連投すると止まる', async () => {
    const a = await user('r1');
    const b = await user('r2');
    await friends(a, b);
    for (let i = 0; i < 8; i++) await send(a, { user: b }, `m${i}`);
    expect(await errorOf(send(a, { user: b }, 'もう1つ'))).toContain('SQ_MSG_RATE');
  });

  it('30日より古いメッセージは、送信時に自動で削除され、一括削除もできる', async () => {
    const a = await user('p1');
    const b = await user('p2');
    await friends(a, b);
    await send(a, { user: b }, '新しい');
    await db.admin(`insert into messages (sender_id, dm_user_a, dm_user_b, body, created_at)
                    values ($1, least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), '古い', now() - interval '31 days')`, [a, b]);
    expect((await db.admin("select count(*)::int n from messages where body = '古い'"))[0].n).toBe(1);
    expect((await read(a, { user: b })).map((m: { body: string }) => m.body)).toContain('古い');
    await send(b, { user: a }, 'ありがとう');
    expect((await db.admin("select count(*)::int n from messages where body = '古い'"))[0].n).toBe(0);
    await db.admin(`insert into messages (sender_id, dm_user_a, dm_user_b, body, created_at)
                    values ($1, least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid), '古い2', now() - interval '40 days')`, [a, b]);
    expect((await db.admin('select public.purge_old_messages() n'))[0].n).toBeGreaterThanOrEqual(1);
  });
});

describe('ブロック', () => {
  it('ブロックすると、相手のメッセージは見えなくなり、1対1は双方向に送れなくなる', async () => {
    const a = await user('b1');
    const b = await user('b2');
    await friends(a, b);
    await send(b, { user: a }, 'やあ');
    await db.as(a).rpc('block_user', b);
    expect(await read(a, { user: b })).toEqual([]);
    expect(await errorOf(send(a, { user: b }, 'こんにちは'))).toContain('SQ_MSG_BLOCKED');
    expect(await errorOf(send(b, { user: a }, 'こんにちは'))).toContain('SQ_MSG_BLOCKED');
    expect((await db.as(a).rpc('my_blocks'))[0]).toMatchObject({ nickname: 'b2' });
    await db.as(a).rpc('unblock_user', b);
    expect(await read(a, { user: b })).toHaveLength(1);
    await send(a, { user: b }, 'こんにちは');
  });

  it('グループでブロックした相手の発言は、自分にだけ見えなくなる', async () => {
    const a = await user('g1');
    const b = await user('g2');
    const c = await user('g3');
    const gid = await group(a, [b, c]);
    await send(b, { group: gid }, 'bです');
    await send(c, { group: gid }, 'cです');
    await db.as(a).rpc('block_user', b);
    expect((await read(a, { group: gid })).map((m: { body: string }) => m.body)).toEqual(['cです']);
    expect((await read(c, { group: gid })).map((m: { body: string }) => m.body).sort()).toEqual(['bです', 'cです']);
  });

  it('自分自身はブロックできない/ブロックの一覧は他人に見えない', async () => {
    const a = await user('bb1');
    const b = await user('bb2');
    expect(await errorOf(db.as(a).rpc('block_user', a))).toContain('SQ_INVALID_INPUT');
    await db.as(a).rpc('block_user', b);
    expect(await db.as(b).q('select * from blocks')).toHaveLength(0);
  });
});

describe('通報と運営の対応', () => {
  let seq = 0;
  async function setup() {
    const tag = `${++seq}`;
    const a = await user(`rp-a${tag}`);
    const b = await user(`rp-b${tag}`);
    const c = await user(`rp-c${tag}`);
    const d = await user(`rp-d${tag}`);
    const admin = await user(`rp-admin${tag}`);
    await db.admin('insert into admins (user_id) values ($1)', [admin]);
    const gid = await group(a, [b, c, d]);
    const m = await send(b, { group: gid }, '感じの悪い発言');
    return { a, b, c, d, admin, gid, m, tag };
  }
  const mine = (open: Array<{ sender_nickname: string }>, tag: string) => open.filter((r) => r.sender_nickname === `rp-b${tag}`);

  it('通報できるのは参加者だけ。自分のメッセージは通報できない。同じ人の二重通報は1件', async () => {
    const { a, b, gid, m } = await setup();
    const out = await user('rp-out');
    expect(await errorOf(db.as(out).rpc('report_message', m.id, 'abuse', null))).toContain('SQ_MSG_NOT_FOUND');
    expect(await errorOf(db.as(b).rpc('report_message', m.id, 'abuse', null))).toContain('SQ_INVALID_INPUT');
    expect(await errorOf(db.as(a).rpc('report_message', m.id, 'weird', null))).toContain('SQ_INVALID_INPUT');
    expect(await db.as(a).rpc('report_message', m.id, 'abuse', '悪口')).toMatchObject({ newly_reported: true });
    expect(await db.as(a).rpc('report_message', m.id, 'abuse', null)).toMatchObject({ newly_reported: false });
    expect((await db.admin('select count(*)::int n from message_reports'))[0].n).toBeGreaterThanOrEqual(1);
    expect(await read(a, { group: gid })).toHaveLength(1); // 1件では消えない
  });

  it('3人から通報されると、運営の確認を待つ間は自動で非表示になる。問題なしなら元に戻る', async () => {
    const { a, c, d, admin, gid, m, tag } = await setup();
    await db.as(a).rpc('report_message', m.id, 'bullying', null);
    await db.as(c).rpc('report_message', m.id, 'bullying', null);
    expect(await read(a, { group: gid })).toHaveLength(1);
    await db.as(d).rpc('report_message', m.id, 'bullying', null);
    expect(await read(a, { group: gid })).toHaveLength(0);
    const open = mine(await db.as(admin).rpc('admin_open_reports'), tag);
    expect(open).toHaveLength(3);
    expect(open[0]).toMatchObject({ body: '感じの悪い発言', report_count: 3, hidden: true });
    await db.as(admin).rpc('admin_resolve_report', open[0].id, 'dismiss');
    expect(mine(await db.as(admin).rpc('admin_open_reports'), tag)).toHaveLength(0); // 同じメッセージの通報はまとめて解決
    expect(await read(a, { group: gid })).toHaveLength(1);
  });

  it('運営が「非表示 + 24時間停止」にすると、全員から消え、送信者は24時間送れない', async () => {
    const { a, b, admin, gid, m, tag } = await setup();
    await db.as(a).rpc('report_message', m.id, 'abuse', null);
    const [r] = mine(await db.as(admin).rpc('admin_open_reports'), tag);
    await db.as(admin).rpc('admin_resolve_report', r.id, 'hide_mute');
    expect(await read(a, { group: gid })).toHaveLength(0);
    expect(await errorOf(send(b, { group: gid }, 'ごめんなさい'))).toContain('SQ_MSG_MUTED');
    await db.admin("update chat_mutes set until = now() - interval '1 minute' where user_id = $1", [b]);
    await send(b, { group: gid }, 'ごめんなさい');
  });

  it('運営以外は通報の一覧・対応ができない。通報者は自分の通報だけ見える', async () => {
    const { a, b, m } = await setup();
    await db.as(a).rpc('report_message', m.id, 'spam', null);
    expect(await errorOf(db.as(a).rpc('admin_open_reports'))).toContain('SQ_FORBIDDEN');
    const [row] = await db.admin('select id from message_reports limit 1');
    expect(await errorOf(db.as(a).rpc('admin_resolve_report', row.id, 'hide'))).toContain('SQ_FORBIDDEN');
    expect(await db.as(a).q('select * from message_reports')).toHaveLength(1);
    expect(await db.as(b).q('select * from message_reports')).toHaveLength(0);
    expect(await errorOf(db.as(a).q("insert into admins (user_id) values ($1)", [a]))).toMatch(/permission denied/);
    expect(await db.as(a).rpc('is_admin')).toBe(false);
  });

  it('メッセージが保持期間で消えても、通報の内容(控え)は運営が確認できる', async () => {
    const { a, admin, m, tag } = await setup();
    await db.as(a).rpc('report_message', m.id, 'abuse', null);
    await db.admin('delete from messages where id = $1', [m.id]);
    const [r] = mine(await db.as(admin).rpc('admin_open_reports'), tag);
    expect(r.body).toBe('感じの悪い発言');
    await db.as(admin).rpc('admin_resolve_report', r.id, 'dismiss');
  });
});

describe('未読', () => {
  it('相手のメッセージだけが未読になり、開くと(既読にすると)0になる', async () => {
    const a = await user('u1');
    const b = await user('u2');
    const gid = await group(a, [b]);
    await send(b, { group: gid }, '1つ目');
    await send(b, { group: gid }, '2つ目');
    await send(a, { group: gid }, '自分のは数えない');
    let un = await db.as(a).rpc('chat_unread');
    expect(un.groups[gid]).toBe(2);
    await db.as(a).rpc('mark_chat_read', gid, null);
    un = await db.as(a).rpc('chat_unread');
    expect(un.groups[gid] ?? 0).toBe(0);
    await send(b, { user: a }, 'こんにちは').catch(() => undefined); // すでにフレンド
    un = await db.as(a).rpc('chat_unread');
    expect(un.dms[b]).toBe(1);
    await db.as(a).rpc('mark_chat_read', null, b);
    expect((await db.as(a).rpc('chat_unread')).dms[b] ?? 0).toBe(0);
  });
});

describe('退会', () => {
  it('退会すると、その人のメッセージ・通報・ブロックも消える', async () => {
    const a = await user('x1');
    const b = await user('x2');
    await friends(a, b);
    await send(a, { user: b }, 'やあ');
    await db.as(a).rpc('block_user', b);
    await db.as(a).rpc('delete_my_account');
    expect((await db.admin('select count(*)::int n from messages where sender_id = $1', [a]))[0].n).toBe(0);
    expect((await db.admin('select count(*)::int n from blocks where blocker_id = $1', [a]))[0].n).toBe(0);
  });
});
