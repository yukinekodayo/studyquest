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
