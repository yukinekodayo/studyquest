// Phase 1 通しE2E: 新規登録 → 計画作成 → タスク開始 → タイマー → 完了 → 全部達成 → ハンコ → ハンコ帳 → リロード後も保持
import { addTask, BASE, check, failed, launch, newUser, shot, signup, tid } from './lib.mjs';

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const email = `p1_${Date.now()}@example.com`;
const browser = await launch();
const u = await newUser(browser, 'u1');
const { page } = u;

console.log('1. 新規登録');
await signup(page, { nickname: 'ゆうき', avatar: 'cat', email });
await tid(page, 'greeting').waitFor();
check(norm(await tid(page, 'greeting').textContent()) === 'こんにちは、ゆうきさん', 'ホームに「こんにちは、ゆうきさん」');
await shot(page, '01-home-empty');

console.log('2. 今日の計画を作る');
await tid(page, 'go-add-task').click();
await page.waitForURL('**/quest');
await addTask(page, { title: '英単語', minutes: 20 });
await addTask(page, { title: '数学', minutes: 30 });
await addTask(page, { title: '学校の宿題', minutes: 20 });
await addTask(page, { title: '読書', minutes: 15 });
await addTask(page, { title: '英語リスニング', minutes: 10, kind: 'bonus' });
check(norm(await tid(page, 'total-minutes').textContent()) === '1時間25分', '合計予定時間 1時間25分(ボーナスは含まない)');
check(norm(await tid(page, 'quest-progress').textContent()) === '0/4', '進捗 0/4');
await shot(page, '02-quest-list');

