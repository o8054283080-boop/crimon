-- アリーナ公開前の安全修正。
--
-- 1. 週の境界をクライアントと同じ「月曜 04:00 JST」に統一
-- 2. 期限を迎えたシーズンを、アクセス時と5分ごとのCronで自動的に締める
-- 3. 報酬はACTIVEではなく、最新のCLOSEDシーズンから受け取る
-- 4. シーズンをまたいだ対戦を次シーズンへ混ぜず、挑戦券を返す
-- 5. ショップ購入を領収書方式にして、ローカル付与失敗から再開できるようにする

-- =====================================================================
-- 週の境界。2026-08-31 04:00 JST = 2026-08-30 19:00 UTC
-- =====================================================================

create or replace function public.arena_week_key_at(p_at timestamptz default now())
returns text
language sql
immutable
set search_path = ''
as $$
  select 'W' || floor(
    extract(epoch from (p_at - timestamptz '2026-08-30 19:00:00+00')) / 604800
  )::bigint::text;
$$;

revoke execute on function public.arena_week_key_at(timestamptz) from public, anon, authenticated;
grant execute on function public.arena_week_key_at(timestamptz) to service_role;

-- =====================================================================
-- シーズン自動更新
-- =====================================================================

create or replace function public.arena_rollover_due_seasons()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season public.arena_seasons%rowtype;
  v_next_id text;
  v_next_name text;
  v_closed integer := 0;
begin
  -- 長期間停止していた環境でも追いつける。暴走を避けるため1回24期まで。
  loop
    exit when v_closed >= 24;
    select * into v_season
      from public.arena_seasons s
     where s.status = 'ACTIVE' and s.ends_at <= now()
     order by s.ends_at asc
     for update skip locked
     limit 1;
    exit when not found;

    if v_season.id ~ '^S[0-9]+$' then
      v_next_id := 'S' || ((substring(v_season.id from 2))::integer + 1)::text;
      v_next_name := 'シーズン ' || ((substring(v_season.id from 2))::integer + 1)::text;
    else
      v_next_id := 'S_' || to_char(v_season.ends_at at time zone 'utc', 'YYYYMMDDHH24MI');
      v_next_name := 'シーズン ' || to_char(v_season.ends_at at time zone 'Asia/Tokyo', 'YYYY/MM/DD');
    end if;

    -- 終了時点で未精算の対戦は次期へ混ぜない。使った挑戦券は返す。
    with expired as (
      update public.arena_match_sessions ms
         set status = 'EXPIRED'
       where ms.season_id = v_season.id and ms.status = 'OPEN'
      returning ms.attacker_id
    ), refunds as (
      select e.attacker_id, count(*)::integer as amount
        from expired e
       group by e.attacker_id
    )
    update public.arena_wallets w
       set tickets = least(w.tickets_max, w.tickets + r.amount),
           updated_at = now()
      from refunds r
     where w.user_id = r.attacker_id;

    perform public.arena_close_season(
      p_season_id => v_season.id,
      p_next_season_id => v_next_id,
      p_next_name => v_next_name,
      p_next_starts_at => v_season.ends_at,
      p_next_ends_at => v_season.ends_at + interval '28 days'
    );
    -- 順位は終了時レート、報酬ランクはその期の最高レートで決める。
    update public.arena_season_results r
       set final_tier_id = public.arena_tier_for_rating(s.best_rating)
      from public.arena_standings s
     where r.season_id = v_season.id
       and s.season_id = r.season_id
       and s.user_id = r.user_id;
    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'closed', v_closed);
end;
$$;

revoke execute on function public.arena_rollover_due_seasons() from public, anon, authenticated;
grant execute on function public.arena_rollover_due_seasons() to service_role;

-- RPCが使われた時にも期限を検査する。Cronが一時停止しても期限切れ期を使わせない。
create or replace function public.arena_current_season()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season text;
begin
  perform public.arena_rollover_due_seasons();
  select s.id into v_season
    from public.arena_seasons s
   where s.status = 'ACTIVE'
     and s.starts_at <= now()
     and s.ends_at > now()
   order by s.starts_at desc
   limit 1;
  return v_season;
