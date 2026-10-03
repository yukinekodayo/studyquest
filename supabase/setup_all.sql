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

-- ===== 20260930000005_task_stamps.sql =====
-- タスクの「済」ハンコも、ユーザーが押すまで付かない。
-- 完了(status = 'done')と、ハンコを押したか(stamped_at)は別。完了すれば1日の達成にはカウントされる。

alter table public.tasks add column if not exists stamped_at timestamptz;

-- すでに完了済みの既存タスクは、押した扱いにする(過去データの見た目を変えない)
update public.tasks set stamped_at = coalesce(completed_at, now()) where status = 'done' and stamped_at is null;

-- 「済」を押す。完了したタスクだけ。2回押しても1回分
create or replace function public.stamp_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.status <> 'done' then raise exception 'SQ_TASK_NOT_DONE'; end if;
  if t.stamped_at is not null then
    return jsonb_build_object('task_id', t.id, 'newly_stamped', false);
  end if;
  update public.tasks set stamped_at = now() where id = t.id;
  return jsonb_build_object('task_id', t.id, 'newly_stamped', true);
end $$;

-- 未完了に戻したら、押したハンコも外す(もう一度終えたら、もう一度押す)
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
  -- 1日のハンコ/達成記録/XPは取り消さない(再完了してもXPの二重取得なし)
  update public.tasks set status = 'todo', completed_at = null, stamped_at = null where id = p_task_id;
end $$;

revoke execute on function public.stamp_task(uuid) from public, anon;
grant execute on function public.stamp_task(uuid) to authenticated;

-- ===== 20260930000006_engagement.sql =====
-- 「続けたくなる」ための仕組み: 学習時間の集計 / 実績バッジ / レベルアップ情報
-- すべてサーバー側で判定する(クライアントは実績を直接書けない)。

