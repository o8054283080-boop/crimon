-- Arena season placement rewards.
-- Final rank is already frozen in arena_season_results by arena_close_season.
-- Placement reward is an additional, once-per-season coin reward; client-side
-- inventory rewards are described by src/data/arena/season.ts and granted by
-- the existing fulfillment path.

create table if not exists public.arena_rank_reward_rules (
  min_rank integer primary key,
  max_rank integer not null check (max_rank >= min_rank),
  coins integer not null check (coins >= 0)
);

alter table public.arena_rank_reward_rules enable row level security;
-- No direct client policy is needed: this rule table is consumed only by the
-- SECURITY DEFINER claim RPC. Keeping it closed prevents client-side tampering.

insert into public.arena_rank_reward_rules (min_rank, max_rank, coins) values
  (1,1,1500),(2,2,1250),(3,3,1000),(4,10,750),(11,30,500),(31,100,250)
on conflict (min_rank) do update set max_rank=excluded.max_rank, coins=excluded.coins;

alter table public.arena_reward_claims drop constraint if exists arena_reward_claims_kind_check;
alter table public.arena_reward_claims add constraint arena_reward_claims_kind_check
  check (kind in ('WEEKLY','SEASON','SEASON_RANK'));

create or replace function public.arena_claim_season_rank_reward(p_season_id text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_rank integer;
  v_tier text;
  v_coins integer;
  v_claim uuid;
  v_balance bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select s.status into v_status from public.arena_seasons s where s.id=p_season_id;
  if v_status is null then raise exception 'NO_SEASON'; end if;
  if v_status <> 'CLOSED' then raise exception 'SEASON_NOT_CLOSED'; end if;

  select r.final_rank, r.final_tier_id into v_rank, v_tier
    from public.arena_season_results r
   where r.season_id=p_season_id and r.user_id=v_uid;
  if v_rank is null then raise exception 'NO_SEASON_RESULT'; end if;

  select rr.coins into v_coins from public.arena_rank_reward_rules rr
   where v_rank between rr.min_rank and rr.max_rank order by rr.min_rank desc limit 1;
  if v_coins is null then
    return jsonb_build_object('ok',false,'code','RANK_NOT_ELIGIBLE','rank',v_rank);
  end if;

  insert into public.arena_reward_claims(user_id,kind,period_key,tier_id,coins)
  values(v_uid,'SEASON_RANK',p_season_id,v_tier,v_coins)
  on conflict on constraint arena_reward_claims_once do nothing returning id into v_claim;
  if v_claim is null then
    return jsonb_build_object('ok',false,'code','ALREADY_CLAIMED','periodKey',p_season_id,'rank',v_rank);
  end if;

  v_balance := public.arena__grant_coins(v_uid,v_coins);
  return jsonb_build_object('ok',true,'periodKey',p_season_id,'rank',v_rank,
    'tierId',v_tier,'coins',v_coins,'coinBalance',v_balance);
end;
$$;

revoke execute on function public.arena_claim_season_rank_reward(text) from public, anon;
grant execute on function public.arena_claim_season_rank_reward(text) to authenticated;