console.log('3. 並び替え・編集・削除');
await tid(page, 'toggle-edit').click();
await page.getByLabel('上へ').nth(1).click(); // 数学を上へ
await page.waitForTimeout(600);
const order = await page.locator('[data-testid^="quest-task-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
check(order[0] === 'quest-task-数学' && order[1] === 'quest-task-英単語', `並び替え: ${order.slice(0, 3).join(', ')}`);
await tid(page, 'edit-読書').click();
await tid(page, 'task-title-input').fill('読書(小説)');
await tid(page, 'minutes-15').click();
await tid(page, 'task-save').click();
await tid(page, 'quest-task-読書(小説)').waitFor();
await tid(page, 'edit-読書(小説)').click();
await tid(page, 'task-delete').click();
await tid(page, 'task-delete-confirm').click();
await page.waitForTimeout(800);
check((await tid(page, 'quest-task-読書(小説)').count()) === 0, '削除できた');
await addTask(page, { title: '読書', minutes: 15 });
await tid(page, 'toggle-edit').click();
check(norm(await tid(page, 'quest-progress').textContent()) === '0/4', '進捗 0/4(4つに戻した)');

console.log('4. バリデーション(空のタスク名)');
await tid(page, 'add-task').click();
await tid(page, 'task-save').click();
check(await page.getByText('やることを入力してね').isVisible(), '空のタスク名はエラー表示');
await tid(page, 'sheet-close').click();

console.log('5. ホーム → タスク開始 → タイマー');
await tid(page, 'nav-home').click();
await page.waitForURL('**/home');
await tid(page, 'home-cta-start').waitFor();
check(norm(await tid(page, 'progress-text').textContent()) === '0 / 4', 'ホームの進捗 0 / 4');
check((await tid(page, 'reward-banner').textContent()).includes('通常ハンコ'), '報酬の予告(通常ハンコ)');
await shot(page, '03-home-planned');
await tid(page, 'home-cta-start').click();
await page.waitForURL(/\/quest\/[0-9a-f-]{36}/);
const clock = tid(page, 'timer-clock');
await clock.waitFor();
check(/^\d\d:\d\d$/.test(norm(await clock.textContent())), `タイマー表示 ${norm(await clock.textContent())}`);
const t1 = norm(await clock.textContent());
await page.waitForTimeout(2200);
const t2 = norm(await clock.textContent());
check(t1 !== t2, `カウントダウンが進む ${t1} → ${t2}`);
await shot(page, '04-timer');

console.log('6. 一時停止/再開 と リロードしても時間がずれない');
await tid(page, 'timer-pause').click();
await page.waitForTimeout(700);
const p1 = norm(await clock.textContent());
await page.waitForTimeout(1800);
const p2 = norm(await clock.textContent());
check(p1 === p2, `一時停止中は止まる ${p1}`);
await tid(page, 'timer-pause').click(); // 再開
await page.waitForTimeout(500);
const urlTimer = page.url();
await page.reload({ waitUntil: 'domcontentloaded' });
await tid(page, 'timer-clock').waitFor({ timeout: 20000 });
const afterReload = norm(await tid(page, 'timer-clock').textContent());
check(page.url() === urlTimer && /^\d\d:\d\d$/.test(afterReload), `リロード後もタイマー継続 ${afterReload}`);

console.log('7. 終了 → 完了画面 → 次のタスクへ');
await tid(page, 'timer-finish').click();
await tid(page, 'done-title').waitFor({ timeout: 15000 });
check(norm(await tid(page, 'done-title').textContent()).includes('完了'), '「◯◯ 完了！」表示');
check(norm(await tid(page, 'done-progress').textContent()) === '1 / 4', '進捗 1 / 4');
await shot(page, '05-task-done');
for (let i = 0; i < 2; i++) {
  await tid(page, 'next-task').click();
  await tid(page, 'timer-clock').waitFor({ timeout: 15000 });
  if (i === 1) await shot(page, '06-timer-last-but-one');
  await tid(page, 'timer-finish').click();
  await tid(page, 'done-title').waitFor({ timeout: 15000 });
}
check(norm(await tid(page, 'done-progress').textContent()) === '3 / 4', '進捗 3 / 4');
await shot(page, '07-task-done-3of4');

console.log('8. 最後の1つ → TODAY COMPLETE!');
await tid(page, 'next-task').click();
await tid(page, 'timer-clock').waitFor();
await tid(page, 'timer-finish').click();
await page.waitForURL('**/complete', { timeout: 20000 });
await tid(page, 'press-stamp').waitFor({ timeout: 15000 });
check(norm(await tid(page, 'all-done').textContent()).includes('4 / 4'), '4 / 4 ぜんぶ達成');
check((await tid(page, 'stamp-earned').count()) === 0, '達成しただけではハンコは押されていない(自分で押す)');
check(norm(await tid(page, 'stamp-pending').textContent()).includes('押そう'), '「今日のハンコを押そう！」');
check(norm(await tid(page, 'streak-count').textContent()) === '1', '1日連続達成');
await shot(page, '08a-complete-before-press');
await tid(page, 'press-stamp').click();
await tid(page, 'stamp-earned').waitFor({ timeout: 15000 });
check(norm(await tid(page, 'stamp-earned').textContent()).includes('ハンコ'), 'ハンコを押した → 獲得メッセージ');
await page.waitForTimeout(1200);
await shot(page, '08-complete');

console.log('9. リロードしてもハンコ・達成が保持されている(DB保存)');
await page.reload({ waitUntil: 'domcontentloaded' });
await tid(page, 'stamp-earned').waitFor({ timeout: 20000 });
check(true, '/complete をリロードしても表示できる');
await tid(page, 'to-home').click();
await page.waitForURL('**/home');
await tid(page, 'home-cta-complete').waitFor();
check(norm(await tid(page, 'home-cta-complete').textContent()).includes('ハンコを見る'), 'ホーム: 押した後は「ハンコを見る」');
check(norm(await tid(page, 'progress-text').textContent()) === '4 / 4', 'ホーム 4 / 4');
check(norm(await tid(page, 'streak-value').textContent()) === '1日', '連続 1日');
await shot(page, '09-home-cleared');

console.log('10. ハンコ帳で確認');
await tid(page, 'nav-profile').click();
await tid(page, 'to-stamps-book').click();
await page.waitForURL('**/stamps');
const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
const dayCell = tid(page, `day-${today.getDate()}-normal`);
await dayCell.waitFor({ timeout: 15000 });
check(true, `今日(${today.getDate()}日)のセルにハンコが押されている`);
check(norm(await tid(page, 'stat-total').textContent()).startsWith('1'), '累計達成 1日');
check(norm(await tid(page, 'stat-current').textContent()).startsWith('1'), '現在の連続 1日');
await shot(page, '10-stamps-book');
await tid(page, 'prev-month').click();
await page.waitForTimeout(600);
await tid(page, 'next-month').click();

console.log('11. 同じ日に再度タスクを完了してもハンコは増えない');
await tid(page, 'nav-quest').click();
await addTask(page, { title: '追加のタスク', minutes: 10 });
await tid(page, 'start-追加のタスク').click();
await tid(page, 'timer-finish').click();
await tid(page, 'done-title').waitFor({ timeout: 15000 });
check(!page.url().includes('/complete'), '2回目は「TODAY COMPLETE」に飛ばない(二重付与なし)');
await tid(page, 'to-quest').click().catch(() => undefined);
await page.goto(`${BASE}/stamps`, { waitUntil: 'domcontentloaded' });
await tid(page, 'stat-total').waitFor();
check(norm(await tid(page, 'stat-total').textContent()).startsWith('1'), '累計達成は1日のまま');

console.log('11.5 再取得ループが起きていない(アイドル時のAPI呼び出し回数)');
for (const path of ['home', 'quest', 'friends', 'stamps', 'profile', 'groups', 'study-party']) {
  await page.goto(`${BASE}/${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  let n = 0;
  const onReq = (r) => { if (r.url().includes('/rest/v1/')) n++; };
  page.on('request', onReq);
  await page.waitForTimeout(5000);
  page.off('request', onReq);
  check(n <= 8, `/${path}: アイドル5秒間のAPI呼び出し ${n} 回(ポーリングのみ)`);
}

console.log('12. マイページ');
await tid(page, 'nav-profile').click();
await tid(page, 'profile-name').waitFor();
check(norm(await tid(page, 'profile-name').textContent()) === 'ゆうき', 'ニックネーム表示');
await shot(page, '11-profile');

console.log(`\nJS errors: ${u.errors.length}`);
u.errors.forEach((e) => console.log('  ', e));
await browser.close();
console.log(failed() === 0 && u.errors.length === 0 ? '\nPHASE1 E2E: PASS' : `\nPHASE1 E2E: FAIL (${failed()} checks, ${u.errors.length} js errors)`);
process.exit(failed() === 0 && u.errors.length === 0 ? 0 : 1);