------------------------------------------------------------------
-- 実績
------------------------------------------------------------------
create table public.user_achievements (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  code        text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.user_achievements enable row level security;
create policy achievements_select on public.user_achievements for select to authenticated using (user_id = auth.uid());
revoke all on public.user_achievements from anon, authenticated;
grant select on public.user_achievements to authenticated;

-- 条件を満たした実績を付与し、「今回あたらしく」解除したコードを返す(2回目以降は空)
create or replace function public._award_achievements(p_uid uuid) returns text[]
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  st public.user_stats;
  done_tasks int;
  bonus_done int;
  today_done int;
  friend_count int;
  study_secs bigint;
  lvl int;
  newly text[];
begin
  select * into st from public.user_stats where user_id = p_uid;
  if not found then return '{}'; end if;
  select count(*) into done_tasks from public.tasks where user_id = p_uid and status = 'done';
  select count(*) into bonus_done from public.tasks where user_id = p_uid and status = 'done' and kind = 'bonus';
  select count(*) into today_done from public.tasks
    where user_id = p_uid and status = 'done' and task_date = public._user_today(p_uid);
  select count(*) into friend_count from public.friendships where user_a = p_uid or user_b = p_uid;
  select coalesce(sum(actual_seconds), 0) into study_secs from public.study_sessions
    where user_id = p_uid and status = 'finished';
  lvl := st.xp / 500 + 1;

  with cand(code, ok) as (values
    ('first_task',  done_tasks >= 1),
    ('tasks_10',    done_tasks >= 10),
    ('tasks_50',    done_tasks >= 50),
    ('tasks_200',   done_tasks >= 200),
    ('first_clear', st.total_days >= 1),
    ('days_5',      st.total_days >= 5),
    ('days_30',     st.total_days >= 30),
    ('days_100',    st.total_days >= 100),
    ('streak_3',    st.longest_streak >= 3),
    ('streak_7',    st.longest_streak >= 7),
    ('streak_14',   st.longest_streak >= 14),
    ('streak_30',   st.longest_streak >= 30),
    ('study_1h',    study_secs >= 3600),
    ('study_10h',   study_secs >= 36000),
    ('study_50h',   study_secs >= 180000),
    ('combo_3',     today_done >= 3),
    ('combo_5',     today_done >= 5),
    ('first_bonus', bonus_done >= 1),
    ('level_5',     lvl >= 5),
    ('level_10',    lvl >= 10),
    ('first_friend', friend_count >= 1)
  ), ins as (
    insert into public.user_achievements (user_id, code)
    select p_uid, code from cand where ok
    on conflict do nothing
    returning code
  )
  select coalesce(array_agg(code), '{}') into newly from ins;
  return newly;
end $$;

------------------------------------------------------------------
-- 完了 / ハンコ: 実績とレベルアップ情報を返す
------------------------------------------------------------------
create or replace function public.complete_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
  total_secs int;
  gained int := 0;
  lvl_before int;
  lvl_after int;
  day_result jsonb;
  newly text[];
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.task_date <> public._user_today(uid) then raise exception 'SQ_TASK_NOT_TODAY'; end if;
  select xp / 500 + 1 into lvl_before from public.user_stats where user_id = uid;

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

  day_result := public._evaluate_day(uid);
  newly := public._award_achievements(uid);
  select xp / 500 + 1 into lvl_after from public.user_stats where user_id = uid;
  return jsonb_build_object('task_id', p_task_id, 'xp_gained', gained, 'day', day_result,
    'level_before', lvl_before, 'level_after', lvl_after, 'new_achievements', to_jsonb(newly));
end $$;

create or replace function public.stamp_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  if t.status <> 'done' then raise exception 'SQ_TASK_NOT_DONE'; end if;
  if t.stamped_at is not null then
    return jsonb_build_object('task_id', t.id, 'newly_stamped', false, 'new_achievements', '[]'::jsonb);
  end if;
  update public.tasks set stamped_at = now() where id = t.id;
  return jsonb_build_object('task_id', t.id, 'newly_stamped', true,
    'new_achievements', to_jsonb(public._award_achievements(uid)));
end $$;

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
                            'newly_claimed', inserted_id is not null,
                            'new_achievements', to_jsonb(public._award_achievements(uid)));
end $$;

------------------------------------------------------------------
-- 学習時間の集計(直近7日・今週/先週・累計)
------------------------------------------------------------------
create or replace function public.get_study_summary() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  tz text;
  today date;
  result jsonb;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  tz := coalesce((select timezone from public.profiles where id = uid), 'Asia/Tokyo');
  today := public._user_today(uid);
  with secs as (
    select (s.ended_at at time zone tz)::date as d, s.actual_seconds::bigint as sec
      from public.study_sessions s
     where s.user_id = uid and s.status = 'finished' and s.ended_at is not null
    union all
    select today, least(28800, s.accumulated_seconds
             + case when s.status = 'running' then floor(extract(epoch from (now() - s.run_started_at)))::int else 0 end)::bigint
      from public.study_sessions s
     where s.user_id = uid and s.status <> 'finished'
  ), per_day as (
    select d, sum(sec) as sec from secs group by d
  ), last7 as (
    select g::date as d, round(coalesce(p.sec, 0) / 60.0)::int as minutes
      from generate_series(today - 6, today, interval '1 day') g
      left join per_day p on p.d = g::date
  )
  select jsonb_build_object(
    'today_minutes', (select minutes from last7 where d = today),
    'days', (select jsonb_agg(jsonb_build_object('date', d, 'minutes', minutes) order by d) from last7),
    'week_minutes', (select coalesce(sum(minutes), 0) from last7),
    'prev_week_minutes', (select coalesce(round(sum(sec) / 60.0), 0)::int from per_day where d between today - 13 and today - 7),
    'total_minutes', (select coalesce(round(sum(sec) / 60.0), 0)::int from per_day)
  ) into result;
  return result;
