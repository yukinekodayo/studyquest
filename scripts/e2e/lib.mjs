// E2E 共通: スマホ幅のChromiumでアプリ(Expo Web)を操作する
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright-core';

export const BASE = process.env.APP_URL ?? 'http://localhost:8081';
export const SHOTS = process.env.SHOTS_DIR ?? '/tmp/studyquest-shots';
fs.mkdirSync(SHOTS, { recursive: true });

export async function launch() {
  const executablePath = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  return chromium.launch({ executablePath });
}

export async function newUser(browser, label, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'ja-JP', timezoneId: opts.timezoneId ?? 'Asia/Tokyo', colorScheme: opts.colorScheme ?? 'light' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource.*(400|401|404|422)/.test(m.text())) errors.push(`[${label}] console.error: ${m.text().slice(0, 200)}`);
  });
  return { ctx, page, errors, label };
}

export const tid = (page, id) => page.getByTestId(id);
export const text = (page, t) => page.getByText(t, { exact: false }).first();

export async function shot(page, name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

export async function signup(page, { nickname, avatar = 'blue', email, password = 'password123' }) {
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await tid(page, `avatar-${avatar}`).click();
  await tid(page, 'signup-nickname').fill(nickname);
  await tid(page, 'signup-email').fill(email);
  await tid(page, 'signup-password').fill(password);
  await tid(page, 'signup-submit').click();
  await page.waitForURL('**/home', { timeout: 20000 });
}

export async function addTask(page, { title, minutes = 20, kind = 'must' }) {
  await tid(page, 'add-task').click();
  await tid(page, 'task-title-input').fill(title);
  await tid(page, `minutes-${minutes}`).click();
  await tid(page, `kind-${kind}`).click();
  await tid(page, 'task-save').click();
  await tid(page, `quest-task-${title}`).waitFor({ timeout: 10000 });
}

let failures = 0;
export function check(cond, msg) {
  if (cond) console.log(`  ok   ${msg}`);
  else {
    failures++;
    console.log(`  FAIL ${msg}`);
  }
}
export const failed = () => failures;

/** ローカルスタックのDBを直接操作する(テスト用の下ごしらえ: 運営アカウントの付与など) */
export function psql(sql) {
  return execFileSync('psql', ['-h', '127.0.0.1', '-p', process.env.LOCAL_PG_PORT ?? '54322', '-U', 'postgres', 'studyquest', '-tAc', sql]).toString().trim();
}

/** いま現地時刻が昼(10〜16時)のタイムゾーン名(夜間制限に左右されないテストのため) */
export function daytimeZone() {
  return psql("select name from pg_timezone_names where name ~ '^[A-Z][a-z]+/' and extract(hour from now() at time zone name) between 10 and 16 order by name limit 1");
}
