-- =====================================================================
-- アリーナショップの長期目標と、防衛成功コイン。
--
-- ・週/月に加えて、4週間のシーズンごとの購入上限を持つ
-- ・防衛成功は4コイン。ただし談合や人口増加で無制限に増えないよう1日40まで
-- ・対戦行へ防衛側の獲得額を焼き、履歴と財布が同じ事実を指す
-- =====================================================================

alter table public.arena_shop_items
  add column if not exists limit_per_season integer
    check (limit_per_season is null or limit_per_season >= 1);

alter table public.arena_shop_purchases
  add column if not exists season_key text not null default '';

create index if not exists arena_shop_purchases_season_idx
  on public.arena_shop_purchases (user_id, item_id, season_key);

alter table public.arena_standings
  add column if not exists defense_coin_date date,
  add column if not exists defense_coins_today integer not null default 0
    check (defense_coins_today >= 0);

alter table public.arena_matches
  add column if not exists defender_coins_awarded integer not null default 0
    check (defender_coins_awarded >= 0),
  add column if not exists defender_coins_claimed_at timestamptz;

-- レート側の既存値を残しつつ、防衛コインの金額と日次上限を同じ設定へ置く。
insert into public.arena_config (key, value, note) values
  ('defense',
   '{"scale":0.5,"daily_loss_cap":60,"coin_win":4,"daily_coin_cap":40}'::jsonb,
   '防衛レート倍率・日次損失上限・防衛成功コイン・日次コイン上限')
on conflict (key) do update
  set value = excluded.value, note = excluded.note, updated_at = now();

-- 既にseedを適用した環境でも、価格変更と追加商品が必ず反映されるようupsertする。
insert into public.arena_shop_items
  (id, name, description, price, payload,
   limit_per_week, limit_per_month, limit_per_season,
   max_per_order, active, sort_order)
values
  ('summon_scroll', '召喚の書', '通常召喚を1回ぶん', 60,
   '{"kind":"SUMMON_SCROLL","amount":1}'::jsonb, 5, null, null, 1, true, 10),
  ('gold_small', 'ゴールド 50,000', '強化と装備の費用に', 25,
   '{"kind":"GOLD","amount":50000}'::jsonb, 10, null, null, 1, true, 20),
  ('exp_pig_3', '経験ピッグ★3', 'モンスター強化の素材', 45,
   '{"kind":"EXP_PIG","amount":1,"star":3}'::jsonb, 3, null, null, 1, true, 30),
  ('awakening_orb', '覚醒オーブ', '潜在覚醒の候補を1つ選べる', 500,
   '{"kind":"AWAKENING_ORB","amount":1}'::jsonb, 1, null, null, 1, true, 40),
  ('exp_pig_4', '経験ピッグ★4', 'レベル上限で届く上級強化素材', 180,
   '{"kind":"EXP_PIG","amount":1,"star":4}'::jsonb, 1, null, null, 1, true, 45),
  ('four_star_scroll', '★4以上召喚書', '★4以上が確定で出る', 400,
   '{"kind":"FOUR_STAR_SCROLL","amount":1}'::jsonb, null, 1, null, 1, true, 50),
  ('light_dark_scroll', '光闇★4以上召喚書', '光か闇の★4以上が確定で出る', 600,
   '{"kind":"LIGHT_DARK_SCROLL","amount":1}'::jsonb, null, 1, null, 1, true, 60),
  ('reincarnation_pig_4', '転生ピッグ★4', 'ランクアップの素材。レベル上限で届く', 700,
   '{"kind":"REINCARNATION_PIG","amount":1,"star":4}'::jsonb, null, 1, null, 1, true, 70),
  ('skill_pig', 'スキルピッグ', '同じ種族を使わずスキルレベルを上げられる', 900,
   '{"kind":"SKILL_PIG","amount":1}'::jsonb, null, 1, null, 1, true, 80),
  ('reincarnation_pig_5', '転生ピッグ★5', 'ランクアップの上級素材。レベル上限で届く', 1500,
   '{"kind":"REINCARNATION_PIG","amount":1,"star":5}'::jsonb, null, 1, null, 1, true, 90),
  ('five_star_scroll', '★5召喚書', '★5モンスターを確定召喚。貯めて狙う目玉商品', 2500,
   '{"kind":"FIVE_STAR_SCROLL","amount":1}'::jsonb, null, null, 1, 1, true, 100),
  ('skill_pig_bundle', 'スキルピッグ×3', 'スキル育成をまとめて進めるシーズン商品', 2000,
   '{"kind":"SKILL_PIG","amount":3}'::jsonb, null, null, 1, 1, true, 110)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  payload = excluded.payload,
  limit_per_week = excluded.limit_per_week,
  limit_per_month = excluded.limit_per_month,
  limit_per_season = excluded.limit_per_season,
  max_per_order = excluded.max_per_order,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------