end $$;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public._award_achievements(uuid) from public, anon, authenticated;
grant execute on function public.get_study_summary(), public.complete_task(uuid), public.stamp_task(uuid), public.claim_stamp(date) to authenticated;

-- ===== 20260930000007_delete_group.sql =====
-- グループ削除: オーナーだけが、グループ自体(メンバー・招待を含む)を削除できる
create or replace function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  if not exists (select 1 from public.groups where id = p_group and owner_id = uid) then
    raise exception 'SQ_NOT_GROUP_OWNER';
  end if;
  delete from public.groups where id = p_group;   -- group_members は CASCADE で消える
end $$;

revoke execute on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;

-- ===== 20260930000008_group_streak.sql =====
-- グループの協力チャレンジを「週◯日分」から「みんなで◯日連続」に変更
-- メンバーの誰か1人でもその日のデイリーをクリアした日は「連続」が続く。目標日数はメンバー全員の同意で変更する。

alter table public.groups add column if not exists target_days int not null default 7 check (target_days between 1 and 365);

-- 目標変更の提案(グループごとに1件)。approvals に賛成したメンバーの user_id を持つ
create table if not exists public.group_target_proposals (
  group_id    uuid primary key references public.groups(id) on delete cascade,
  target_days int not null check (target_days between 1 and 365),
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  approvals   uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.group_target_proposals enable row level security;
-- 直接のアクセスは許可しない(get_group_detail 経由でのみ読む)

drop function if exists public._group_week(uuid, date);

-- 現在の連続日数(今日のクリアがまだなら昨日までの連続を数える)
create or replace function public._group_streak(p_group uuid, p_today date) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with days as (
    select distinct d.completed_date as dt
      from public.group_members gm
      join public.profiles p on p.id = gm.user_id
      join public.daily_completions d on d.user_id = gm.user_id
     where gm.group_id = p_group and gm.status = 'joined'
       and d.completed_date >= (gm.joined_at at time zone p.timezone)::date
  ),
  st as (
    select case when exists (select 1 from days where days.dt = p_today) then p_today else p_today - 1 end as s
  ),
  ranked as (
    select days.dt, row_number() over (order by days.dt desc) as rn
      from days, st
     where days.dt <= st.s
  ),
  cnt as (
    select count(*)::int as n
      from ranked, st
     where ranked.dt = st.s - (ranked.rn - 1)::int
  )
  select jsonb_build_object(
    'target', g.target_days,
    'current', cnt.n,
    'reached', cnt.n >= g.target_days,
    'cleared_today', st.s = p_today)
    from public.groups g, cnt, st
   where g.id = p_group
$$;

-- 全員(参加中のメンバー)が賛成していたら目標を反映して提案を閉じる
create or replace function public._apply_group_target(p_group uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pr record;
begin
  select * into pr from public.group_target_proposals where group_id = p_group;
  if not found then return; end if;
  if not exists (
    select 1 from public.group_members gm
     where gm.group_id = p_group and gm.status = 'joined' and not (gm.user_id = any (pr.approvals))
  ) then
    update public.groups set target_days = pr.target_days where id = p_group;
    delete from public.group_target_proposals where group_id = p_group;
  end if;
end $$;

-- 作成時に目標日数を決める(デフォルト7日)
drop function if exists public.create_group(text);
create or replace function public.create_group(p_name text, p_target_days int default 7) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  gid uuid;
  nm text := btrim(coalesce(p_name, ''));
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if char_length(nm) < 1 or char_length(nm) > 20 then raise exception 'SQ_INVALID_INPUT'; end if;
  if p_target_days is null or p_target_days < 1 or p_target_days > 365 then raise exception 'SQ_INVALID_INPUT'; end if;
  if (select count(*) from public.group_members where user_id = uid and status = 'joined') >= 10 then
    raise exception 'SQ_TOO_MANY_GROUPS';
  end if;
  insert into public.groups (name, owner_id, target_days) values (nm, uid, p_target_days) returning id into gid;
  insert into public.group_members (group_id, user_id, status, joined_at) values (gid, uid, 'joined', now());
  return gid;
end $$;

-- 目標日数の変更を提案する(提案者は賛成済み。全員が賛成したら反映)
create or replace function public.propose_group_target(p_group uuid, p_days int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  if p_days is null or p_days < 1 or p_days > 365
     or p_days = (select target_days from public.groups where id = p_group) then
    raise exception 'SQ_INVALID_INPUT';
  end if;
  insert into public.group_target_proposals (group_id, target_days, proposed_by, approvals)
  values (p_group, p_days, uid, array[uid])
  on conflict (group_id) do update
    set target_days = excluded.target_days, proposed_by = excluded.proposed_by,
        approvals = excluded.approvals, created_at = now();
  perform public._apply_group_target(p_group);
end $$;

-- 提案に賛成/反対する(反対すると提案は取り下げ)
create or replace function public.respond_group_target(p_group uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  if not exists (select 1 from public.group_target_proposals where group_id = p_group) then
    raise exception 'SQ_PROPOSAL_NOT_FOUND';
  end if;
  if p_accept then
    update public.group_target_proposals
       set approvals = array_append(approvals, uid)
     where group_id = p_group and not (uid = any (approvals));
    perform public._apply_group_target(p_group);
  else
    delete from public.group_target_proposals where group_id = p_group;
  end if;
end $$;

-- 抜けた人を除いて全員賛成になった場合も反映する
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
    perform public._apply_group_target(p_group);
  end if;
end $$;

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
        'streak', public._group_streak(g.id, today)
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
    'streak', public._group_streak(g.id, today),
    'proposal', (
      select jsonb_build_object(
        'target_days', pr.target_days,
        'proposed_by', pp.nickname,
        'approved_by_me', uid = any (pr.approvals),
        'approved_count', cardinality(pr.approvals),
        'member_count', (select count(*) from public.group_members m where m.group_id = g.id and m.status = 'joined'))
      from public.group_target_proposals pr
      left join public.profiles pp on pp.id = pr.proposed_by
      where pr.group_id = g.id),
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
revoke execute on function public._group_streak(uuid, date), public._apply_group_target(uuid)
  from public, anon, authenticated;
grant execute on function
  public.create_group(text, int), public.propose_group_target(uuid, int), public.respond_group_target(uuid, boolean),
  public.leave_group(uuid), public.my_groups(), public.get_group_detail(uuid)
  to authenticated;

-- ===== 20260930000009_chat.sql =====
-- チャット(グループ / 友だち1対1)。中高生向けなので、安全面を最優先にした設計:
--  * 話せるのは「同じグループのメンバー」「フレンド」だけ(知らない人とは話せない)
--  * 文字だけ(画像・リンク・電話番号・メールアドレスは送れない)。1通200文字まで
--  * 不適切な言葉は送れない / つらい気持ちの言葉には、やさしい案内を返して送らない
--  * 夜(22時〜7時)は送れない / 連投できない / 30日で自動削除
--  * 通報・ブロック。通報3件で自動的に非表示、運営(admins)が確認して対応する
--  * messages へはクライアントから直接アクセスさせない(RPCのみ)

------------------------------------------------------------------
-- 運営(管理者)・NGワード
------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
alter table public.admins enable row level security;
create policy admins_select_own on public.admins for select to authenticated using (user_id = auth.uid());
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

create table public.ng_words (word text primary key check (word = lower(word)));
alter table public.ng_words enable row level security;
revoke all on public.ng_words from anon, authenticated;
insert into public.ng_words (word) values
  ('死ね'), ('しね'), ('殺す'), ('ころす'), ('消えろ'), ('きえろ'), ('うざい'), ('きもい'), ('キモい'),
  ('ブス'), ('カス'), ('ガイジ'), ('くたばれ'), ('死んで'), ('ゴミ')
on conflict do nothing;

------------------------------------------------------------------
-- メッセージ / ブロック / ミュート / 既読 / 通報
------------------------------------------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  group_id   uuid references public.groups(id) on delete cascade,
  dm_user_a  uuid references public.profiles(id) on delete cascade,
  dm_user_b  uuid references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 200),
  kind       text not null default 'text' check (kind in ('text', 'quick')),
  hidden     boolean not null default false,
  created_at timestamptz not null default now(),
  check ((group_id is not null) <> (dm_user_a is not null)),
  check ((dm_user_a is null) = (dm_user_b is null)),
  check (dm_user_a is null or dm_user_a < dm_user_b),
  check (dm_user_a is null or sender_id in (dm_user_a, dm_user_b))
);
alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
create index messages_group_idx on public.messages (group_id, created_at desc) where group_id is not null;
create index messages_dm_idx on public.messages (dm_user_a, dm_user_b, created_at desc) where dm_user_a is not null;
create index messages_created_idx on public.messages (created_at);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
create policy blocks_select_own on public.blocks for select to authenticated using (blocker_id = auth.uid());
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

create table public.chat_mutes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  until   timestamptz not null
);
alter table public.chat_mutes enable row level security;
revoke all on public.chat_mutes from anon, authenticated;

create table public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conv_key text not null,
  read_at timestamptz not null default now(),
  primary key (user_id, conv_key)
);
alter table public.chat_reads enable row level security;
revoke all on public.chat_reads from anon, authenticated;

