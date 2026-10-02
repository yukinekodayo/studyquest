// supabase/migrations/*.sql を1本にまとめて supabase/setup_all.sql に出力する。
// Supabase ダッシュボードの SQL Editor に貼り付けて実行するための物。  node scripts/build-setup-sql.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '../supabase/migrations');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const body = files.map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8')}`).join('\n');
const header = `-- StudyQuest: Supabase セットアップ用SQL(自動生成: scripts/build-setup-sql.mjs)\n-- 空のプロジェクトの SQL Editor に全文を貼り付けて、1回だけ実行してください。\n\n`;
fs.writeFileSync(path.resolve(import.meta.dirname, '../supabase/setup_all.sql'), header + body);
console.log(`wrote supabase/setup_all.sql (${files.length} migrations)`);
