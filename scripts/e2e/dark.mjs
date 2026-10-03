// ダークモード: 端末設定に従う / 設定で切り替え / 再読み込み後も保持
import { launch, newUser, signup, addTask, tid, shot, check, failed } from './lib.mjs';

const browser = await launch();
const stamp = Date.now();
const u = await newUser(browser, 'dark', { colorScheme: 'dark' });
const bgOf = () => u.page.evaluate(() => getComputedStyle(document.body).backgroundColor);

await signup(u.page, { nickname: 'やみ', email: `dk_${stamp}@example.com` });
await u.page.waitForURL('**/home', { timeout: 20000 });
check((await bgOf()) === 'rgb(15, 17, 24)', '端末がダークなら、ダークで起動する');
await shot(u.page, 'd1-home-empty');

await u.page.goto('http://localhost:8081/quest', { waitUntil: 'domcontentloaded' });
await addTask(u.page, { title: '数学', minutes: 20 });
await shot(u.page, 'd2-quest');
await u.page.goto('http://localhost:8081/home', { waitUntil: 'domcontentloaded' });
await tid(u.page, 'progress-text').waitFor({ timeout: 15000 });
await shot(u.page, 'd3-home');
for (const [p, n] of [['stamps', 'd4-stamps'], ['friends', 'd5-friends'], ['groups', 'd6-groups'], ['profile', 'd7-profile'], ['settings', 'd8-settings']]) {
  await u.page.goto(`http://localhost:8081/${p}`, { waitUntil: 'domcontentloaded' });
  await u.page.waitForTimeout(1200);
  await shot(u.page, n);
}
await tid(u.page, 'theme-light').click();
await u.page.waitForTimeout(600);
check((await bgOf()) === 'rgb(244, 242, 237)', '設定で「ライト」にすると切り替わる');
check(u.page.url().includes('/settings'), '切り替えても今の画面に残る');
await shot(u.page, 'd9-settings-light');
await u.page.reload({ waitUntil: 'domcontentloaded' });
await tid(u.page, 'theme-light').waitFor({ timeout: 15000 });
check((await bgOf()) === 'rgb(244, 242, 237)', '再読み込みしても選んだ外観が残る');
await tid(u.page, 'theme-dark').click();
await u.page.waitForTimeout(600);
check((await bgOf()) === 'rgb(15, 17, 24)', '設定で「ダーク」にできる');
await tid(u.page, 'theme-system').click();
await u.page.waitForTimeout(600);
check((await bgOf()) === 'rgb(15, 17, 24)', '「自動」で端末(ダーク)に戻る');

console.log('JS errors:', u.errors.length);
u.errors.forEach((e) => console.log(e));
await browser.close();
console.log(failed() === 0 && u.errors.length === 0 ? '\nDARK E2E: PASS' : `\nDARK E2E: FAIL`);
process.exit(failed() === 0 && u.errors.length === 0 ? 0 : 1);
