// アプリアイコン/スプラッシュ(SVG → PNG)を生成する。  node scripts/make-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.resolve(import.meta.dirname, '../assets');
fs.mkdirSync(out, { recursive: true });

const stamp = (fg, bg, scale = 1) => `
<g transform="translate(512 512) scale(${scale}) translate(-512 -512)">
  <circle cx="512" cy="512" r="330" fill="${bg}" stroke="${fg}" stroke-width="36"/>
  <circle cx="512" cy="512" r="262" fill="none" stroke="${fg}" stroke-width="10" stroke-dasharray="6 26" stroke-linecap="round"/>
  <path d="M372 520 L470 620 L664 410" fill="none" stroke="${fg}" stroke-width="64" stroke-linecap="round" stroke-linejoin="round"/>
</g>`;

const svgs = {
  'icon.png': `<rect width="1024" height="1024" fill="#2F6FE0"/>${stamp('#FFFFFF', '#2F6FE0')}`,
  'adaptive-icon.png': stamp('#FFFFFF', '#2F6FE0', 0.8).replace('fill="#2F6FE0"', 'fill="#2F6FE0"'),
  'splash.png': `<rect width="1024" height="1024" fill="#FBF6EA"/>${stamp('#2F6FE0', '#FBF6EA', 0.6)}`,
  'favicon.png': `<rect width="1024" height="1024" rx="220" fill="#2F6FE0"/>${stamp('#FFFFFF', '#2F6FE0')}`,
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, body] of Object.entries(svgs)) {
  const transparent = name === 'adaptive-icon.png';
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : '#fff'}"><svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg></body></html>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: transparent });
  console.log('wrote', name);
}
await browser.close();
