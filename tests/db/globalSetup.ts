import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const ROOT = '/tmp/studyquest-test-pg';
const PORT = 54329;
export const ADMIN_URL = `postgres://postgres@127.0.0.1:${PORT}/postgres`;
export const TEMPLATE_DB = 'sq_template';

function asPostgres(cmd: string): void {
  const isRoot = process.getuid?.() === 0;
  if (isRoot) execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
  else execFileSync('sh', ['-c', cmd], { stdio: 'pipe' });
}

export default async function setup(): Promise<() => Promise<void>> {
  let started = false;
  const externalUrl = process.env.TEST_DATABASE_ADMIN_URL;
  const adminUrl = externalUrl ?? ADMIN_URL;

  if (!externalUrl) {
    fs.rmSync(ROOT, { recursive: true, force: true });
    fs.mkdirSync(ROOT, { recursive: true });
    if (process.getuid?.() === 0) execFileSync('chown', ['postgres', ROOT]);
    asPostgres(`${PG_BIN}/initdb -D ${ROOT}/data -A trust -U postgres`);
    asPostgres(
      `${PG_BIN}/pg_ctl -D ${ROOT}/data -o '-p ${PORT} -k ${ROOT} -c listen_addresses=127.0.0.1 -c fsync=off' -l ${ROOT}/log -w start`,
    );
    started = true;
  }

  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`drop database if exists ${TEMPLATE_DB}`);
  await admin.query(`create database ${TEMPLATE_DB}`);
  await admin.end();

  const tpl = new pg.Client({ connectionString: adminUrl.replace(/\/[^/]*$/, `/${TEMPLATE_DB}`) });
  await tpl.connect();
  await tpl.query(fs.readFileSync(path.join(__dirname, 'stub_auth.sql'), 'utf8'));
  const dir = path.join(__dirname, '../../supabase/migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await tpl.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  await tpl.end();

  process.env.TEST_DATABASE_ADMIN_URL = adminUrl;
  return async () => {
    if (started) {
      spawnSync('su', ['postgres', '-c', `${PG_BIN}/pg_ctl -D ${ROOT}/data -m immediate stop`]);
    }
  };
}
