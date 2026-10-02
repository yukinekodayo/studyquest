-- StudyQuest: Supabase セットアップ用SQL(自動生成: scripts/build-setup-sql.mjs)
-- 空のプロジェクトの SQL Editor に全文を貼り付けて、1回だけ実行してください。

-- ===== 20260930000001_core.sql =====
-- StudyQuest core schema (Phase 1 + Phase 2)
-- 方針:
--  * ゲームロジック(達成判定・連続日数・ハンコ・XP)はすべてSQL関数(security definer)で実行する
--  * クライアントは tasks の状態列や達成テーブルを直接更新できない(列権限 + RLS)
--  * 友だちの進捗は集計関数経由でのみ取得(友だちの tasks を直接読ませない)

------------------------------------------------------------------
-- 定義テーブル
------------------------------------------------------------------
create table public.stamp_types (
  code        text primary key,
  name        text not null,
  min_streak  int  not null default 0,
  sort_order  int  not null
);
alter table public.stamp_types enable row level security;

insert into public.stamp_types (code, name, min_streak, sort_order) values
  ('normal',  '通常ハンコ', 0,   1),
  ('blue',    '青ハンコ',   7,   2),
  ('green',   '緑ハンコ',   30,  3),
  ('gold',    '金ハンコ',   60,  4),
  ('special', '特別ハンコ', 100, 5),
  ('team',    '協力ハンコ', 0,   6);

------------------------------------------------------------------
-- プロフィール(個人情報は持たない: ニックネームとアイコンのみ)
------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nickname      text not null check (char_length(btrim(nickname)) between 1 and 12),
  avatar        text not null default 'cat'
                check (avatar in ('cat','frog','panda','rabbit','shiba','bear','penguin','fox')),
  friend_code   text not null unique check (friend_code ~ '^[A-Z2-9]{8}$'),
  timezone      text not null default 'Asia/Tokyo',
  share_subject boolean not null default true,  -- 勉強中の教科名を友だちに見せる
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create table public.user_stats (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  xp                  int  not null default 0 check (xp >= 0),
  current_streak      int  not null default 0 check (current_streak >= 0),
  longest_streak      int  not null default 0 check (longest_streak >= 0),
  total_days          int  not null default 0 check (total_days >= 0),
  last_completed_date date
);
alter table public.user_stats enable row level security;

------------------------------------------------------------------
-- タスク
------------------------------------------------------------------
create or replace function public._user_today(p_uid uuid) returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select (now() at time zone coalesce((select timezone from public.profiles where id = p_uid), 'Asia/Tokyo'))::date
$$;

create or replace function public.app_today() returns date
language sql stable security definer set search_path = public, pg_temp as $$
  select public._user_today(auth.uid())
$$;

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  task_date       date not null default public.app_today(),
  title           text not null check (char_length(btrim(title)) between 1 and 40),
  planned_minutes int  not null check (planned_minutes between 1 and 600),
  kind            text not null default 'must' check (kind in ('must','bonus')),
  status          text not null default 'todo' check (status in ('todo','doing','done')),
  sort_order      int  not null default 0,
  xp_awarded      int  not null default 0 check (xp_awarded >= 0),
  completed_at    timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.tasks enable row level security;
create index tasks_user_date_idx on public.tasks (user_id, task_date, sort_order);

------------------------------------------------------------------
-- 学習セッション(タイマー)
-- 時間は「開始時刻 + 累積秒 + 現在の走行開始時刻」から計算する。
-- ページ/アプリを閉じても setInterval に依存せずズレない。
------------------------------------------------------------------
create table public.study_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  task_id             uuid not null references public.tasks(id) on delete cascade,
  status              text not null default 'running' check (status in ('running','paused','finished')),
  started_at          timestamptz not null default now(),
  run_started_at      timestamptz,                       -- running のときのみ
  accumulated_seconds int  not null default 0 check (accumulated_seconds >= 0),
  ended_at            timestamptz,
  actual_seconds      int check (actual_seconds >= 0),
  check ((status = 'running') = (run_started_at is not null))
);
alter table public.study_sessions enable row level security;
create unique index study_sessions_one_open_per_task on public.study_sessions (task_id) where status <> 'finished';
create unique index study_sessions_one_running_per_user on public.study_sessions (user_id) where status = 'running';
create index study_sessions_user_idx on public.study_sessions (user_id, started_at desc);

------------------------------------------------------------------
-- 達成・ハンコ
------------------------------------------------------------------
create table public.daily_completions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  completed_date date not null,
  must_total     int  not null,
  streak_count   int  not null check (streak_count >= 1),
  created_at     timestamptz not null default now(),
  unique (user_id, completed_date)              -- 1日1回だけ
);
alter table public.daily_completions enable row level security;

create table public.stamps (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  stamp_type   text not null references public.stamp_types(code),
  earned_date  date not null,
  streak_count int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, earned_date)                 -- 同じ日にハンコは1つだけ
);
alter table public.stamps enable row level security;

------------------------------------------------------------------
-- フレンド
------------------------------------------------------------------
create table public.friend_requests (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user),
  unique (from_user, to_user)
);
alter table public.friend_requests enable row level security;