create table public.message_reports (
  id            uuid primary key default gen_random_uuid(),
  reporter_id   uuid not null references public.profiles(id) on delete cascade,
  message_id    uuid references public.messages(id) on delete set null,
  sender_id     uuid not null references public.profiles(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete set null,
  body_snapshot text not null,
  reason        text not null check (reason in ('abuse', 'bullying', 'personal_info', 'spam', 'other')),
  note          text check (char_length(note) <= 200),
  status        text not null default 'open' check (status in ('open', 'resolved')),
  action        text check (action in ('dismiss', 'hide', 'hide_mute')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (reporter_id, message_id)
);
alter table public.message_reports enable row level security;
create policy reports_select_own on public.message_reports for select to authenticated using (reporter_id = auth.uid());
revoke all on public.message_reports from anon, authenticated;
grant select on public.message_reports to authenticated;
create index message_reports_open_idx on public.message_reports (created_at) where status = 'open';

------------------------------------------------------------------
-- 内部関数
------------------------------------------------------------------
create or replace function public._quick_phrases() returns text[]
language sql immutable as $$
  select array['がんばろう', '今日これやる', '終わった', 'おつかれさま', 'あと少し', '一緒にやろう', 'ナイス', 'すごい']
$$;

-- 送ってよい文面か。問題があれば理由コードを返す(なければ null)
create or replace function public._check_message_text(p_body text) returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  norm text := lower(normalize(p_body, NFKC));
  compact text := regexp_replace(norm, '[\s\-ー–—.()]', '', 'g');
begin
  -- つらい気持ち: 送らせず、やさしい案内を返す
  if norm ~ '(死にたい|しにたい|消えたい|きえたい|自殺|じさつ|リスカ|自傷)' then return 'care'; end if;
  -- 個人情報・連絡先: 電話番号、メール/ID(@)、リンク
  if compact ~ '[0-9]{10,}' or norm ~ '@' or norm ~ '(https?:|://|www\.)' or norm ~ '\.(com|jp|net|org|co|me|ly|gg|io)(/|\s|$)' then
    return 'personal';
  end if;
  if exists (select 1 from public.ng_words w where position(w.word in norm) > 0) then return 'ng'; end if;
  return null;
end $$;

-- 会話に参加できるか(グループのメンバー / フレンド)。ブロックの確認も含む
create or replace function public._conv_check(p_uid uuid, p_group uuid, p_user uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (p_group is null) = (p_user is null) then raise exception 'SQ_INVALID_INPUT'; end if;
  if p_group is not null then
    if not public._is_group_member(p_group, p_uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  else
    if not public.are_friends(p_uid, p_user) then raise exception 'SQ_NOT_FRIENDS'; end if;
    if exists (select 1 from public.blocks
                where (blocker_id = p_uid and blocked_id = p_user) or (blocker_id = p_user and blocked_id = p_uid)) then
      raise exception 'SQ_MSG_BLOCKED';
    end if;
  end if;
end $$;

create or replace function public._conv_key(p_uid uuid, p_group uuid, p_user uuid) returns text
language sql immutable as $$
  select case when p_group is not null then 'g:' || p_group::text
              else 'd:' || least(p_uid, p_user)::text || ':' || greatest(p_uid, p_user)::text end
$$;

------------------------------------------------------------------
-- 送信 / 取得
------------------------------------------------------------------
create or replace function public.send_message(p_group uuid, p_user uuid, p_body text, p_quick boolean default false)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  body text := btrim(coalesce(p_body, ''));
  tz text;
  hr int;
  problem text;
  a uuid;
  b uuid;
  m public.messages;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if char_length(body) < 1 or char_length(body) > 200 then raise exception 'SQ_INVALID_INPUT'; end if;
  perform public._conv_check(uid, p_group, p_user);

  if exists (select 1 from public.chat_mutes where user_id = uid and until > now()) then
    raise exception 'SQ_MSG_MUTED';
  end if;
  tz := coalesce((select timezone from public.profiles where id = uid), 'Asia/Tokyo');
  hr := extract(hour from (now() at time zone tz))::int;
  if hr >= 22 or hr < 7 then raise exception 'SQ_MSG_QUIET'; end if;

  if p_quick then
    if not (body = any (public._quick_phrases())) then raise exception 'SQ_INVALID_INPUT'; end if;
  else
    problem := public._check_message_text(body);
    if problem = 'care' then raise exception 'SQ_MSG_CARE'; end if;
    if problem = 'personal' then raise exception 'SQ_MSG_PERSONAL'; end if;
    if problem = 'ng' then raise exception 'SQ_MSG_NG'; end if;
  end if;

  if (select count(*) from public.messages where sender_id = uid and created_at > now() - interval '30 seconds') >= 8 then
    raise exception 'SQ_MSG_RATE';
  end if;

  -- 30日より古いメッセージを少しずつ削除(pg_cron が使えなくても、使うたびに掃除される)
  delete from public.messages where id in (
    select id from public.messages where created_at < now() - interval '30 days' limit 200);

  if p_user is not null then a := least(uid, p_user); b := greatest(uid, p_user); end if;
  insert into public.messages (sender_id, group_id, dm_user_a, dm_user_b, body, kind)
    values (uid, p_group, a, b, body, case when p_quick then 'quick' else 'text' end)
    returning * into m;
  return jsonb_build_object('id', m.id, 'body', m.body, 'kind', m.kind, 'created_at', m.created_at, 'is_mine', true);
end $$;

-- 新しい順に最大 p_limit 件。非表示/ブロックした人のメッセージは含まない。送信者の名前・色つき
create or replace function public.get_messages(p_group uuid, p_user uuid, p_before timestamptz default null, p_limit int default 50)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  a uuid;
  b uuid;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if (p_group is null) = (p_user is null) then raise exception 'SQ_INVALID_INPUT'; end if;
  if p_group is not null then
    if not public._is_group_member(p_group, uid, true) then raise exception 'SQ_GROUP_NOT_FOUND'; end if;
  else
    if not public.are_friends(uid, p_user) then raise exception 'SQ_NOT_FRIENDS'; end if;
    a := least(uid, p_user); b := greatest(uid, p_user);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', x.id, 'body', x.body, 'kind', x.kind, 'created_at', x.created_at,
      'sender_id', x.sender_id, 'is_mine', x.sender_id = uid,
      'nickname', p.nickname, 'avatar', p.avatar) order by x.created_at desc)
    from (
      select m.* from public.messages m
       where not m.hidden
         and (p_before is null or m.created_at < p_before)
         and ((p_group is not null and m.group_id = p_group) or (p_user is not null and m.dm_user_a = a and m.dm_user_b = b))
         and not exists (select 1 from public.blocks bl where bl.blocker_id = uid and bl.blocked_id = m.sender_id)
       order by m.created_at desc
       limit least(greatest(coalesce(p_limit, 50), 1), 100)
    ) x
    join public.profiles p on p.id = x.sender_id
  ), '[]'::jsonb);
