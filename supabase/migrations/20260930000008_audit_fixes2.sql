-- 監査エポック2の修正
--  1) 実学習60秒未満のセッションはXP 0(1XP/回の無限稼ぎ防止)
--  2) manual_xp_daily をクライアントから完全に閉じる

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
        -- 実学習60秒未満はXPなし(作成→開始→即完了→削除の連打対策)
        if total_secs >= 60 then
          gained := least(t.planned_minutes, greatest(1, round(total_secs / 60.0)::int));
        end if;
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

revoke all on table public.manual_xp_daily from anon, authenticated;