create table public.friendships (
  user_a     uuid not null references public.profiles(id) on delete cascade,
  user_b     uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table public.friendships enable row level security;
create index friendships_b_idx on public.friendships (user_b);

create table public.reactions (
  id            uuid primary key default gen_random_uuid(),
  from_user     uuid not null references public.profiles(id) on delete cascade,
  to_user       uuid not null references public.profiles(id) on delete cascade,
  kind          text not null check (kind in ('clap','fire','party','book')),
  reaction_date date not null,
  created_at    timestamptz not null default now(),
  check (from_user <> to_user),
  unique (from_user, to_user, reaction_date, kind)
);
alter table public.reactions enable row level security;
create index reactions_to_idx on public.reactions (to_user, reaction_date);

------------------------------------------------------------------
-- ヘルパー
------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  )
$$;

create or replace function public._has_pending_request(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((from_user = a and to_user = b) or (from_user = b and to_user = a))
  )
$$;

-- 通常0 / 7の倍数=青 / 30の倍数=緑 / 60の倍数=金 / 100の倍数=特別(大きい節目を優先)
create or replace function public.stamp_for_streak(n int) returns text
language sql immutable as $$
  select case
    when n >= 1 and n % 100 = 0 then 'special'
    when n >= 1 and n % 60  = 0 then 'gold'
    when n >= 1 and n % 30  = 0 then 'green'
    when n >= 1 and n % 7   = 0 then 'blue'
    else 'normal'
  end
$$;

create or replace function public._gen_friend_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end $$;

------------------------------------------------------------------
-- サインアップ時にプロフィール作成
------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nick text := btrim(coalesce(meta->>'nickname', ''));
  av text := coalesce(meta->>'avatar', 'cat');
  tz text := coalesce(meta->>'timezone', 'Asia/Tokyo');