end;
$$;

revoke execute on function public.arena_current_season() from public;
grant execute on function public.arena_current_season() to anon, authenticated;

-- Supabase Cron(pg_cron)で、アクセスが無い期間もシーズンを締める。
create extension if not exists pg_cron;
select cron.schedule(
  'crimon-arena-season-rollover',
  '*/5 * * * *',
  $job$select public.arena_rollover_due_seasons();$job$
);

-- =====================================================================
-- 週間報酬。ショップと同じ週キーを使う。
-- =====================================================================

create or replace function public.arena_claim_weekly_reward()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_season  text := public.arena_current_season();
  v_tier    text;
  v_period  text := public.arena_week_key_at(now());
  v_coins   integer;
  v_claim   uuid;
  v_balance bigint;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if v_season is null then raise exception 'NO_ACTIVE_SEASON'; end if;

  select public.arena_tier_for_rating(s.best_rating) into v_tier from public.arena_standings s
   where s.user_id = v_uid and s.season_id = v_season;
  if v_tier is null then raise exception 'NO_STANDING'; end if;

  select r.coins into v_coins from public.arena_reward_rules r
   where r.kind = 'WEEKLY' and r.tier_id = v_tier;
  if v_coins is null then raise exception 'NO_REWARD_RULE'; end if;

  insert into public.arena_reward_claims (user_id, kind, period_key, tier_id, coins)
  values (v_uid, 'WEEKLY', v_period, v_tier, v_coins)
  on conflict on constraint arena_reward_claims_once do nothing
  returning id into v_claim;

  if v_claim is null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'periodKey', v_period);
  end if;

  v_balance := public.arena__grant_coins(v_uid, v_coins);
  return jsonb_build_object('ok', true, 'periodKey', v_period, 'tierId', v_tier,
                            'coins', v_coins, 'coinBalance', v_balance);
end;
$$;

revoke execute on function public.arena_claim_weekly_reward() from public;
grant execute on function public.arena_claim_weekly_reward() to authenticated;

-- =====================================================================
-- 最新の終了済みシーズン報酬。ACTIVEのIDをクライアントに選ばせない。
-- すでにサーバで受取済みでも同じ領収内容を返し、ローカル保存前の通信断から復旧する。
-- =====================================================================

create or replace function public.arena_claim_latest_season_reward()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_season   text;
  v_tier     text;
  v_coins    integer;
  v_claim    uuid;
  v_balance  bigint;
  v_existing boolean := false;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public.arena_rollover_due_seasons();

  select r.season_id, r.final_tier_id
    into v_season, v_tier
    from public.arena_season_results r
    join public.arena_seasons s on s.id = r.season_id
   where r.user_id = v_uid and s.status = 'CLOSED'
   order by s.ends_at desc
   limit 1;
  if v_season is null then
    return jsonb_build_object('ok', false, 'code', 'NO_CLAIMABLE_SEASON');
  end if;

  select r.coins into v_coins from public.arena_reward_rules r
   where r.kind = 'SEASON' and r.tier_id = v_tier;
  if v_coins is null then raise exception 'NO_REWARD_RULE'; end if;

  select c.id into v_claim from public.arena_reward_claims c
   where c.user_id = v_uid and c.kind = 'SEASON' and c.period_key = v_season;
  v_existing := found;

  if not v_existing then
    insert into public.arena_reward_claims (user_id, kind, period_key, tier_id, coins)
    values (v_uid, 'SEASON', v_season, v_tier, v_coins)
    on conflict on constraint arena_reward_claims_once do nothing
    returning id into v_claim;
    v_existing := v_claim is null;
    if not v_existing then
      v_balance := public.arena__grant_coins(v_uid, v_coins);
    end if;
  end if;

  if v_existing then
    select w.coins into v_balance from public.arena_wallets w where w.user_id = v_uid;
  end if;
  return jsonb_build_object(
    'ok', true,
    'code', case when v_existing then 'ALREADY_CLAIMED' else null end,
    'periodKey', v_season,
    'tierId', v_tier,
    'coins', case when v_existing then 0 else v_coins end,
    'coinBalance', coalesce(v_balance, 0)
  );
