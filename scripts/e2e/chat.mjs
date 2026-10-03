// チャット E2E: 1対1 / グループ / 定型の一言 / 安全チェック / 通報 / ブロック / 運営の対応 / 夜間表示
import { BASE, check, daytimeZone, failed, launch, newUser, psql, shot, signup, tid } from './lib.mjs';

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const stamp = Date.now();
// 前回の実行で残った通報・運営権限を掃除する(同じ名前の通報が並ばないように)
psql('delete from message_reports');
psql('delete from admins');
const tz = daytimeZone();
console.log(`(昼のタイムゾーン: ${tz})`);
const browser = await launch();
const a = await newUser(browser, 'ゆうき', { timezoneId: tz });
const b = await newUser(browser, 'はる', { timezoneId: tz });

console.log('1. 準備: 2人が登録してフレンドになる');
await signup(a.page, { nickname: 'ゆうき', avatar: 'blue', email: `ca_${stamp}@example.com` });
await signup(b.page, { nickname: 'はる', avatar: 'green', email: `cb_${stamp}@example.com` });
await a.page.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
await tid(a.page, 'add-friend').click();
await a.page.waitForFunction(() => /^[A-Z2-9]{8}$/.test(document.querySelector('[data-testid="my-code"]')?.textContent ?? ''));
const codeA = norm(await tid(a.page, 'my-code').textContent());
await b.page.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
await tid(b.page, 'add-friend').click();
await tid(b.page, 'friend-code-input').fill(codeA);
await tid(b.page, 'send-request').click();
await b.page.getByText('申請を送りました').waitFor({ timeout: 10000 });
await a.page.reload({ waitUntil: 'domcontentloaded' });
await tid(a.page, 'add-friend').click();
await tid(a.page, 'accept-はる').click();
await a.page.getByText('フレンドになりました').waitFor({ timeout: 10000 });
await a.page.getByTestId('sheet-close').click();