-- 防衛成功コイン。
--
-- arena_matches のINSERT時に獲得額を確定する。
-- 財布への付与は本人が次にarena_stateを開いた時にまとめて行う。
-- 攻撃側と防衛側の財布を同じ精算で順番違いにロックすると、互いに攻めた
-- 2試合でデッドロックするため、別トランザクションへ分ける。
-- ---------------------------------------------------------------------
create or replace function public.arena__award_defense_coins()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rules  jsonb;
  v_day    date;
  v_each   integer;
  v_cap    integer;
  v_before integer;
  v_award  integer;
begin
  new.defender_coins_awarded := 0;
  if new.opponent_kind <> 'PLAYER' or new.attacker_won or new.defender_id is null then
    return new;
  end if;

  v_rules := public.arena__config(
    'defense',
    '{"scale":0.5,"daily_loss_cap":60,"coin_win":4,"daily_coin_cap":40}'::jsonb
  );
  v_each := greatest(0, coalesce((v_rules ->> 'coin_win')::integer, 4));
  v_cap := greatest(0, coalesce((v_rules ->> 'daily_coin_cap')::integer, 40));
  v_day := (new.created_at at time zone 'Asia/Tokyo')::date;

  select case when s.defense_coin_date = v_day then s.defense_coins_today else 0 end
    into v_before
    from public.arena_standings s
   where s.user_id = new.defender_id and s.season_id = new.season_id
   for update;
  if not found then raise exception 'NO_OPPONENT_STANDING'; end if;

  v_award := least(v_each, greatest(0, v_cap - v_before));
  update public.arena_standings s
     set defense_coin_date = v_day,
         defense_coins_today = v_before + v_award,
         updated_at = now()
   where s.user_id = new.defender_id and s.season_id = new.season_id;

  new.defender_coins_awarded := v_award;
  return new;
end;
$$;

revoke execute on function public.arena__award_defense_coins() from public, anon, authenticated;

drop trigger if exists arena_award_defense_coins on public.arena_matches;
create trigger arena_award_defense_coins
before insert on public.arena_matches
for each row execute function public.arena__award_defense_coins();

-- 未受取の防衛報酬を本人の財布へ1度だけ移す。財布を先にロックして、
-- 同じ本人のarena_stateが並行しても受取印と残高を直列化する。
create or replace function public.arena__claim_defense_coins(p_uid uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_amount integer := 0;
begin
  perform 1 from public.arena_wallets w where w.user_id = p_uid for update;
  if not found then return 0; end if;

  with claimed as (
    update public.arena_matches m
       set defender_coins_claimed_at = now()
     where m.defender_id = p_uid
       and m.defender_coins_awarded > 0
       and m.defender_coins_claimed_at is null
    returning m.defender_coins_awarded
  )
  select coalesce(sum(c.defender_coins_awarded), 0)::integer
    into v_amount from claimed c;

  if v_amount > 0 then
    update public.arena_wallets w
       set coins = w.coins + v_amount, updated_at = now()
     where w.user_id = p_uid;
  end if;
  return v_amount;
end;
$$;

revoke execute on function public.arena__claim_defense_coins(uuid) from public, anon, authenticated;

-- 状態を返す直前に未受取防衛報酬を回収する。クライアントに新しい受取操作を
-- 増やさず、通信断で再度呼ばれてもclaimed_atにより二重付与しない。
create or replace function public.arena_state()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_season text := public.arena_current_season();
  v_out    jsonb;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  perform public.arena__refill_tickets(v_uid);
  perform public.arena__claim_defense_coins(v_uid);

  select jsonb_build_object(
    'seasonId', v_season,
    'profile', to_jsonb(p.*) - 'user_id',
    'standing', to_jsonb(s.*) - 'user_id',
    'wallet', jsonb_build_object(
      'coins', w.coins,
      'tickets', w.tickets,
      'ticketsMax', w.tickets_max,
      'ticketsRefilledAt', w.tickets_refilled_at)
  )
  into v_out
  from public.arena_profiles p
  left join public.arena_standings s on s.user_id = p.user_id and s.season_id = v_season
  left join public.arena_wallets w on w.user_id = p.user_id
  where p.user_id = v_uid;

  return coalesce(v_out, jsonb_build_object('seasonId', v_season, 'profile', null));
end;
$$;

revoke execute on function public.arena_state() from public, anon;
grant execute on function public.arena_state() to authenticated;

-- ---------------------------------------------------------------------
-- シーズン購入上限を含む購入RPC。
-- 価格・上限・残高を同じトランザクションで固定する。
-- ---------------------------------------------------------------------
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
  v_season   text := public.arena_current_season();
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
  if v_item.limit_per_season is not null then
    if v_season is null then raise exception 'NO_ACTIVE_SEASON'; end if;
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id and pu.season_key = v_season;
    if v_bought + p_quantity > v_item.limit_per_season then raise exception 'OVER_SEASON_LIMIT'; end if;
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
    (user_id, item_id, quantity, unit_price, total_price,
     week_key, month_key, season_key, payload, created_at)
  values (v_uid, p_item_id, p_quantity, v_item.price, v_total::integer,
          v_week, v_month, coalesce(v_season, ''), v_item.payload, v_now)
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
