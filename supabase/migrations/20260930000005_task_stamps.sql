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
