// ローカル開発用スタック: Postgres + PostgREST + 最小の認証サーバー(すべて開発専用)
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const PG_BIN = process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin';
const PGRST = process.env.POSTGREST_BIN ?? 'postgrest';
const DATA = process.env.LOCAL_STACK_DIR ?? '/tmp/studyquest-local-stack';
const PG_PORT = Number(process.env.LOCAL_PG_PORT ?? 54322);
const REST_PORT = 54323;
const GATEWAY_PORT = Number(process.env.LOCAL_GATEWAY_PORT ?? 54321);
const JWT_SECRET = 'local-dev-only-secret-local-dev-only-secret';
const DB = 'studyquest';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function sign(claims) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(claims);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = (token ?? '').split('.');
  if (!h || !b || !s) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
  if (expected !== s) return null;
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  return claims.exp && claims.exp < Date.now() / 1000 ? null : claims;
}
const ANON_KEY = sign({ role: 'anon', iss: 'local', iat: 1700000000, exp: 4102444800 });

function asPostgres(cmd) {
  if (process.getuid?.() === 0) execFileSync('su', ['postgres', '-c', cmd], { stdio: 'pipe' });
  else execFileSync('sh', ['-c', cmd], { stdio: 'pipe' });
}

async function startPostgres() {
  fs.mkdirSync(DATA, { recursive: true });
  if (process.getuid?.() === 0) execFileSync('chown', ['postgres', DATA]);
  const fresh = !fs.existsSync(path.join(DATA, 'data'));
  if (fresh) asPostgres(`${PG_BIN}/initdb -D ${DATA}/data -A trust -U postgres`);
  try {
    asPostgres(`${PG_BIN}/pg_ctl -D ${DATA}/data -o '-p ${PG_PORT} -k ${DATA} -c listen_addresses=127.0.0.1 -c fsync=off' -l ${DATA}/log -w start`);
  } catch {
    /* すでに起動中 */
  }
  const admin = new pg.Client({ connectionString: `postgres://postgres@127.0.0.1:${PG_PORT}/postgres` });
  await admin.connect();
  const exists = (await admin.query('select 1 from pg_database where datname = $1', [DB])).rowCount > 0;
  if (!exists) await admin.query(`create database ${DB}`);
  await admin.end();

  const c = new pg.Client({ connectionString: `postgres://postgres@127.0.0.1:${PG_PORT}/${DB}` });
  await c.connect();
  const applied = (await c.query("select to_regclass('public.tasks') as t")).rows[0].t;
  if (!applied) {
    await c.query(fs.readFileSync(path.join(root, 'tests/db/stub_auth.sql'), 'utf8'));
    await c.query(`
      create table auth.local_credentials (user_id uuid primary key references auth.users(id) on delete cascade, salt text not null, hash text not null);
      create role authenticator login noinherit password 'authenticator';
      grant anon, authenticated to authenticator;`);
    const dir = path.join(root, 'supabase/migrations');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
      await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    }
    console.log('migrations applied');
  }
  await c.end();
}

function startPostgrest() {
  const child = spawn(PGRST, [], {
    env: {
      ...process.env,
      PGRST_DB_URI: `postgres://authenticator:authenticator@127.0.0.1:${PG_PORT}/${DB}`,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: JWT_SECRET,
      PGRST_SERVER_PORT: String(REST_PORT),
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_DB_POOL: '10',
    },
    stdio: 'inherit',
  });
  child.on('exit', (code) => console.log('postgrest exited', code));
  return child;
}

const refreshTokens = new Map(); // refresh_token -> userId

