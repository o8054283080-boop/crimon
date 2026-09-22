-- 復旧IDで本人確認できた時だけ、分裂したアリーナを元の成績へ戻す。
-- 新しく生まれた p_to 側の仮戦績は合算しない。元 p_from をそのまま残す。
create or replace function public.crimon_arena_relink(p_from uuid, p_to uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if p_from is null or p_to is null then raise exception 'MISSING_USER'; end if;
  if p_from = p_to then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  if not exists (select 1 from public.arena_profiles where user_id = p_from) then
    raise exception 'FROM_NOT_FOUND';
  end if;

  v_before := jsonb_build_object(
    'from', public.crimon_arena_account_snapshot(p_from),
    'to', public.crimon_arena_account_snapshot(p_to)
  );

  -- 新しく作られた側はバグで生じた仮アカウントなので、その成績は破棄する。
  delete from public.arena_match_sessions where attacker_id = p_to or defender_id = p_to;
  delete from public.arena_matches where attacker_id = p_to or defender_id = p_to;
  delete from public.arena_shop_purchases where user_id = p_to;
  delete from public.arena_reward_claims where user_id = p_to;
  delete from public.arena_season_results where user_id = p_to;
  delete from public.personal_gifts where user_id = p_to;
  delete from public.trial_tower_progress where user_id = p_to;
  delete from public.arena_defenses where user_id = p_to;
  delete from public.arena_wallets where user_id = p_to;
  delete from public.arena_standings where user_id = p_to;
  delete from public.arena_profiles where user_id = p_to;

  -- 先に移し先の親を作る。子テーブルのFKを壊さない。
  insert into public.arena_profiles
    (user_id, display_name, icon_key, lead_dex_id, lead_star, created_at, updated_at)
  select p_to, display_name, icon_key, lead_dex_id, lead_star, created_at, now()
  from public.arena_profiles where user_id = p_from;

  update public.arena_standings set user_id = p_to where user_id = p_from;
  update public.arena_defenses set user_id = p_to where user_id = p_from;
  update public.arena_wallets set user_id = p_to where user_id = p_from;
  update public.arena_reward_claims set user_id = p_to where user_id = p_from;
  update public.arena_shop_purchases set user_id = p_to where user_id = p_from;
  update public.arena_season_results set user_id = p_to where user_id = p_from;
  update public.personal_gifts set user_id = p_to where user_id = p_from;
  update public.trial_tower_progress set user_id = p_to where user_id = p_from;
  update public.arena_matches set attacker_id = p_to where attacker_id = p_from;
  update public.arena_matches set defender_id = p_to where defender_id = p_from;
  update public.arena_match_sessions set attacker_id = p_to where attacker_id = p_from;
  update public.arena_match_sessions set defender_id = p_to where defender_id = p_from;

  delete from public.arena_profiles where user_id = p_from;

  insert into public.crimon_arena_merge_log(from_user_id,to_user_id,before_snapshot,summary)
  values (p_from,p_to,v_before,jsonb_build_object('mode','relink','kept','from','discarded','to'));

  return jsonb_build_object('ok', true, 'from', p_from, 'to', p_to);
end;
$$;

-- ブラウザから直接は呼ばせない。crimon-recovery(service_role)だけが使う。
revoke all on function public.crimon_arena_relink(uuid, uuid) from public, anon, authenticated;