end $$;

create or replace function public.mark_chat_read(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  perform public._conv_check(uid, p_group, p_user);
  insert into public.chat_reads (user_id, conv_key, read_at) values (uid, public._conv_key(uid, p_group, p_user), now())
    on conflict (user_id, conv_key) do update set read_at = excluded.read_at;
end $$;

-- 未読の数(グループごと・友だちごと)
create or replace function public.chat_unread() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  return jsonb_build_object(
    'groups', coalesce((
      select jsonb_object_agg(g.group_id, g.n) from (
        select gm.group_id, count(m.id)::int as n
          from public.group_members gm
          left join public.chat_reads r on r.user_id = uid and r.conv_key = 'g:' || gm.group_id::text
          join public.messages m on m.group_id = gm.group_id and not m.hidden and m.sender_id <> uid
                and m.created_at > coalesce(r.read_at, '-infinity')
                and not exists (select 1 from public.blocks bl where bl.blocker_id = uid and bl.blocked_id = m.sender_id)
         where gm.user_id = uid and gm.status = 'joined'
         group by gm.group_id) g), '{}'::jsonb),
    'dms', coalesce((
      select jsonb_object_agg(d.friend, d.n) from (
        select case when f.user_a = uid then f.user_b else f.user_a end as friend, count(m.id)::int as n
          from public.friendships f
          left join public.chat_reads r on r.user_id = uid and r.conv_key = 'd:' || f.user_a::text || ':' || f.user_b::text
          join public.messages m on m.dm_user_a = f.user_a and m.dm_user_b = f.user_b and not m.hidden and m.sender_id <> uid
                and m.created_at > coalesce(r.read_at, '-infinity')
                and not exists (select 1 from public.blocks bl where bl.blocker_id = uid and bl.blocked_id = m.sender_id)
         where f.user_a = uid or f.user_b = uid
         group by 1) d), '{}'::jsonb));
end $$;

------------------------------------------------------------------
-- ブロック / 通報
------------------------------------------------------------------
create or replace function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if p_user is null or p_user = uid then raise exception 'SQ_INVALID_INPUT'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'SQ_INVALID_INPUT'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (uid, p_user) on conflict do nothing;
end $$;

create or replace function public.unblock_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  delete from public.blocks where blocker_id = uid and blocked_id = p_user;
end $$;

create or replace function public.my_blocks() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', p.id, 'nickname', p.nickname, 'avatar', p.avatar) order by b.created_at desc)
      from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = uid), '[]'::jsonb);