function sessionFor(user, meta) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ aud: 'authenticated', role: 'authenticated', sub: user.id, email: user.email, iat: now, exp: now + 3600 });
  const refresh = crypto.randomBytes(16).toString('hex');
  refreshTokens.set(refresh, user.id);
  return {
    access_token: access,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refresh,
    user: userJson(user, meta),
  };
}
function userJson(user, meta) {
  return {
    id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
    email_confirmed_at: new Date().toISOString(), phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: meta ?? user.raw_user_meta_data ?? {},
    identities: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

async function gateway(pool) {
  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'content-type': 'application/json', ...headers });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch { resolve({}); } });
  });
  const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });

  const server = http.createServer(async (req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', '*');
    res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-expose-headers', '*');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    const url = new URL(req.url, 'http://x');

    if (url.pathname.startsWith('/rest/v1/')) {
      const upstream = http.request(
        { host: '127.0.0.1', port: REST_PORT, method: req.method, path: url.pathname.replace('/rest/v1', '') + url.search, headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` } },
        (up) => { res.writeHead(up.statusCode ?? 502, up.headers); up.pipe(res); },
      );
      upstream.on('error', () => send(res, 502, { message: 'postgrest unavailable' }));
      return void req.pipe(upstream);
    }

    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password, data } = await readBody(req);
      if (!email || !password || password.length < 6) return authError(res, 422, 'weak_password', 'Password should be at least 6 characters.');
      const existing = await pool.query('select id from auth.users where lower(email) = lower($1)', [email]);
      if (existing.rowCount) return authError(res, 422, 'user_already_exists', 'User already registered');
      const id = crypto.randomUUID();
      const salt = crypto.randomBytes(8).toString('hex');
      const hash = crypto.scryptSync(password, salt, 32).toString('hex');
      await pool.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [id, email, JSON.stringify(data ?? {})]);
      await pool.query('insert into auth.local_credentials (user_id, salt, hash) values ($1, $2, $3)', [id, salt, hash]);
      return send(res, 200, sessionFor({ id, email }, data));
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = await readBody(req);
      if (grant === 'password') {
        const r = await pool.query('select u.id, u.email, u.raw_user_meta_data, c.salt, c.hash from auth.users u join auth.local_credentials c on c.user_id = u.id where lower(u.email) = lower($1)', [body.email ?? '']);
        const row = r.rows[0];
        if (!row || crypto.scryptSync(body.password ?? '', row.salt, 32).toString('hex') !== row.hash) {
          return authError(res, 400, 'invalid_credentials', 'Invalid login credentials');
        }
        return send(res, 200, sessionFor(row));
      }
      if (grant === 'refresh_token') {
        const uid = refreshTokens.get(body.refresh_token);
        const r = uid ? await pool.query('select id, email, raw_user_meta_data from auth.users where id = $1', [uid]) : { rows: [] };
        if (!r.rows[0]) return authError(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
        refreshTokens.delete(body.refresh_token);
        return send(res, 200, sessionFor(r.rows[0]));
      }
      return authError(res, 400, 'validation_failed', 'unsupported grant type');
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const claims = verify((req.headers.authorization ?? '').replace(/^Bearer /, ''));
      if (!claims?.sub) return authError(res, 401, 'bad_jwt', 'invalid JWT');
      const r = await pool.query('select id, email, raw_user_meta_data from auth.users where id = $1', [claims.sub]);
      if (!r.rows[0]) return authError(res, 403, 'user_not_found', 'User from sub claim in JWT does not exist');
      return send(res, 200, userJson(r.rows[0]));
    }
    if (url.pathname === '/auth/v1/logout') return void res.writeHead(204).end();
    send(res, 404, { message: 'not found' });
  });
  await new Promise((resolve) => server.listen(GATEWAY_PORT, '0.0.0.0', resolve));
}

await startPostgres();
const pool = new pg.Pool({ connectionString: `postgres://postgres@127.0.0.1:${PG_PORT}/${DB}`, max: 4 });
const rest = startPostgrest();
await new Promise((r) => setTimeout(r, 1500));
await gateway(pool);
console.log(`\nlocal stack ready\n  EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:${GATEWAY_PORT}\n  EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}\n`);
process.on('SIGINT', () => { rest.kill(); process.exit(0); });
process.on('SIGTERM', () => { rest.kill(); process.exit(0); });
