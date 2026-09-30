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