end $$;

create or replace function public.report_message(p_message_id uuid, p_reason text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  m public.messages;
  inserted_id uuid;
  n int;
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  if p_reason not in ('abuse', 'bullying', 'personal_info', 'spam', 'other') then raise exception 'SQ_INVALID_INPUT'; end if;
  select * into m from public.messages where id = p_message_id and not hidden;
  if not found then raise exception 'SQ_MSG_NOT_FOUND'; end if;
  -- 見える立場の人だけ通報できる。自分のメッセージは通報できない
  if m.sender_id = uid then raise exception 'SQ_INVALID_INPUT'; end if;
  if m.group_id is not null then
    if not public._is_group_member(m.group_id, uid, true) then raise exception 'SQ_MSG_NOT_FOUND'; end if;
  elsif uid not in (m.dm_user_a, m.dm_user_b) then
    raise exception 'SQ_MSG_NOT_FOUND';
  end if;

  insert into public.message_reports (reporter_id, message_id, sender_id, group_id, body_snapshot, reason, note)
    values (uid, m.id, m.sender_id, m.group_id, m.body, p_reason, nullif(btrim(coalesce(p_note, '')), ''))
    on conflict (reporter_id, message_id) do nothing
    returning id into inserted_id;

  -- 3人以上から通報されたら、運営の確認を待つ間は自動で非表示にする
  select count(*) into n from public.message_reports where message_id = m.id;
  if n >= 3 then update public.messages set hidden = true where id = m.id; end if;
  return jsonb_build_object('ok', true, 'newly_reported', inserted_id is not null);
end $$;

------------------------------------------------------------------
-- 運営: 通報の一覧 / 対応
------------------------------------------------------------------
create or replace function public.admin_open_reports() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then raise exception 'SQ_FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reason', r.reason, 'note', r.note, 'created_at', r.created_at,
      'body', r.body_snapshot, 'sender_id', r.sender_id, 'sender_nickname', sp.nickname,
      'reporter_nickname', rp.nickname,
      'group_name', g.name,
      'report_count', (select count(*) from public.message_reports x where x.message_id is not distinct from r.message_id and r.message_id is not null),
      'hidden', coalesce((select m.hidden from public.messages m where m.id = r.message_id), true)
    ) order by r.created_at)
    from public.message_reports r
    join public.profiles sp on sp.id = r.sender_id
    join public.profiles rp on rp.id = r.reporter_id
    left join public.groups g on g.id = r.group_id
    where r.status = 'open'), '[]'::jsonb);