begin
  if char_length(nick) < 1 or char_length(nick) > 12 then nick := 'ゲスト'; end if;
  if av not in ('cat','frog','panda','rabbit','shiba','bear','penguin','fox') then av := 'cat'; end if;
  if not exists (select 1 from pg_timezone_names where name = tz) then tz := 'Asia/Tokyo'; end if;
  insert into public.profiles (id, nickname, avatar, friend_code, timezone)
    values (new.id, nick, av, public._gen_friend_code(), tz);
  insert into public.user_stats (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------------
-- タスクのサーバー側バリデーション
------------------------------------------------------------------
create or replace function public._tasks_before_write() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date;
begin
  new.title := btrim(new.title);
  if tg_op = 'INSERT' then
    today := public._user_today(new.user_id);
    if new.task_date < today or new.task_date > today + 7 then
      raise exception 'SQ_TASK_DATE_INVALID';
    end if;
    if (select count(*) from public.tasks where user_id = new.user_id and task_date = new.task_date) >= 20 then
      raise exception 'SQ_TASK_LIMIT';
    end if;
    new.sort_order := coalesce((select max(sort_order) from public.tasks
                                where user_id = new.user_id and task_date = new.task_date), 0) + 1;
    new.status := 'todo';
    new.xp_awarded := 0;
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_before_write
  before insert or update of title on public.tasks
  for each row execute function public._tasks_before_write();

------------------------------------------------------------------
-- 内部関数: セッション終了 / 1日の達成判定
------------------------------------------------------------------
-- 未終了セッションを閉じ、そのタスクの合計学習秒数を返す
create or replace function public._close_sessions(p_task_id uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.study_sessions s
     set status = 'finished',
         ended_at = now(),
         actual_seconds = least(28800, s.accumulated_seconds
           + case when s.status = 'running'
                  then floor(extract(epoch from (now() - s.run_started_at)))::int else 0 end),
         accumulated_seconds = least(28800, s.accumulated_seconds
           + case when s.status = 'running'
                  then floor(extract(epoch from (now() - s.run_started_at)))::int else 0 end),
         run_started_at = null
   where s.task_id = p_task_id and s.status <> 'finished';
  return coalesce((select sum(actual_seconds) from public.study_sessions where task_id = p_task_id), 0)::int;
end $$;

-- 今日の「絶対やる」が全部完了していれば達成記録+ハンコを(1回だけ)作る
create or replace function public._evaluate_day(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date;
  must_total int;
  must_done int;
  prev_streak int;
  new_streak int;
  stamp text;
  comp_id uuid;
  clear_bonus constant int := 50;
begin
  if not exists (select 1 from public.profiles where id = p_uid) then
    return jsonb_build_object('cleared', false, 'newly_cleared', false);
  end if;
  today := public._user_today(p_uid);

  select count(*) filter (where kind = 'must'),
         count(*) filter (where kind = 'must' and status = 'done')
    into must_total, must_done
    from public.tasks where user_id = p_uid and task_date = today;

  -- すでに達成済みなら二重付与しない
  select streak_count into new_streak from public.daily_completions
    where user_id = p_uid and completed_date = today;
  if found then
    select stamp_type into stamp from public.stamps where user_id = p_uid and earned_date = today;
    return jsonb_build_object('cleared', true, 'newly_cleared', false, 'must_total', must_total,
                              'must_done', must_done, 'streak', new_streak, 'stamp_type', stamp);
  end if;

  if must_total = 0 or must_done < must_total then
    return jsonb_build_object('cleared', false, 'newly_cleared', false,
                              'must_total', must_total, 'must_done', must_done);
  end if;

  -- 同一ユーザーの同時実行を直列化
  perform 1 from public.user_stats where user_id = p_uid for update;

  select streak_count into prev_streak from public.daily_completions
    where user_id = p_uid and completed_date = today - 1;
  new_streak := coalesce(prev_streak, 0) + 1;

  insert into public.daily_completions (user_id, completed_date, must_total, streak_count)
    values (p_uid, today, must_total, new_streak)
    on conflict (user_id, completed_date) do nothing
    returning id into comp_id;
  if comp_id is null then
    return jsonb_build_object('cleared', true, 'newly_cleared', false);
  end if;

  stamp := public.stamp_for_streak(new_streak);
  insert into public.stamps (user_id, stamp_type, earned_date, streak_count)
    values (p_uid, stamp, today, new_streak)
    on conflict (user_id, earned_date) do nothing;

  update public.user_stats
     set current_streak = new_streak,
         longest_streak = greatest(longest_streak, new_streak),
         total_days = total_days + 1,
         last_completed_date = today,
         xp = xp + clear_bonus
   where user_id = p_uid;

  return jsonb_build_object('cleared', true, 'newly_cleared', true, 'must_total', must_total,
                            'must_done', must_done, 'streak', new_streak, 'stamp_type', stamp,
                            'xp_bonus', clear_bonus);
end $$;

-- タスク削除 / 種別変更でも(全部完了なら)達成判定が走るようにする
create or replace function public._tasks_after_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if old.task_date = public._user_today(old.user_id) then
    perform public._evaluate_day(old.user_id);
  end if;
  return null;
end $$;

create trigger tasks_after_delete
  after delete on public.tasks
  for each row execute function public._tasks_after_change();
create trigger tasks_after_kind_update
  after update of kind on public.tasks
  for each row when (old.kind is distinct from new.kind)
  execute function public._tasks_after_change();

create or replace function public._session_json(p_session_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', s.id, 'task_id', s.task_id, 'status', s.status,
    'started_at', s.started_at, 'run_started_at', s.run_started_at,
    'accumulated_seconds', s.accumulated_seconds, 'actual_seconds', s.actual_seconds,
    'server_now', now())
  from public.study_sessions s where s.id = p_session_id
$$;

------------------------------------------------------------------
-- 公開RPC: タスク
------------------------------------------------------------------
create or replace function public.complete_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
  total_secs int;
  gained int := 0;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.task_date <> public._user_today(uid) then raise exception 'SQ_TASK_NOT_TODAY'; end if;

  if t.status <> 'done' then
    total_secs := public._close_sessions(p_task_id);
    if t.xp_awarded = 0 then
      if exists (select 1 from public.study_sessions where task_id = p_task_id) then
        gained := least(t.planned_minutes, greatest(1, round(total_secs / 60.0)::int));
      else
        gained := least(t.planned_minutes, 5);   -- タイマーなしの手動完了は控えめ
      end if;
    end if;
    update public.tasks
       set status = 'done', completed_at = now(), xp_awarded = xp_awarded + gained
     where id = p_task_id;
    if gained > 0 then
      update public.user_stats set xp = xp + gained where user_id = uid;
    end if;
  end if;

  return jsonb_build_object('task_id', p_task_id, 'xp_gained', gained,
                            'day', public._evaluate_day(uid));
end $$;

create or replace function public.uncomplete_task(p_task_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.task_date <> public._user_today(uid) then raise exception 'SQ_TASK_NOT_TODAY'; end if;
  -- 一度獲得したハンコ/達成記録/XPは取り消さない(再完了してもXPの二重取得なし)
  update public.tasks set status = 'todo', completed_at = null where id = p_task_id;
end $$;

create or replace function public.reorder_tasks(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 or array_length(p_ids, 1) > 50 then
    raise exception 'SQ_INVALID_INPUT';
  end if;
  update public.tasks t set sort_order = o.ord
    from unnest(p_ids) with ordinality as o(id, ord)
   where t.id = o.id and t.user_id = uid;
  get diagnostics n = row_count;
  if n <> array_length(p_ids, 1) then raise exception 'SQ_TASK_NOT_FOUND'; end if;
end $$;

-- 今日(ユーザーのタイムゾーン)のタスク一覧。RLSが効く invoker 関数
create or replace function public.today_tasks() returns setof public.tasks
language sql stable security invoker set search_path = public, pg_temp as $$
  select * from public.tasks
   where user_id = auth.uid() and task_date = public.app_today()
   order by sort_order, created_at
$$;

------------------------------------------------------------------
-- 公開RPC: タイマー
------------------------------------------------------------------
create or replace function public.start_session(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
  s public.study_sessions;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.task_date <> public._user_today(uid) then raise exception 'SQ_TASK_NOT_TODAY'; end if;
  if t.status = 'done' then raise exception 'SQ_TASK_ALREADY_DONE'; end if;

  -- 同時に走らせるのは1つだけ: 他のセッションは一時停止
  update public.study_sessions
     set status = 'paused',
         accumulated_seconds = least(28800, accumulated_seconds
           + floor(extract(epoch from (now() - run_started_at)))::int),
         run_started_at = null
   where user_id = uid and status = 'running' and task_id <> p_task_id;

  select * into s from public.study_sessions
    where task_id = p_task_id and status <> 'finished' for update;
  if found then
    if s.status = 'paused' then
      update public.study_sessions set status = 'running', run_started_at = now() where id = s.id;
    end if;
  else
    insert into public.study_sessions (user_id, task_id, status, run_started_at)
      values (uid, p_task_id, 'running', now())
      returning * into s;
  end if;

  update public.tasks set status = 'doing' where id = p_task_id;
  return public._session_json(s.id);
end $$;

create or replace function public.pause_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  s public.study_sessions;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into s from public.study_sessions where id = p_session_id and user_id = uid for update;
  if not found then raise exception 'SQ_SESSION_NOT_FOUND'; end if;
  if s.status = 'running' then
    update public.study_sessions
       set status = 'paused',
           accumulated_seconds = least(28800, accumulated_seconds
             + floor(extract(epoch from (now() - run_started_at)))::int),
           run_started_at = null
     where id = s.id;
  elsif s.status = 'finished' then
    raise exception 'SQ_SESSION_FINISHED';
  end if;
  return public._session_json(s.id);
end $$;

create or replace function public.resume_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  s public.study_sessions;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into s from public.study_sessions where id = p_session_id and user_id = uid for update;
  if not found then raise exception 'SQ_SESSION_NOT_FOUND'; end if;
  if s.status = 'finished' then raise exception 'SQ_SESSION_FINISHED'; end if;
  if s.status = 'paused' then
    update public.study_sessions
       set status = 'paused',
           accumulated_seconds = least(28800, accumulated_seconds
             + floor(extract(epoch from (now() - run_started_at)))::int),
           run_started_at = null
     where user_id = uid and status = 'running';
    update public.study_sessions set status = 'running', run_started_at = now() where id = s.id;
  end if;
  return public._session_json(s.id);
end $$;

-- 終了: p_complete=true でタスク完了(+達成判定)、false でタスクを未完了に戻して記録だけ残す
create or replace function public.finish_session(p_session_id uuid, p_complete boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  s public.study_sessions;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into s from public.study_sessions where id = p_session_id and user_id = uid for update;
  if not found then raise exception 'SQ_SESSION_NOT_FOUND'; end if;
  if s.status = 'finished' then
    return jsonb_build_object('task_id', s.task_id, 'xp_gained', 0, 'already_finished', true);
  end if;
  if p_complete then
    return public.complete_task(s.task_id);
  end if;
  perform public._close_sessions(s.task_id);
  update public.tasks set status = 'todo' where id = s.task_id and status = 'doing';
  return jsonb_build_object('task_id', s.task_id, 'xp_gained', 0);
end $$;

create or replace function public.get_session_state(p_task_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._session_json(s.id) from public.study_sessions s
   where s.task_id = p_task_id and s.user_id = auth.uid() and s.status <> 'finished'
$$;

create or replace function public.get_active_session() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select public._session_json(s.id) from public.study_sessions s
   where s.user_id = auth.uid() and s.status <> 'finished'
   order by (s.status = 'running') desc, s.started_at desc limit 1
$$;

------------------------------------------------------------------
-- 公開RPC: 統計
------------------------------------------------------------------
create or replace function public.get_my_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  today date;
  st public.user_stats;
  month_days int;
  counts jsonb;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  today := public._user_today(uid);
  select * into st from public.user_stats where user_id = uid;
  select count(*) into month_days from public.daily_completions
    where user_id = uid and completed_date >= date_trunc('month', today)::date and completed_date <= today;
  select coalesce(jsonb_object_agg(stamp_type, c), '{}'::jsonb) into counts
    from (select stamp_type, count(*) c from public.stamps where user_id = uid group by stamp_type) x;
  return jsonb_build_object(
    'xp', st.xp,
    'level', st.xp / 500 + 1,
    'xp_in_level', st.xp % 500,
    'xp_per_level', 500,
    -- 昨日達成していなければ連続はリセット表示(過去のハンコ・累計は消えない)
    'current_streak', case when st.last_completed_date is not null and st.last_completed_date >= today - 1
                           then st.current_streak else 0 end,
    'longest_streak', st.longest_streak,
    'total_days', st.total_days,
    'month_days', month_days,
    'cleared_today', st.last_completed_date = today,
    'stamp_counts', counts,
    'today', today,
    'server_now', now());
end $$;

------------------------------------------------------------------
-- 公開RPC: フレンド
------------------------------------------------------------------
create or replace function public.send_friend_request(p_code text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  target uuid;
  rev public.friend_requests;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select id into target from public.profiles where friend_code = upper(btrim(coalesce(p_code, '')));
  if target is null then raise exception 'SQ_CODE_NOT_FOUND'; end if;
  if target = uid then raise exception 'SQ_SELF_REQUEST'; end if;
  if public.are_friends(uid, target) then raise exception 'SQ_ALREADY_FRIENDS'; end if;
  if (select count(*) from public.friend_requests where from_user = uid and status = 'pending') >= 20 then
    raise exception 'SQ_TOO_MANY_REQUESTS';
  end if;

  -- 相手からの申請が来ていれば、そのまま承認
  select * into rev from public.friend_requests
    where from_user = target and to_user = uid and status = 'pending';
  if found then
    update public.friend_requests set status = 'accepted' where id = rev.id;
    insert into public.friendships (user_a, user_b) values (least(uid, target), greatest(uid, target))
      on conflict do nothing;
    return jsonb_build_object('result', 'friends');
  end if;

  -- 送信済み(拒否済みを含む)は同じエラーにして相手の対応を悟らせない
  if exists (select 1 from public.friend_requests where from_user = uid and to_user = target) then
    raise exception 'SQ_ALREADY_REQUESTED';
  end if;
  insert into public.friend_requests (from_user, to_user) values (uid, target);
  return jsonb_build_object('result', 'requested');
end $$;

create or replace function public.respond_friend_request(p_request_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  r public.friend_requests;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into r from public.friend_requests
    where id = p_request_id and to_user = uid and status = 'pending' for update;
  if not found then raise exception 'SQ_REQUEST_NOT_FOUND'; end if;
  if p_accept then
    update public.friend_requests set status = 'accepted' where id = r.id;
    insert into public.friendships (user_a, user_b)
      values (least(r.from_user, r.to_user), greatest(r.from_user, r.to_user))
      on conflict do nothing;
  else
    update public.friend_requests set status = 'declined' where id = r.id;
  end if;
end $$;

create or replace function public.remove_friend(p_friend_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  delete from public.friendships
    where user_a = least(uid, p_friend_id) and user_b = greatest(uid, p_friend_id);
  delete from public.friend_requests
    where (from_user = uid and to_user = p_friend_id) or (from_user = p_friend_id and to_user = uid);
end $$;

create or replace function public.send_reaction(p_to uuid, p_kind text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if p_kind not in ('clap','fire','party','book') then raise exception 'SQ_INVALID_INPUT'; end if;
  if not public.are_friends(uid, p_to) then raise exception 'SQ_NOT_FRIENDS'; end if;
  insert into public.reactions (from_user, to_user, kind, reaction_date)
    values (uid, p_to, p_kind, public._user_today(uid))
    on conflict do nothing;
end $$;

-- 自分 + 友だちの今日の進捗(友だちの tasks 本体は見せず、集計だけ返す)
create or replace function public.friends_overview()
returns table (
  user_id uuid, nickname text, avatar text, is_me boolean,
  must_total int, must_done int, cleared boolean, current_streak int,
  studying boolean, studying_subject text, studying_seconds int,
  my_reactions text[]
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  return query
  with ids as (
    select uid as id
    union
    select case when f.user_a = uid then f.user_b else f.user_a end
      from public.friendships f where f.user_a = uid or f.user_b = uid
  )
  select p.id, p.nickname, p.avatar, p.id = uid,
    coalesce(c.total, 0)::int, coalesce(c.done, 0)::int,
    exists (select 1 from public.daily_completions d
             where d.user_id = p.id and d.completed_date = public._user_today(p.id)),
    case when s.last_completed_date >= public._user_today(p.id) - 1 then s.current_streak else 0 end,
    (ss.id is not null),
    case when ss.id is not null and (p.share_subject or p.id = uid) then tk.title end,
    case when ss.id is not null
         then least(28800, ss.accumulated_seconds
              + floor(extract(epoch from (now() - ss.run_started_at)))::int) end,
    array(select r.kind from public.reactions r
           where r.from_user = uid and r.to_user = p.id
             and r.reaction_date = public._user_today(uid))
  from ids
  join public.profiles p on p.id = ids.id
  left join public.user_stats s on s.user_id = p.id
  left join lateral (
    select count(*) filter (where t.kind = 'must') as total,
           count(*) filter (where t.kind = 'must' and t.status = 'done') as done
      from public.tasks t
     where t.user_id = p.id and t.task_date = public._user_today(p.id)
  ) c on true
  left join lateral (
    select x.* from public.study_sessions x where x.user_id = p.id and x.status = 'running' limit 1
  ) ss on true
  left join public.tasks tk on tk.id = ss.task_id
  order by (p.id = uid) desc, p.nickname;
end $$;

-- 一緒に勉強する: 自分+友だちの「勉強中」を教科ごとにまとめる
create or replace function public.study_party_rooms() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(room order by (room->>'count')::int desc, room->>'subject')
    from (
      select jsonb_build_object(
        'subject', min(m.title),
        'count', count(*),
        'members', jsonb_agg(jsonb_build_object(
          'user_id', m.user_id, 'nickname', m.nickname, 'avatar', m.avatar,
          'is_me', m.user_id = uid, 'elapsed_seconds', m.elapsed) order by m.elapsed desc)
      ) as room
      from (
        select p.id as user_id, p.nickname, p.avatar, tk.title,
               least(28800, ss.accumulated_seconds
                 + floor(extract(epoch from (now() - ss.run_started_at)))::int) as elapsed
          from public.study_sessions ss
          join public.profiles p on p.id = ss.user_id
          join public.tasks tk on tk.id = ss.task_id
         where ss.status = 'running'
           and (p.id = uid or (public.are_friends(uid, p.id) and p.share_subject))
      ) m
      group by lower(btrim(m.title))
    ) rooms
  ), '[]'::jsonb);
end $$;

-- 「一緒にやる」: 同じ教科の自分のタスクを開始(なければボーナスタスクを作って開始)
create or replace function public.join_study_party(p_subject text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  subj text := btrim(coalesce(p_subject, ''));
  tid uuid;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if char_length(subj) < 1 or char_length(subj) > 40 then raise exception 'SQ_INVALID_INPUT'; end if;
  select id into tid from public.tasks
   where user_id = uid and task_date = public._user_today(uid)
     and status <> 'done' and lower(btrim(title)) = lower(subj)
   order by sort_order limit 1;
  if tid is null then
    insert into public.tasks (user_id, title, planned_minutes, kind)
      values (uid, subj, 20, 'bonus') returning id into tid;
  end if;
  return jsonb_build_object('task_id', tid, 'session', public.start_session(tid));
end $$;

------------------------------------------------------------------
-- RLS
------------------------------------------------------------------

create policy stamp_types_read on public.stamp_types for select to authenticated using (true);

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.are_friends(auth.uid(), id) or public._has_pending_request(auth.uid(), id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy user_stats_select on public.user_stats for select to authenticated using (user_id = auth.uid());

create policy tasks_select on public.tasks for select to authenticated using (user_id = auth.uid());
create policy tasks_insert on public.tasks for insert to authenticated with check (user_id = auth.uid());
create policy tasks_update on public.tasks for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tasks_delete on public.tasks for delete to authenticated using (user_id = auth.uid());

create policy sessions_select on public.study_sessions for select to authenticated using (user_id = auth.uid());
create policy completions_select on public.daily_completions for select to authenticated using (user_id = auth.uid());
create policy stamps_select on public.stamps for select to authenticated using (user_id = auth.uid());

create policy requests_select on public.friend_requests for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());
create policy friendships_select on public.friendships for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());
create policy reactions_select on public.reactions for select to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

------------------------------------------------------------------
-- 権限(列単位で絞る: 状態・XP・達成はRPC経由のみ)
------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;

grant select on public.stamp_types, public.user_stats, public.study_sessions,
  public.daily_completions, public.stamps, public.friend_requests,
  public.friendships, public.reactions, public.profiles, public.tasks to authenticated;
grant update (nickname, avatar, share_subject) on public.profiles to authenticated;
grant insert (task_date, title, planned_minutes, kind) on public.tasks to authenticated;
grant update (title, planned_minutes, kind) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

-- 関数: デフォルトの PUBLIC 実行権限を外し、公開RPCだけ authenticated に付与
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.app_today(), public.today_tasks(), public.are_friends(uuid, uuid), public.stamp_for_streak(int),
  public.complete_task(uuid), public.uncomplete_task(uuid), public.reorder_tasks(uuid[]),
  public.start_session(uuid), public.pause_session(uuid), public.resume_session(uuid),
  public.finish_session(uuid, boolean), public.get_session_state(uuid), public.get_active_session(),
  public.get_my_stats(), public.send_friend_request(text), public.respond_friend_request(uuid, boolean),
  public.remove_friend(uuid), public.send_reaction(uuid, text), public.friends_overview(),
  public.study_party_rooms(), public.join_study_party(text)
  to authenticated;
-- RLSポリシー内で使うヘルパーも authenticated から呼べる必要がある
grant execute on function public._has_pending_request(uuid, uuid), public._user_today(uuid) to authenticated;

-- ===== 20260930000002_groups.sql =====
-- Phase 3: グループと協力チャレンジ
-- 個人ランキングは作らない。「メンバーみんなの今週のデイリークリア数」を共通目標にする。

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 20),
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;

create table public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited','joined')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id),
  check ((status = 'joined') = (joined_at is not null))
);
alter table public.group_members enable row level security;
create index group_members_user_idx on public.group_members (user_id);

create or replace function public._is_group_member(p_group uuid, p_uid uuid, p_joined_only boolean default true)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.group_members
     where group_id = p_group and user_id = p_uid and (not p_joined_only or status = 'joined')
  )
$$;


create policy groups_select on public.groups for select to authenticated
  using (public._is_group_member(id, auth.uid(), false));
create policy group_members_select on public.group_members for select to authenticated
  using (user_id = auth.uid() or public._is_group_member(group_id, auth.uid(), true));

grant select on public.groups, public.group_members to authenticated;
grant execute on function public._is_group_member(uuid, uuid, boolean) to authenticated;

-- 週の共通チャレンジ(月曜始まり)。目標 = 参加メンバー数 × 5日
create or replace function public._group_week(p_group uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  wk_start date := date_trunc('week', p_today)::date;
  wk_end date := date_trunc('week', p_today)::date + 6;
  members int;
  progress int;
begin
  select count(*) into members from public.group_members where group_id = p_group and status = 'joined';
  select count(*) into progress
    from public.group_members gm
    join public.profiles p on p.id = gm.user_id
    join public.daily_completions d on d.user_id = gm.user_id
   where gm.group_id = p_group and gm.status = 'joined'
     and d.completed_date between wk_start and wk_end
     and d.completed_date >= (gm.joined_at at time zone p.timezone)::date;
  return jsonb_build_object(
    'target', greatest(members, 1) * 5,
    'progress', progress,
    'starts_on', wk_start, 'ends_on', wk_end,
    'days_left', wk_end - p_today);
end $$;

create or replace function public.create_group(p_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  nm text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if char_length(nm) < 1 or char_length(nm) > 20 then raise exception 'SQ_INVALID_INPUT'; end if;
  if (select count(*) from public.group_members where user_id = uid and status = 'joined') >= 10 then
    raise exception 'SQ_TOO_MANY_GROUPS';
  end if;
  insert into public.groups (name, owner_id) values (nm, uid) returning id into gid;
  insert into public.group_members (group_id, user_id, status, joined_at) values (gid, uid, 'joined', now());
  return gid;
end $$;

create or replace function public.invite_to_group(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  existing text;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  if not public.are_friends(uid, p_user) then raise exception 'SQ_NOT_FRIENDS'; end if;
  select status into existing from public.group_members where group_id = p_group and user_id = p_user;
  if existing = 'joined' then raise exception 'SQ_ALREADY_MEMBER'; end if;
  if existing = 'invited' then raise exception 'SQ_ALREADY_INVITED'; end if;
  if (select count(*) from public.group_members where group_id = p_group) >= 10 then
    raise exception 'SQ_GROUP_FULL';
  end if;
  insert into public.group_members (group_id, user_id, status, invited_by) values (p_group, p_user, 'invited', uid);
end $$;

create or replace function public.respond_group_invite(p_group uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group and user_id = uid and status = 'invited') then
    raise exception 'SQ_INVITE_NOT_FOUND';
  end if;
  if p_accept then
    if (select count(*) from public.group_members where user_id = uid and status = 'joined') >= 10 then
      raise exception 'SQ_TOO_MANY_GROUPS';
    end if;
    update public.group_members set status = 'joined', joined_at = now()
     where group_id = p_group and user_id = uid;
  else
    delete from public.group_members where group_id = p_group and user_id = uid;
  end if;
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  next_owner uuid;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  delete from public.group_members where group_id = p_group and user_id = uid;
  select user_id into next_owner from public.group_members
   where group_id = p_group and status = 'joined' order by joined_at limit 1;
  if next_owner is null then
    delete from public.groups where id = p_group;        -- 誰もいなくなったら解散
  else
    update public.groups set owner_id = next_owner where id = p_group and owner_id = uid;
  end if;
end $$;

-- 自分のグループ一覧 + 届いている招待
create or replace function public.my_groups() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  today date;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  today := public._user_today(uid);
  return jsonb_build_object(
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name,
        'member_count', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'joined'),
        'week', public._group_week(g.id, today)
      ) order by g.created_at)
      from public.groups g
      join public.group_members gm on gm.group_id = g.id and gm.user_id = uid and gm.status = 'joined'
    ), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'group_id', g.id, 'name', g.name,
        'invited_by', ip.nickname
      ) order by gm.created_at)
      from public.group_members gm
      join public.groups g on g.id = gm.group_id
      left join public.profiles ip on ip.id = gm.invited_by
      where gm.user_id = uid and gm.status = 'invited'
    ), '[]'::jsonb));
end $$;

-- グループ詳細: メンバーの「今日」を返す(教科名は含めない)
create or replace function public.get_group_detail(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  today date;
  g public.groups;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  today := public._user_today(uid);
  select * into g from public.groups where id = p_group;
  return jsonb_build_object(
    'id', g.id, 'name', g.name, 'is_owner', g.owner_id = uid,
    'week', public._group_week(g.id, today),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar, 'is_me', p.id = uid,
        'must_total', c.total, 'must_done', c.done,
        'cleared', exists (select 1 from public.daily_completions d
                            where d.user_id = p.id and d.completed_date = public._user_today(p.id)),
        'studying', exists (select 1 from public.study_sessions s where s.user_id = p.id and s.status = 'running')
      ) order by (p.id = uid) desc, gm.joined_at), '[]'::jsonb)
      from public.group_members gm
      join public.profiles p on p.id = gm.user_id
      left join lateral (
        select count(*) filter (where t.kind = 'must')::int as total,
               count(*) filter (where t.kind = 'must' and t.status = 'done')::int as done
          from public.tasks t where t.user_id = p.id and t.task_date = public._user_today(p.id)
      ) c on true
      where gm.group_id = g.id and gm.status = 'joined'),
    'pending_invites', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar)), '[]'::jsonb)
      from public.group_members gm join public.profiles p on p.id = gm.user_id
      where gm.group_id = g.id and gm.status = 'invited'));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.create_group(text), public.invite_to_group(uuid, uuid), public.respond_group_invite(uuid, boolean),
  public.leave_group(uuid), public.my_groups(), public.get_group_detail(uuid)
  to authenticated;
