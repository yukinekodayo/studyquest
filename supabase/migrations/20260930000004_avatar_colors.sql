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