end $$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_action text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.message_reports;
begin
  if not public.is_admin() then raise exception 'SQ_FORBIDDEN'; end if;
  if p_action not in ('dismiss', 'hide', 'hide_mute') then raise exception 'SQ_INVALID_INPUT'; end if;
  select * into r from public.message_reports where id = p_report_id and status = 'open' for update;
  if not found then raise exception 'SQ_REQUEST_NOT_FOUND'; end if;
  if r.message_id is not null then
    -- 自動非表示になっていたものも、問題なしなら元に戻す
    update public.messages set hidden = (p_action <> 'dismiss') where id = r.message_id;
  end if;
  if p_action = 'hide_mute' then
    insert into public.chat_mutes (user_id, until) values (r.sender_id, now() + interval '24 hours')
      on conflict (user_id) do update set until = greatest(public.chat_mutes.until, excluded.until);
  end if;
  update public.message_reports
     set status = 'resolved', action = p_action, resolved_at = now()
   where status = 'open' and (id = r.id or (r.message_id is not null and message_id = r.message_id));
end $$;

-- 古いメッセージの一括削除(pg_cron を使う場合: select cron.schedule('purge-messages', '15 3 * * *', 'select public.purge_old_messages()');)
create or replace function public.purge_old_messages() returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  delete from public.messages where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;

------------------------------------------------------------------
-- 権限(公開するRPCだけ authenticated に付与)
------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
revoke execute on function public._quick_phrases(), public._check_message_text(text),
  public._conv_check(uuid, uuid, uuid), public._conv_key(uuid, uuid, uuid), public.purge_old_messages()
  from authenticated;
grant execute on function
  public.is_admin(), public.send_message(uuid, uuid, text, boolean), public.get_messages(uuid, uuid, timestamptz, int),
  public.mark_chat_read(uuid, uuid), public.chat_unread(), public.block_user(uuid), public.unblock_user(uuid),
  public.my_blocks(), public.report_message(uuid, text, text),
  public.admin_open_reports(), public.admin_resolve_report(uuid, text)
  to authenticated;