-- 内部関数は公開しない
revoke execute on function public._group_week(uuid, date) from public, anon, authenticated;

------------------------------------------------------------------
-- アカウント削除(App Store の審査要件: アプリ内からアカウントを削除できること)
-- auth.users を消すと、プロフィール・タスク・記録・友だち関係などが CASCADE で全部消える
------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  -- グループのオーナーだった場合は、残っているメンバーに引き継ぐ(誰もいなければ解散)
  update public.groups g set owner_id = (
    select gm.user_id from public.group_members gm
     where gm.group_id = g.id and gm.status = 'joined' and gm.user_id <> uid
     order by gm.joined_at limit 1)
   where g.owner_id = uid
     and exists (select 1 from public.group_members gm
                  where gm.group_id = g.id and gm.status = 'joined' and gm.user_id <> uid);
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ===== 20260930000003_claim_stamp.sql =====
-- ハンコは「ユーザーが押す」: 1日の達成(daily_completions・連続日数)は全部完了した時点で記録し、
-- ハンコ(stamps)は claim_stamp() を呼んだ時点で作る。種類はその日の連続日数からサーバーが決める。
-- 押し忘れても、あとから(ハンコ帳から)押せる。押さなくても連続日数は途切れない。

create or replace function public._evaluate_day(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  today date;
  must_total int;
  must_done int;
  prev_streak int;
  new_streak int;
  comp_id uuid;
  clear_bonus constant int := 50;
begin
  if not exists (select 1 from public.profiles where id = p_uid) then
    return jsonb_build_object('cleared', false, 'newly_cleared', false);
  end if;
  today := public._user_today(p_uid);

  select count(*) filter (where kind = 'must'),
         count(*) filter (where kind = 'must' and status = 'done')
    into must_total, must_done
    from public.tasks where user_id = p_uid and task_date = today;

  select streak_count into new_streak from public.daily_completions
    where user_id = p_uid and completed_date = today;
  if found then
    return jsonb_build_object('cleared', true, 'newly_cleared', false, 'must_total', must_total,
      'must_done', must_done, 'streak', new_streak, 'stamp_type', public.stamp_for_streak(new_streak),
      'stamp_claimed', exists (select 1 from public.stamps where user_id = p_uid and earned_date = today));
  end if;

  if must_total = 0 or must_done < must_total then
    return jsonb_build_object('cleared', false, 'newly_cleared', false,
                              'must_total', must_total, 'must_done', must_done);
  end if;

  perform 1 from public.user_stats where user_id = p_uid for update;

  select streak_count into prev_streak from public.daily_completions
    where user_id = p_uid and completed_date = today - 1;
  new_streak := coalesce(prev_streak, 0) + 1;

  insert into public.daily_completions (user_id, completed_date, must_total, streak_count)
    values (p_uid, today, must_total, new_streak)
    on conflict (user_id, completed_date) do nothing
    returning id into comp_id;
  if comp_id is null then
    return jsonb_build_object('cleared', true, 'newly_cleared', false);
  end if;

  update public.user_stats
     set current_streak = new_streak,
         longest_streak = greatest(longest_streak, new_streak),
         total_days = total_days + 1,
         last_completed_date = today,
         xp = xp + clear_bonus
   where user_id = p_uid;

  return jsonb_build_object('cleared', true, 'newly_cleared', true, 'must_total', must_total,
    'must_done', must_done, 'streak', new_streak, 'stamp_type', public.stamp_for_streak(new_streak),
    'stamp_claimed', false, 'xp_bonus', clear_bonus);
end $$;

-- ハンコを押す(p_date 省略で今日)。達成していない日は押せない。同じ日に2回押しても1つだけ
create or replace function public.claim_stamp(p_date date default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  d date;
  streak int;
  stype text;
  inserted_id uuid;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  d := coalesce(p_date, public._user_today(uid));
  select streak_count into streak from public.daily_completions
    where user_id = uid and completed_date = d;
  if not found then raise exception 'SQ_NOT_CLEARED'; end if;
  stype := public.stamp_for_streak(streak);
  insert into public.stamps (user_id, stamp_type, earned_date, streak_count)
    values (uid, stype, d, streak)
    on conflict (user_id, earned_date) do nothing
    returning id into inserted_id;
  return jsonb_build_object('stamp_type', stype, 'streak', streak, 'earned_date', d,
                            'newly_claimed', inserted_id is not null);
end $$;

create or replace function public.get_my_stats() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  today date;
  st public.user_stats;
  month_days int;
  counts jsonb;
  today_streak int;
  unclaimed jsonb;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  today := public._user_today(uid);
  select * into st from public.user_stats where user_id = uid;
  select count(*) into month_days from public.daily_completions
    where user_id = uid and completed_date >= date_trunc('month', today)::date and completed_date <= today;
  select coalesce(jsonb_object_agg(stamp_type, c), '{}'::jsonb) into counts
    from (select stamp_type, count(*) c from public.stamps where user_id = uid group by stamp_type) x;
  select streak_count into today_streak from public.daily_completions
    where user_id = uid and completed_date = today;
  -- 達成したのにまだ押していない日(直近60日)
  select coalesce(jsonb_agg(d.completed_date order by d.completed_date desc), '[]'::jsonb) into unclaimed
    from public.daily_completions d
   where d.user_id = uid and d.completed_date > today - 60
     and not exists (select 1 from public.stamps s where s.user_id = uid and s.earned_date = d.completed_date);
  return jsonb_build_object(
    'xp', st.xp,
    'level', st.xp / 500 + 1,
    'xp_in_level', st.xp % 500,
    'xp_per_level', 500,
    'current_streak', case when st.last_completed_date is not null and st.last_completed_date >= today - 1
                           then st.current_streak else 0 end,
    'longest_streak', st.longest_streak,
    'total_days', st.total_days,
    'month_days', month_days,
    'cleared_today', today_streak is not null,
    'today_streak', today_streak,
    'today_stamp_type', case when today_streak is not null then public.stamp_for_streak(today_streak) end,
    'today_stamp_claimed', exists (select 1 from public.stamps where user_id = uid and earned_date = today),
    'unclaimed_dates', unclaimed,
    'stamp_counts', counts,
    'today', today,
    'server_now', now());
end $$;

revoke execute on function public.claim_stamp(date) from public, anon;
grant execute on function public.claim_stamp(date) to authenticated;
revoke execute on function public._evaluate_day(uuid) from public, anon, authenticated;

-- ===== 20260930000004_avatar_colors.sql =====
-- アイコンを「動物」から「色 + 名前の頭文字」に変更(新デザイン)。既存データも色に移行する。

alter table public.profiles drop constraint if exists profiles_avatar_check;

update public.profiles set avatar = case avatar
  when 'cat' then 'blue'
  when 'frog' then 'green'
  when 'panda' then 'slate'
  when 'rabbit' then 'rose'
  when 'shiba' then 'amber'
  when 'bear' then 'violet'
  when 'penguin' then 'indigo'
  when 'fox' then 'teal'
  else 'blue' end
where avatar not in ('blue','green','indigo','rose','amber','teal','violet','slate');

alter table public.profiles alter column avatar set default 'blue';
alter table public.profiles add constraint profiles_avatar_check
  check (avatar in ('blue','green','indigo','rose','amber','teal','violet','slate'));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nick text := btrim(coalesce(meta->>'nickname', ''));
  av text := coalesce(meta->>'avatar', 'blue');
  tz text := coalesce(meta->>'timezone', 'Asia/Tokyo');
begin
  if char_length(nick) < 1 or char_length(nick) > 12 then nick := 'ゲスト'; end if;
  if av not in ('blue','green','indigo','rose','amber','teal','violet','slate') then av := 'blue'; end if;
  if not exists (select 1 from pg_timezone_names where name = tz) then tz := 'Asia/Tokyo'; end if;
  insert into public.profiles (id, nickname, avatar, friend_code, timezone)
    values (new.id, nick, av, public._gen_friend_code(), tz);
  insert into public.user_stats (user_id) values (new.id);
  return new;
end $$;
