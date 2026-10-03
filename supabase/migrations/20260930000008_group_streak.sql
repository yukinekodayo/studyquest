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
