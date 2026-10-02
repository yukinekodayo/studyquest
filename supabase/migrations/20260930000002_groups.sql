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
