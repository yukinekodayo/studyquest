-- 監査指摘の修正
--  1) 手動完了XPの無限稼ぎ防止(作成→完了→削除の繰り返し)
--  2) 内部ヘルパーを呼び出し本人に束縛 / クライアント公開を外す
--  3) グループ週間目標: 進捗をメンバーごとに5日で頭打ち

------------------------------------------------------------------
-- 1) 手動完了(タイマーなし)のXPは、1日あたり50XPまで
--    タスクを削除しても消えない専用テーブルで集計する
------------------------------------------------------------------
create table public.manual_xp_daily (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  xp      int  not null default 0 check (xp >= 0),
  primary key (user_id, day)
);
alter table public.manual_xp_daily enable row level security;  -- ポリシーなし = クライアントからは触れない

create or replace function public.complete_task(p_task_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  t public.tasks;
  total_secs int;
  gained int := 0;
  used int;
  today date;
  lvl_before int;
  lvl_after int;
  day_result jsonb;
  newly text[];
begin
  if uid is null then raise exception 'SQ_UNAUTHENTICATED'; end if;
  select * into t from public.tasks where id = p_task_id and user_id = uid for update;
  if not found then raise exception 'SQ_TASK_NOT_FOUND'; end if;
  today := public._user_today(uid);
  if t.task_date <> today then raise exception 'SQ_TASK_NOT_TODAY'; end if;
  select xp / 500 + 1 into lvl_before from public.user_stats where user_id = uid;

  if t.status <> 'done' then
    total_secs := public._close_sessions(p_task_id);
    if t.xp_awarded = 0 then
      if exists (select 1 from public.study_sessions where task_id = p_task_id) then
        gained := least(t.planned_minutes, greatest(1, round(total_secs / 60.0)::int));
      else
        -- タイマーなしの手動完了は控えめ(1回5XP・1日50XPまで)
        insert into public.manual_xp_daily (user_id, day) values (uid, today) on conflict do nothing;
        select xp into used from public.manual_xp_daily where user_id = uid and day = today for update;
        gained := greatest(0, least(t.planned_minutes, 5, 50 - used));
        update public.manual_xp_daily set xp = xp + gained where user_id = uid and day = today;
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

revoke execute on function public.complete_task(uuid) from public, anon;
grant execute on function public.complete_task(uuid) to authenticated;

------------------------------------------------------------------
-- 2) 内部ヘルパー: ログイン中のユーザー自身に関する問い合わせだけ答える
--    (auth.uid() が null = サーバー内部/管理者はそのまま)
------------------------------------------------------------------
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is null or auth.uid() in (a, b)) and exists (
    select 1 from public.friendships
    where user_a = least(a, b) and user_b = greatest(a, b)
  )
$$;

create or replace function public._has_pending_request(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is null or auth.uid() in (a, b)) and exists (
    select 1 from public.friend_requests
    where status = 'pending'
      and ((from_user = a and to_user = b) or (from_user = b and to_user = a))
  )
$$;

create or replace function public._is_group_member(p_group uuid, p_uid uuid, p_joined_only boolean default true)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.uid() is null or auth.uid() = p_uid) and exists (
    select 1 from public.group_members
     where group_id = p_group and user_id = p_uid and (not p_joined_only or status = 'joined')
  )
$$;

-- _user_today は RLS ポリシーでは使われない(app_today 経由は SECURITY DEFINER)ため公開を外す
revoke execute on function public._user_today(uuid) from public, anon, authenticated;

------------------------------------------------------------------
-- 3) グループ週間目標: 1人あたり最大5日で頭打ち(目標 = 人数 × 5日)
------------------------------------------------------------------
create or replace function public._group_week(p_group uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  wk_start date := date_trunc('week', p_today)::date;
  wk_end date := date_trunc('week', p_today)::date + 6;
  members int;
  progress int;
begin
  select count(*) into members from public.group_members where group_id = p_group and status = 'joined';
  select coalesce(sum(least(5, c.days)), 0) into progress
    from (
      select count(*) as days
        from public.group_members gm
        join public.profiles p on p.id = gm.user_id
        join public.daily_completions d on d.user_id = gm.user_id
       where gm.group_id = p_group and gm.status = 'joined'
         and d.completed_date between wk_start and wk_end
         and d.completed_date >= (gm.joined_at at time zone p.timezone)::date
       group by gm.user_id
    ) c;
  return jsonb_build_object(
    'target', greatest(members, 1) * 5,
    'progress', progress,
    'starts_on', wk_start, 'ends_on', wk_end,
    'days_left', wk_end - p_today);
end $$;

revoke execute on function public._group_week(uuid, date) from public, anon, authenticated;