end;
$$;

revoke execute on function public.arena_claim_latest_season_reward() from public, anon;
grant execute on function public.arena_claim_latest_season_reward() to authenticated;

-- =====================================================================
-- ショップ領収書
-- =====================================================================

alter table public.arena_shop_purchases
  add column if not exists fulfilled_at timestamptz;

create index if not exists arena_shop_purchases_pending_idx
  on public.arena_shop_purchases (user_id, created_at asc)
  where fulfilled_at is null;

create or replace function public.arena_purchase_shop_item(
  p_item_id text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_item     public.arena_shop_items%rowtype;
  v_wallet   public.arena_wallets%rowtype;
  v_now      timestamptz := now();
  v_week     text := public.arena_week_key_at(v_now);
  v_month    text := to_char(v_now at time zone 'utc', 'YYYY-MM');
  v_total    bigint;
  v_bought   integer;
  v_purchase uuid;
  v_created  timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'INVALID_QUANTITY'; end if;

  select * into v_item from public.arena_shop_items i where i.id = p_item_id for update;
  if not found then raise exception 'NO_ITEM'; end if;
  if not v_item.active then raise exception 'ITEM_INACTIVE'; end if;
  if v_item.starts_at is not null and v_item.starts_at > v_now then raise exception 'ITEM_NOT_STARTED'; end if;
  if v_item.ends_at is not null and v_item.ends_at <= v_now then raise exception 'ITEM_ENDED'; end if;
  if p_quantity > v_item.max_per_order then raise exception 'OVER_ORDER_LIMIT'; end if;
  if v_item.stock is not null and v_item.stock < p_quantity then raise exception 'OUT_OF_STOCK'; end if;

  if v_item.limit_per_week is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id and pu.week_key = v_week;
    if v_bought + p_quantity > v_item.limit_per_week then raise exception 'OVER_WEEKLY_LIMIT'; end if;
  end if;
  if v_item.limit_per_month is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id and pu.month_key = v_month;
    if v_bought + p_quantity > v_item.limit_per_month then raise exception 'OVER_MONTHLY_LIMIT'; end if;
  end if;
  if v_item.limit_total is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id;
    if v_bought + p_quantity > v_item.limit_total then raise exception 'OVER_TOTAL_LIMIT'; end if;
  end if;

  v_total := v_item.price::bigint * p_quantity;
  select * into v_wallet from public.arena_wallets w where w.user_id = v_uid for update;
  if not found then raise exception 'NO_WALLET'; end if;
  if v_wallet.coins < v_total then raise exception 'NOT_ENOUGH_COINS'; end if;

  update public.arena_wallets w
     set coins = w.coins - v_total, updated_at = v_now
   where w.user_id = v_uid;
  if v_item.stock is not null then
    update public.arena_shop_items i
       set stock = i.stock - p_quantity, updated_at = v_now
     where i.id = p_item_id;
  end if;

  insert into public.arena_shop_purchases
    (user_id, item_id, quantity, unit_price, total_price, week_key, month_key, payload, created_at)
  values (v_uid, p_item_id, p_quantity, v_item.price, v_total::integer,
          v_week, v_month, v_item.payload, v_now)
  returning id, created_at into v_purchase, v_created;

  return jsonb_build_object(
    'ok', true,
    'purchaseId', v_purchase,
    'itemId', p_item_id,
    'quantity', p_quantity,
    'totalPrice', v_total,
    'coinBalance', v_wallet.coins - v_total,
    'payload', v_item.payload,
    'createdAt', v_created
  );
end;
$$;

revoke execute on function public.arena_purchase_shop_item(text, integer) from public, anon;
grant execute on function public.arena_purchase_shop_item(text, integer) to authenticated;

create or replace function public.arena_pending_shop_purchases()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  select coalesce(jsonb_agg(p.receipt order by p.created_at), '[]'::jsonb)
    into v_rows
    from (
      select pu.created_at,
             jsonb_build_object(
               'purchaseId', pu.id,
               'itemId', pu.item_id,
               'quantity', pu.quantity,
               'coinBalance', w.coins,
               'payload', pu.payload,
               'createdAt', pu.created_at
             ) as receipt
        from public.arena_shop_purchases pu
        join public.arena_wallets w on w.user_id = pu.user_id
       where pu.user_id = v_uid and pu.fulfilled_at is null
       order by pu.created_at asc
       limit 100
    ) p;
  return v_rows;
end;
$$;

revoke execute on function public.arena_pending_shop_purchases() from public, anon;
grant execute on function public.arena_pending_shop_purchases() to authenticated;

create or replace function public.arena_ack_shop_purchase(p_purchase_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  update public.arena_shop_purchases pu
     set fulfilled_at = coalesce(pu.fulfilled_at, now())
   where pu.id = p_purchase_id and pu.user_id = v_uid
  returning pu.id into v_id;
  if v_id is null then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_PURCHASE'); end if;
  return jsonb_build_object('ok', true, 'purchaseId', v_id);
end;
$$;

revoke execute on function public.arena_ack_shop_purchase(uuid) from public, anon;
grant execute on function public.arena_ack_shop_purchase(uuid) to authenticated;

-- =====================================================================
-- 対戦精算。開始したシーズンが終了済みなら次期へ混ぜず、挑戦券を返す。
-- =====================================================================

create or replace function public.arena_settle_match(
  p_match_id uuid,
  p_attacker_won boolean,
  p_opponent_rating integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.arena_match_sessions%rowtype;
  v_result jsonb;
  v_season_status text;
  v_season_ends_at timestamptz;
begin
  select * into v_session from public.arena_match_sessions ms
   where ms.id = p_match_id for update;
  if not found then raise exception 'UNKNOWN_MATCH'; end if;
  if v_session.status <> 'OPEN' then raise exception 'ALREADY_SETTLED'; end if;

  if v_session.expires_at < now() then
    update public.arena_match_sessions ms set status = 'EXPIRED' where ms.id = p_match_id;
    return jsonb_build_object('ok', false, 'code', 'MATCH_EXPIRED');
  end if;

  -- close側のFOR UPDATEと競合させ、境界の同時実行でも片方へ直列化する。
  select s.status, s.ends_at into v_season_status, v_season_ends_at
    from public.arena_seasons s
   where s.id = v_session.season_id
   for share;
  if v_season_status <> 'ACTIVE' or v_season_ends_at <= now() then
    update public.arena_match_sessions ms set status = 'EXPIRED' where ms.id = p_match_id;
    update public.arena_wallets w
       set tickets = least(w.tickets_max, w.tickets + 1), updated_at = now()
     where w.user_id = v_session.attacker_id;
    return jsonb_build_object('ok', false, 'code', 'SEASON_CLOSED', 'ticketRefunded', true);
  end if;

  v_result := public.arena__record_match(
    p_attacker => v_session.attacker_id,
    p_opponent_kind => v_session.opponent_kind,
    p_defender => v_session.defender_id,
    p_npc_seed => v_session.npc_seed,
    p_npc_name => v_session.npc_name,
    p_opponent_rating => case
      when v_session.opponent_kind = 'NPC' and p_opponent_rating is not null then p_opponent_rating
      else v_session.defender_rating_before
    end,
    p_attacker_won => p_attacker_won
  );

  update public.arena_match_sessions ms
     set status = 'SETTLED', settled_at = now(),
         defender_rating_before = case
           when v_session.opponent_kind = 'NPC' and p_opponent_rating is not null then p_opponent_rating
           else ms.defender_rating_before
         end
   where ms.id = p_match_id;

  return v_result || jsonb_build_object('matchId', v_session.id);
end;
$$;

revoke execute on function public.arena_settle_match(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.arena_settle_match(uuid, boolean, integer) to service_role;