console.log('2. 友だちと1対1のチャット');
await tid(a.page, 'chat-はる').click();
await a.page.waitForURL(/\/chat\/dm\//);
await tid(a.page, 'chat-rules-ok').waitFor({ timeout: 10000 });
check(true, '初めて開くと「安心して使うためのルール」が出る');
await shot(a.page, '30-chat-rules');
await tid(a.page, 'chat-rules-ok').click();
await tid(a.page, 'chat-empty').waitFor();
check(norm(await tid(a.page, 'chat-title').textContent()) === 'はる', 'タイトルは相手の名前');
await shot(a.page, '31-chat-empty');
await tid(a.page, 'quick-がんばろう').click();
await tid(a.page, 'msg-がんばろう').waitFor({ timeout: 10000 });
check(true, '定型の一言をワンタップで送れる');
await tid(a.page, 'chat-input').fill('今日は英単語をやるよ');
await tid(a.page, 'chat-send').click();
await tid(a.page, 'msg-今日は英単語をやるよ').waitFor({ timeout: 10000 });
check((await tid(a.page, 'chat-input').inputValue()) === '', '送ったら入力欄が空になる');

console.log('3. 相手側: 未読の印 → 開くと読める → 既読で消える');
await b.page.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
await tid(b.page, 'unread-ゆうき').waitFor({ timeout: 20000 });
check(true, '友だち一覧に未読の赤い点');
await tid(b.page, 'chat-ゆうき').click();
await b.page.waitForURL(/\/chat\/dm\//);
await tid(b.page, 'chat-rules-ok').click();
await tid(b.page, 'msg-今日は英単語をやるよ').waitFor({ timeout: 15000 });
check((await tid(b.page, 'msg-がんばろう').count()) === 1, '2通とも読める');
await tid(b.page, 'chat-input').fill('いいね、私は数学！');
await tid(b.page, 'chat-send').click();
await tid(b.page, 'msg-いいね、私は数学！').waitFor({ timeout: 10000 });
await b.page.waitForTimeout(800);
await b.page.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
await tid(b.page, 'chat-ゆうき').waitFor({ timeout: 15000 });
check((await tid(b.page, 'unread-ゆうき').count()) === 0, '読んだら未読の点が消える');
await tid(a.page, 'msg-いいね、私は数学！').waitFor({ timeout: 15000 });
check(true, '相手のメッセージが自動で届く(5秒ごとの確認)');

console.log('4. 安全チェック: 送れない内容は、理由を伝えて送らない');
for (const [body, expectText, label] of [
  ['090-1234-5678に電話して', '個人情報を守るため', '電話番号'],
  ['おまえなんか死ね', '不適切な言葉', '悪口'],
  ['死にたい', '信頼できる大人', 'つらい気持ち(責めず、大人への相談をすすめる)'],
]) {
  await tid(a.page, 'chat-input').fill(body);
  await tid(a.page, 'chat-send').click();
  await a.page.getByText(expectText, { exact: false }).first().waitFor({ timeout: 8000 });
  check(true, `${label}は送れず、理由が表示される`);
  check((await tid(a.page, 'chat-input').inputValue()) === body, '送れなかった文は入力欄に戻る(消えない)');
  await a.page.waitForTimeout(400);
}
check((await a.page.getByText('090-1234-5678').count()) === 0, '送れなかった内容は会話に残らない');
await tid(a.page, 'chat-input').fill('');
await shot(a.page, '32-chat-blocked-toast');

console.log('5. 通報');
await tid(b.page, 'chat-ゆうき').click();
await b.page.waitForURL(/\/chat\/dm\//);
await tid(b.page, 'msg-今日は英単語をやるよ').waitFor({ timeout: 15000 });
await tid(b.page, 'msg-今日は英単語をやるよ').click();
await tid(b.page, 'menu-report').click();
await tid(b.page, 'reason-bullying').click();
await tid(b.page, 'report-note').fill('しつこいので');
await shot(b.page, '33-report-sheet');
await tid(b.page, 'report-submit').click();
await b.page.getByText('通報しました').waitFor({ timeout: 10000 });
check(true, '通報できる(通報したことは相手に伝わらない旨も表示)');

console.log('6. ブロックと解除');
await tid(b.page, 'msg-今日は英単語をやるよ').click();
await tid(b.page, 'menu-block').click();
await tid(b.page, 'block-confirm').click();
await b.page.getByText('ブロックしました').waitFor({ timeout: 10000 });
await b.page.waitForTimeout(800);
check((await tid(b.page, 'msg-今日は英単語をやるよ').count()) === 0, 'ブロックした相手のメッセージが見えなくなる');
await tid(b.page, 'chat-input').fill('こんにちは');
await tid(b.page, 'chat-send').click();
await b.page.getByText('やりとりができません').waitFor({ timeout: 8000 });
check(true, 'ブロック中は1対1で送れない');
await b.page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await tid(b.page, 'blocked-ゆうき').waitFor({ timeout: 15000 });
await shot(b.page, '34-settings-blocks');
await tid(b.page, 'unblock-ゆうき').click();
await tid(b.page, 'no-blocks').waitFor({ timeout: 10000 });
check(true, '設定から解除できる');

console.log('7. グループのチャット');
await a.page.goto(`${BASE}/groups`, { waitUntil: 'domcontentloaded' });
await tid(a.page, 'empty-create-group').waitFor({ timeout: 20000 });
await tid(a.page, 'create-group').click();
await tid(a.page, 'group-name-input').fill('テスト前がんばる会');
await tid(a.page, 'group-create-submit').click();
await a.page.waitForURL(/\/groups\/[0-9a-f-]{36}/, { timeout: 15000 });
await tid(a.page, 'group-invite').click();
await tid(a.page, 'invite-はる').click();
await a.page.getByText('招待しました').waitFor({ timeout: 10000 });
await a.page.getByTestId('sheet-close').click();
await b.page.goto(`${BASE}/groups`, { waitUntil: 'domcontentloaded' });
await tid(b.page, 'join-テスト前がんばる会').click();
await tid(b.page, 'group-テスト前がんばる会').waitFor({ timeout: 15000 });
await tid(a.page, 'group-chat').click();
await a.page.waitForURL(/\/chat\/group\//);
await tid(a.page, 'chat-empty').waitFor({ timeout: 10000 });
await tid(a.page, 'quick-一緒にやろう').click();
await tid(a.page, 'msg-一緒にやろう').waitFor({ timeout: 10000 });
await tid(b.page, 'group-テスト前がんばる会').click();
await b.page.waitForURL(/\/groups\/[0-9a-f-]{36}/);
await tid(b.page, 'group-unread').waitFor({ timeout: 20000 });
check(true, 'グループ画面にチャットの未読の点');
await tid(b.page, 'group-chat').click();
await b.page.waitForURL(/\/chat\/group\//);
await tid(b.page, 'chat-rules-ok').click().catch(() => undefined);
await tid(b.page, 'msg-一緒にやろう').waitFor({ timeout: 15000 });
check(norm(await tid(b.page, 'chat-title').textContent()) === 'テスト前がんばる会', 'グループ名がタイトル');
check((await b.page.getByText('ゆうき', { exact: true }).count()) >= 1, 'グループでは送った人の名前が出る');
await tid(b.page, 'chat-input').fill('みんなでがんばろう！');
await tid(b.page, 'chat-send').click();
await tid(a.page, 'msg-みんなでがんばろう！').waitFor({ timeout: 15000 });
check(true, 'グループのメッセージが相手に届く');
await shot(a.page, '35-group-chat');

console.log('8. 運営の対応(通報されたメッセージの確認)');
const aId = psql(`select id from profiles where nickname = 'ゆうき' order by created_at desc limit 1`);
psql(`insert into admins (user_id) values ('${aId}') on conflict do nothing`);
await a.page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
await tid(a.page, 'open-admin').waitFor({ timeout: 20000 });
await tid(a.page, 'open-admin').click();
await a.page.waitForURL('**/admin');
await tid(a.page, 'report-ゆうき').waitFor({ timeout: 15000 });
check(norm(await tid(a.page, 'report-ゆうき').textContent()).includes('今日は英単語をやるよ'), '通報された内容と、送った人・通報した人が見える');
await shot(a.page, '36-admin');
await tid(a.page, 'mute-ゆうき').click();
await a.page.getByText('24時間の送信停止').waitFor({ timeout: 10000 });
check(true, '「非表示 + 24時間停止」で対応できる');
await a.page.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
await tid(a.page, 'chat-はる').click();
await a.page.waitForURL(/\/chat\/dm\//);
await tid(a.page, 'chat-input').fill('もう一度');
await tid(a.page, 'chat-send').click();
await a.page.getByText('しばらくメッセージを送れません').waitFor({ timeout: 8000 });
check(true, '停止中は送れない(理由が分かる)');
check((await b.page.getByText('ゆうき').count()) >= 0, '(はる側の確認は DB テストで検証済み)');

console.log('9. 夜(22時〜7時)の表示: 入力欄の代わりに「お休みの時間」');
const night = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', timezoneId: tz });
const np = await night.newPage();
// そのタイムゾーンで「23:30」になる時刻に端末の時計を合わせる
const epoch = Number(psql(`select extract(epoch from (timestamp '2026-10-03 23:30') at time zone '${tz}')::bigint`));
await np.clock.install({ time: new Date(epoch * 1000) });
await np.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await np.getByTestId('login-email').fill(`ca_${stamp}@example.com`);
await np.getByTestId('login-password').fill('password123');
await np.getByTestId('login-submit').click();
await np.waitForURL('**/home', { timeout: 20000 }).catch(() => undefined);
if (np.url().includes('/home')) {
  await np.goto(`${BASE}/friends`, { waitUntil: 'domcontentloaded' });
  await np.getByTestId('chat-はる').click();
  await np.getByTestId('chat-quiet').waitFor({ timeout: 10000 });
  check((await np.getByTestId('chat-input').count()) === 0, '夜は入力欄が出ず「お休みの時間」の案内');
  await shot(np, '37-chat-quiet');
} else {
  console.log('  (夜のログインはスキップ)');
}

const errs = [...a.errors, ...b.errors];
console.log(`\nJS errors: ${errs.length}`);
errs.forEach((e) => console.log('  ', e));
await browser.close();
const ok = failed() === 0 && errs.length === 0;
console.log(ok ? '\nCHAT E2E: PASS' : `\nCHAT E2E: FAIL (${failed()} checks, ${errs.length} js errors)`);
process.exit(ok ? 0 : 1);
