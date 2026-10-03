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
