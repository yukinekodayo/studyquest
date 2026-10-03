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
