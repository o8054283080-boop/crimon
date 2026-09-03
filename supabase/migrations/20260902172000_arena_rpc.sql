-- =====================================================================
-- 20260902172000_arena_rpc.sql — RPC(サーバが決めることを、サーバに置く)
--
-- ## この層が引き受けること
--
-- クライアントは信用できない。ブラウザに配る anon key で PostgREST を
-- 直接叩けるので、**「勝ちました」「レート+500」「コイン+10000」と
-- 言い張れる形にしない。** 送ってよいのは次の3つだけ:
--
--   ・誰と戦ったか(相手のID、またはNPCの種)
--   ・勝ったか負けたか
--   ・どの商品を何個買うか
--
-- 増減幅・報酬額・価格・上限は**すべてサーバの表**が持ち、ここで計算する。
--
-- ## security definer と search_path
--
-- ここの関数は表の所有者権限で走る(そうしないと RLS で書けない)。
-- **その代わり `set search_path = ''` を必ず付け、全部スキーマ修飾する。**
-- 付け忘れると、呼ぶ側が自分のスキーマに同名の関数や表を作って
-- 割り込ませることができ、所有者権限を奪える。
--
-- ## 名前の頭に arena__ が付くもの
--
-- 内部専用。**authenticated には execute を与えない。**
-- とくに arena__grant_coins は「コインを増やす」関数そのものなので、
-- これを誰でも呼べるようにしたら他の検査が全部無意味になる。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 内部: 設定を1つ読む。無ければ既定値
-- ---------------------------------------------------------------------
create or replace function public.arena__config(p_key text, p_fallback jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value from public.arena_config c where c.key = p_key), p_fallback);
$$;

revoke execute on function public.arena__config(text, jsonb) from public;

-- ---------------------------------------------------------------------
-- レートからランクを決める。**サーバが決める**(申告を受け取らない)
-- ---------------------------------------------------------------------
create or replace function public.arena_tier_for_rating(p_rating integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select t.id from public.arena_tiers t
      where t.min_rating <= greatest(0, p_rating)
      order by t.min_rating desc, t.sort_order desc
      limit 1),
    'BRONZE_3');
$$;

revoke execute on function public.arena_tier_for_rating(integer) from public;
grant execute on function public.arena_tier_for_rating(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 1戦ぶんのレート増減。**src/data/arena/rating.ts と同じ式。**
--
-- 差を spread で 0〜1 に潰し、同格の値と上限/下限の間を取る。
-- 段差を作らないための書き方なので、片方だけ「勝てば+15」に
-- 戻さないこと。
-- ---------------------------------------------------------------------
create or replace function public.arena_rating_delta(
  p_my integer, p_opponent integer, p_won boolean
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_diff  numeric;
  v_t     numeric;
  v_up    boolean;
  v_even  numeric;
  v_target numeric;
begin
  v_rules := public.arena__config(
    'rating',
    '{"even_win":15,"even_loss":10,"max_win":25,"min_loss":5,"min_win":8,"max_loss":15,"spread":300,"floor":0}'::jsonb);

  v_diff := p_opponent - p_my;
  v_t := least(1::numeric, abs(v_diff) / greatest(1::numeric, (v_rules ->> 'spread')::numeric));
  v_up := v_diff > 0;

  if p_won then
    v_even := (v_rules ->> 'even_win')::numeric;
    v_target := case when v_up then (v_rules ->> 'max_win')::numeric
                     else (v_rules ->> 'min_win')::numeric end;
    return round(v_even + (v_target - v_even) * v_t);
  end if;

  v_even := (v_rules ->> 'even_loss')::numeric;
  v_target := case when v_up then (v_rules ->> 'min_loss')::numeric
                   else (v_rules ->> 'max_loss')::numeric end;
  return -round(v_even + (v_target - v_even) * v_t);
end;
$$;

revoke execute on function public.arena_rating_delta(integer, integer, boolean) from public;
grant execute on function public.arena_rating_delta(integer, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 1戦で入るコイン。**クライアントは金額を送らない。**
-- ---------------------------------------------------------------------
create or replace function public.arena_match_coins(
  p_won boolean, p_my integer, p_opponent integer, p_kind text
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rules jsonb;
  v_npc   jsonb;
  v_coins numeric;
begin
  v_rules := public.arena__config('match_coins',
    '{"win_base":10,"loss_base":3,"upset_step":50,"upset_max":0}'::jsonb);
  v_npc := public.arena__config('npc',
    '{"rating_band":300,"rating_scale":1.0,"coin_scale":1.0}'::jsonb);

  if p_won then
    v_coins := (v_rules ->> 'win_base')::numeric;
    if p_opponent > p_my then
      v_coins := v_coins + least(
        (v_rules ->> 'upset_max')::numeric,
        floor((p_opponent - p_my)::numeric / greatest(1::numeric, (v_rules ->> 'upset_step')::numeric)));
    end if;
  else
    v_coins := (v_rules ->> 'loss_base')::numeric;
  end if;

  if p_kind = 'NPC' then
    v_coins := floor(v_coins * (v_npc ->> 'coin_scale')::numeric);
  end if;

  return greatest(0, v_coins)::integer;
end;
$$;

revoke execute on function public.arena_match_coins(boolean, integer, integer, text) from public;
grant execute on function public.arena_match_coins(boolean, integer, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 内部: コインを足す。**これは誰にも execute を与えない。**
-- 呼ぶのは同じファイルの他の関数だけ(security definer 同士なので通る)。
-- ---------------------------------------------------------------------
create or replace function public.arena__grant_coins(p_user uuid, p_amount integer)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_coins bigint;
begin
  if p_amount < 0 then
    raise exception 'NEGATIVE_AMOUNT';
  end if;
  update public.arena_wallets w
     set coins = w.coins + p_amount,
         lifetime_coins = w.lifetime_coins + p_amount,
         updated_at = now()
   where w.user_id = p_user
  returning w.coins into v_coins;
  if v_coins is null then
    raise exception 'NO_WALLET';
  end if;
  return v_coins;
end;
$$;

revoke execute on function public.arena__grant_coins(uuid, integer) from public;

-- 運営用。**service_role だけ。** anon key では届かない
create or replace function public.arena_grant_coins(p_user uuid, p_amount integer, p_reason text default null)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return public.arena__grant_coins(p_user, p_amount);
end;
$$;

revoke execute on function public.arena_grant_coins(uuid, integer, text) from public;
grant execute on function public.arena_grant_coins(uuid, integer, text) to service_role;

-- ---------------------------------------------------------------------
-- 内部: 挑戦権を時間で戻す。**サーバ時刻でしか進まない。**
-- 端末の時計を進めても増えない。
-- ---------------------------------------------------------------------
create or replace function public.arena__refill_tickets(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rules  jsonb;
  v_minutes numeric;
  v_wallet public.arena_wallets%rowtype;
  v_gain   integer;
begin
  v_rules := public.arena__config('tickets', '{"max":10,"refill_minutes":60,"cost_per_match":1}'::jsonb);
  v_minutes := greatest(1::numeric, (v_rules ->> 'refill_minutes')::numeric);

  select * into v_wallet from public.arena_wallets w where w.user_id = p_user for update;
  if not found then
    return;
  end if;
  if v_wallet.tickets >= v_wallet.tickets_max then
    update public.arena_wallets w
       set tickets_refilled_at = now()
     where w.user_id = p_user;
    return;
  end if;

  v_gain := floor(extract(epoch from (now() - v_wallet.tickets_refilled_at)) / (v_minutes * 60))::integer;
  if v_gain <= 0 then
    return;
  end if;

  update public.arena_wallets w
     set tickets = least(w.tickets_max, w.tickets + v_gain),
         tickets_refilled_at = w.tickets_refilled_at + make_interval(mins => (v_gain * v_minutes)::integer),
         updated_at = now()
   where w.user_id = p_user;
end;
$$;

revoke execute on function public.arena__refill_tickets(uuid) from public;

-- ---------------------------------------------------------------------
-- いま開催中のシーズン
-- ---------------------------------------------------------------------
create or replace function public.arena_current_season()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.arena_seasons s where s.status = 'ACTIVE' limit 1;
$$;

revoke execute on function public.arena_current_season() from public;
grant execute on function public.arena_current_season() to anon, authenticated;

-- ---------------------------------------------------------------------
-- プロフィールを用意する(初回・表示名の変更・シーズン切替の追随)
--
-- **user_id は auth.uid() から取る。** 引数で受け取らない
-- (受け取ると他人の行を作れる)。
-- ---------------------------------------------------------------------
create or replace function public.arena_ensure_profile(
  p_display_name text,
  p_icon_key text default 'default'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_season text := public.arena_current_season();
  v_name   text := nullif(btrim(p_display_name), '');
  v_rules  jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_name is null then
    raise exception 'INVALID_DISPLAY_NAME';
  end if;
  v_name := left(v_name, 24);
  v_rules := public.arena__config('tickets', '{"max":10,"refill_minutes":60,"cost_per_match":1}'::jsonb);

  insert into public.arena_profiles (user_id, display_name, icon_key)
  values (v_uid, v_name, coalesce(nullif(btrim(p_icon_key), ''), 'default'))
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        icon_key = excluded.icon_key,
        updated_at = now();

  insert into public.arena_wallets (user_id, tickets, tickets_max)
  values (v_uid, (v_rules ->> 'max')::integer, (v_rules ->> 'max')::integer)
  on conflict (user_id) do nothing;

  if v_season is not null then
    insert into public.arena_standings (user_id, season_id)
    values (v_uid, v_season)
    on conflict (user_id, season_id) do nothing;
  end if;

  return public.arena_state();
end;
$$;

revoke execute on function public.arena_ensure_profile(text, text) from public;
grant execute on function public.arena_ensure_profile(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 自分の状態をまとめて返す(挑戦権の回復もここで行う)
-- ---------------------------------------------------------------------
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
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  perform public.arena__refill_tickets(v_uid);

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

revoke execute on function public.arena_state() from public;
grant execute on function public.arena_state() to authenticated;

-- ---------------------------------------------------------------------
-- 防衛スナップショットを登録する
--
-- **形だけは必ず検査する。** 巨大なJSONや空の編成を置かれると、
-- 対戦候補として引いた側の画面が壊れる(相手の端末で起きる事故なので、
-- 本人には見えない)。
-- ---------------------------------------------------------------------
create or replace function public.arena_set_defense(p_snapshot jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_units   jsonb;
  v_count   integer;
  v_version integer;
  v_at      timestamptz;
  v_lead    jsonb;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_SNAPSHOT';
  end if;

  v_units := p_snapshot -> 'units';
  if v_units is null or jsonb_typeof(v_units) <> 'array' then
    raise exception 'INVALID_SNAPSHOT';
  end if;
  v_count := jsonb_array_length(v_units);
  if v_count < 1 or v_count > 4 then
    raise exception 'INVALID_UNIT_COUNT';
  end if;
  -- 1件あたりの大きさに天井を置く(装備込みでも十分に収まる)
  if pg_column_size(p_snapshot) > 262144 then
    raise exception 'SNAPSHOT_TOO_LARGE';
  end if;

  -- 数字でない version / capturedAt を送られても例外にしない。
  -- **型は必ず確かめてから cast する**('abc'::integer はここで落ちる)
  if jsonb_typeof(p_snapshot -> 'version') <> 'number' then
    raise exception 'INVALID_SNAPSHOT_VERSION';
  end if;
  v_version := (p_snapshot ->> 'version')::integer;
  if v_version < 1 then
    raise exception 'INVALID_SNAPSHOT_VERSION';
  end if;

  -- capturedAt はクライアント時刻なので、未来には置かせない
  if jsonb_typeof(p_snapshot -> 'capturedAt') = 'number' then
    v_at := least(now(), to_timestamp((p_snapshot ->> 'capturedAt')::numeric / 1000.0));
  else
    v_at := now();
  end if;
  if v_at is null or v_at < to_timestamp(0) then
    v_at := now();
  end if;

  v_lead := v_units -> 0 -> 'instance';
  if jsonb_typeof(v_lead) <> 'object' then
    v_lead := '{}'::jsonb;
  end if;

  insert into public.arena_defenses as d
    (user_id, snapshot, snapshot_version, unit_count, captured_at, updated_at)
  values
    (v_uid, p_snapshot, v_version, v_count, v_at, now())
  on conflict (user_id) do update
    set snapshot = excluded.snapshot,
        snapshot_version = excluded.snapshot_version,
        unit_count = excluded.unit_count,
        captured_at = excluded.captured_at,
        updated_at = now();

  -- 代表モンスターは**公開側**へ写す。ランキングを見せるために
  -- 防衛表を読ませずに済ませるための1手間
  update public.arena_profiles pr
     set lead_dex_id = left(v_lead ->> 'dexId', 64),
         lead_star = case when jsonb_typeof(v_lead -> 'star') = 'number'
                          then least(6, greatest(1, (v_lead ->> 'star')::integer)) end,
         updated_at = now()
   where pr.user_id = v_uid;

  return jsonb_build_object('ok', true, 'unitCount', v_count);
end;
$$;

revoke execute on function public.arena_set_defense(jsonb) from public;
grant execute on function public.arena_set_defense(jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 1戦の記録。**この関数がアリーナの心臓部。**
--
-- クライアントが送るのは「相手」と「勝敗」だけ。
--
--   ・相手が実プレイヤーなら、相手のレートは**DBの値**を使う(申告は捨てる)
--   ・NPCなら申告を受け取るが、自分のレート ±rating_band に丸める
--     (「レート9999のNPCに勝った」で格上ボーナスを作れない)
--   ・増減幅は arena_rating_delta、コインは arena_match_coins が決める
--   ・挑戦権を1つ消費する。無ければ NO_TICKET で戦績にならない
--   ・連打よけに最小間隔を見る
--   ・防衛側は増減を小さくし、1日に落ちる量に上限を置く
--
-- 攻撃側と防衛側の行は**同じ1行**。両方から引ける(0002 のポリシー)。
-- ---------------------------------------------------------------------
create or replace function public.arena_report_match(
  p_opponent_kind text,
  p_won boolean,
  p_opponent_id uuid default null,
  p_opponent_seed text default null,
  p_opponent_name text default null,
  p_opponent_rating integer default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_season    text := public.arena_current_season();
  v_me        public.arena_standings%rowtype;
  v_foe       public.arena_standings%rowtype;
  v_wallet    public.arena_wallets%rowtype;
  v_ticket    jsonb;
  v_limit     jsonb;
  v_npc       jsonb;
  v_defense   jsonb;
  v_cost      integer;
  v_opp_rating integer;
  v_delta     integer;
  v_new       integer;
  v_coins     integer;
  v_balance   bigint;
  v_def_delta integer;
  v_def_new   integer;
  v_def_cap   integer;
  v_def_room  integer;
  v_match_id  uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_season is null then
    raise exception 'NO_ACTIVE_SEASON';
  end if;
  if p_opponent_kind not in ('PLAYER', 'NPC') then
    raise exception 'INVALID_OPPONENT_KIND';
  end if;
  if p_opponent_kind = 'PLAYER' and p_opponent_id is null then
    raise exception 'MISSING_OPPONENT';
  end if;
  if p_opponent_id = v_uid then
    raise exception 'SELF_MATCH';
  end if;

  v_ticket := public.arena__config('tickets', '{"max":10,"refill_minutes":60,"cost_per_match":1}'::jsonb);
  v_limit  := public.arena__config('match_limit', '{"min_seconds":3}'::jsonb);
  v_npc    := public.arena__config('npc', '{"rating_band":300,"rating_scale":1.0,"coin_scale":1.0}'::jsonb);
  v_defense := public.arena__config('defense', '{"scale":0.5,"daily_loss_cap":60}'::jsonb);
  v_cost := greatest(0, (v_ticket ->> 'cost_per_match')::integer);

  -- 2人ぶんの行を user_id 順に1文で押さえる。
  -- 別々に押さえると、同時に殴り合った2人でデッドロックになる
  perform 1 from public.arena_standings s
   where s.season_id = v_season
     and s.user_id in (v_uid, p_opponent_id)
   order by s.user_id
     for update;

  select * into v_me from public.arena_standings s
   where s.user_id = v_uid and s.season_id = v_season;
  if not found then
    raise exception 'NO_STANDING';
  end if;

  if v_me.last_match_at is not null
     and v_me.last_match_at > now() - make_interval(secs => greatest(0, (v_limit ->> 'min_seconds')::numeric)) then
    raise exception 'TOO_FAST';
  end if;

  perform public.arena__refill_tickets(v_uid);
  select * into v_wallet from public.arena_wallets w where w.user_id = v_uid for update;
  if not found then
    raise exception 'NO_WALLET';
  end if;
  if v_wallet.tickets < v_cost then
    raise exception 'NO_TICKET';
  end if;

  -- 相手のレート。**実プレイヤーは申告を使わない**
  if p_opponent_kind = 'PLAYER' then
    select * into v_foe from public.arena_standings s
     where s.user_id = p_opponent_id and s.season_id = v_season;
    if not found then
      raise exception 'NO_OPPONENT_STANDING';
    end if;
    v_opp_rating := v_foe.rating;
  else
    v_opp_rating := greatest(
      greatest(0, v_me.rating - (v_npc ->> 'rating_band')::integer),
      least(v_me.rating + (v_npc ->> 'rating_band')::integer,
            coalesce(p_opponent_rating, v_me.rating)));
  end if;

  v_delta := public.arena_rating_delta(v_me.rating, v_opp_rating, p_won);
  if p_opponent_kind = 'NPC' then
    v_delta := round(v_delta * (v_npc ->> 'rating_scale')::numeric);
  end if;
  v_new := greatest(0, v_me.rating + v_delta);
  v_delta := v_new - v_me.rating;

  v_coins := public.arena_match_coins(p_won, v_me.rating, v_opp_rating, p_opponent_kind);

  update public.arena_wallets w
     set tickets = w.tickets - v_cost, updated_at = now()
   where w.user_id = v_uid;

  update public.arena_standings s
     set rating = v_new,
         best_rating = greatest(s.best_rating, v_new),
         tier_id = public.arena_tier_for_rating(v_new),
         wins = s.wins + case when p_won then 1 else 0 end,
         losses = s.losses + case when p_won then 0 else 1 end,
         last_match_at = now(),
         updated_at = now()
   where s.user_id = v_uid and s.season_id = v_season;

  v_balance := public.arena__grant_coins(v_uid, v_coins);

  -- 防衛側。**寝ている間に溶けないように、幅を半分にして1日の上限を置く**
  if p_opponent_kind = 'PLAYER' then
    v_def_delta := public.arena_rating_delta(v_foe.rating, v_me.rating, not p_won);
    if v_def_delta <> 0 then
      v_def_delta := sign(v_def_delta)::integer
        * greatest(1, round(abs(v_def_delta) * (v_defense ->> 'scale')::numeric))::integer;
    end if;

    if v_foe.defense_loss_date <> current_date then
      v_foe.defense_loss_today := 0;
    end if;
    v_def_cap := greatest(0, (v_defense ->> 'daily_loss_cap')::integer);
    if v_def_delta < 0 then
      v_def_room := greatest(0, v_def_cap - v_foe.defense_loss_today);
      v_def_delta := -least(abs(v_def_delta), v_def_room);
    end if;

    v_def_new := greatest(0, v_foe.rating + v_def_delta);
    v_def_delta := v_def_new - v_foe.rating;

    update public.arena_standings s
       set rating = v_def_new,
           best_rating = greatest(s.best_rating, v_def_new),
           tier_id = public.arena_tier_for_rating(v_def_new),
           defense_wins = s.defense_wins + case when p_won then 0 else 1 end,
           defense_losses = s.defense_losses + case when p_won then 1 else 0 end,
           defense_loss_date = current_date,
           defense_loss_today = case when v_foe.defense_loss_date <> current_date then 0
                                     else s.defense_loss_today end
                                + greatest(0, -v_def_delta),
           updated_at = now()
     where s.user_id = p_opponent_id and s.season_id = v_season;
  end if;

  insert into public.arena_matches (
    season_id, attacker_id, defender_id, opponent_kind, npc_seed, npc_name,
    attacker_won, attacker_rating_before, attacker_rating_delta, attacker_rating_after,
    defender_rating_before, defender_rating_delta, defender_rating_after, coins_awarded)
  values (
    v_season, v_uid,
    case when p_opponent_kind = 'PLAYER' then p_opponent_id else null end,
    p_opponent_kind,
    case when p_opponent_kind = 'NPC' then left(p_opponent_seed, 64) else null end,
    case when p_opponent_kind = 'NPC' then left(p_opponent_name, 24) else null end,
    p_won, v_me.rating, v_delta, v_new,
    case when p_opponent_kind = 'PLAYER' then v_foe.rating else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_delta else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_new else null end,
    v_coins)
  returning id into v_match_id;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'ratingBefore', v_me.rating,
    'ratingDelta', v_delta,
    'rating', v_new,
    'tierId', public.arena_tier_for_rating(v_new),
    'coins', v_coins,
    'coinBalance', v_balance,
    'tickets', v_wallet.tickets - v_cost,
    'opponentRating', v_opp_rating);
end;
$$;

revoke execute on function public.arena_report_match(text, boolean, uuid, text, text, integer) from public;
grant execute on function public.arena_report_match(text, boolean, uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 週間報酬。**二重受取は UNIQUE が止める。**
--
-- 週の区切りも金額も、どちらもサーバが決める。
-- クライアントは「受け取ります」としか言えない。
-- ---------------------------------------------------------------------
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
  v_period  text;
  v_coins   integer;
  v_claim   uuid;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_season is null then
    raise exception 'NO_ACTIVE_SEASON';
  end if;

  select s.tier_id into v_tier from public.arena_standings s
   where s.user_id = v_uid and s.season_id = v_season;
  if v_tier is null then
    raise exception 'NO_STANDING';
  end if;

  -- ISO週。端末の時計は見ない
  v_period := to_char(now() at time zone 'utc', 'IYYY-"W"IW');

  select r.coins into v_coins from public.arena_reward_rules r
   where r.kind = 'WEEKLY' and r.tier_id = v_tier;
  if v_coins is null then
    raise exception 'NO_REWARD_RULE';
  end if;

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

-- ---------------------------------------------------------------------
-- シーズン報酬。**締めた後の順位表からしか出ない。**
-- ---------------------------------------------------------------------
create or replace function public.arena_claim_season_reward(p_season_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_status  text;
  v_tier    text;
  v_coins   integer;
  v_claim   uuid;
  v_balance bigint;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select s.status into v_status from public.arena_seasons s where s.id = p_season_id;
  if v_status is null then
    raise exception 'NO_SEASON';
  end if;
  if v_status <> 'CLOSED' then
    raise exception 'SEASON_NOT_CLOSED';
  end if;

  select r.final_tier_id into v_tier from public.arena_season_results r
   where r.season_id = p_season_id and r.user_id = v_uid;
  if v_tier is null then
    raise exception 'NO_SEASON_RESULT';
  end if;

  select r.coins into v_coins from public.arena_reward_rules r
   where r.kind = 'SEASON' and r.tier_id = v_tier;
  if v_coins is null then
    raise exception 'NO_REWARD_RULE';
  end if;

  insert into public.arena_reward_claims (user_id, kind, period_key, tier_id, coins)
  values (v_uid, 'SEASON', p_season_id, v_tier, v_coins)
  on conflict on constraint arena_reward_claims_once do nothing
  returning id into v_claim;

  if v_claim is null then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'periodKey', p_season_id);
  end if;

  v_balance := public.arena__grant_coins(v_uid, v_coins);
  return jsonb_build_object('ok', true, 'periodKey', p_season_id, 'tierId', v_tier,
                            'coins', v_coins, 'coinBalance', v_balance);
end;
$$;

revoke execute on function public.arena_claim_season_reward(text) from public;
grant execute on function public.arena_claim_season_reward(text) to authenticated;

-- ---------------------------------------------------------------------
-- ショップ購入
--
-- **価格・在庫・上限・残高、この4つを全部サーバで見る。**
-- クライアントが送るのは商品IDと個数だけ。1つのトランザクションの中で
-- 「引いてから渡す」ので、途中で落ちても片方だけ進むことはない。
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
  v_uid    uuid := auth.uid();
  v_item   public.arena_shop_items%rowtype;
  v_wallet public.arena_wallets%rowtype;
  v_week   text := to_char(now() at time zone 'utc', 'IYYY-"W"IW');
  v_month  text := to_char(now() at time zone 'utc', 'YYYY-MM');
  v_total  bigint;
  v_bought integer;
  v_purchase uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'INVALID_QUANTITY';
  end if;

  select * into v_item from public.arena_shop_items i where i.id = p_item_id for update;
  if not found then
    raise exception 'NO_ITEM';
  end if;
  if not v_item.active then
    raise exception 'ITEM_INACTIVE';
  end if;
  if v_item.starts_at is not null and v_item.starts_at > now() then
    raise exception 'ITEM_NOT_STARTED';
  end if;
  if v_item.ends_at is not null and v_item.ends_at <= now() then
    raise exception 'ITEM_ENDED';
  end if;
  if p_quantity > v_item.max_per_order then
    raise exception 'OVER_ORDER_LIMIT';
  end if;
  if v_item.stock is not null and v_item.stock < p_quantity then
    raise exception 'OUT_OF_STOCK';
  end if;

  -- 週の上限
  if v_item.limit_per_week is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id and pu.week_key = v_week;
    if v_bought + p_quantity > v_item.limit_per_week then
      raise exception 'OVER_WEEKLY_LIMIT';
    end if;
  end if;

  -- 月の上限
  if v_item.limit_per_month is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id and pu.month_key = v_month;
    if v_bought + p_quantity > v_item.limit_per_month then
      raise exception 'OVER_MONTHLY_LIMIT';
    end if;
  end if;

  -- 通算の上限
  if v_item.limit_total is not null then
    select coalesce(sum(pu.quantity), 0) into v_bought
      from public.arena_shop_purchases pu
     where pu.user_id = v_uid and pu.item_id = p_item_id;
    if v_bought + p_quantity > v_item.limit_total then
      raise exception 'OVER_TOTAL_LIMIT';
    end if;
  end if;

  v_total := v_item.price::bigint * p_quantity;

  select * into v_wallet from public.arena_wallets w where w.user_id = v_uid for update;
  if not found then
    raise exception 'NO_WALLET';
  end if;
  if v_wallet.coins < v_total then
    raise exception 'NOT_ENOUGH_COINS';
  end if;

  -- 先に引く
  update public.arena_wallets w
     set coins = w.coins - v_total, updated_at = now()
   where w.user_id = v_uid;

  if v_item.stock is not null then
    update public.arena_shop_items i
       set stock = i.stock - p_quantity, updated_at = now()
     where i.id = p_item_id;
  end if;

  insert into public.arena_shop_purchases
    (user_id, item_id, quantity, unit_price, total_price, week_key, month_key, payload)
  values (v_uid, p_item_id, p_quantity, v_item.price, v_total::integer, v_week, v_month, v_item.payload)
  returning id into v_purchase;

  return jsonb_build_object(
    'ok', true,
    'purchaseId', v_purchase,
    'itemId', p_item_id,
    'quantity', p_quantity,
    'totalPrice', v_total,
    'coinBalance', v_wallet.coins - v_total,
    'payload', v_item.payload);
end;
$$;

revoke execute on function public.arena_purchase_shop_item(text, integer) from public;
grant execute on function public.arena_purchase_shop_item(text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- ランキング(自分の周り)。**読むだけ**なので security invoker のまま。
-- 見えるものは 0002 のポリシーが決める。
-- ---------------------------------------------------------------------
create or replace function public.arena_ranking_around(
  p_user uuid default null,
  p_span integer default 5
)
returns table (
  rank integer, user_id uuid, display_name text, icon_key text,
  rating integer, tier_id text, wins integer, losses integer,
  lead_dex_id text, lead_star integer
)
language sql
stable
set search_path = ''
as $$
  with board as (
    select r.rank::integer as rank, r.user_id, r.display_name, r.icon_key,
           r.rating, r.tier_id, r.wins, r.losses,
           r.lead_dex_id, r.lead_star
      from public.arena_public_ranking r
  ), me as (
    select b.rank as my_rank from board b where b.user_id = coalesce(p_user, auth.uid())
  )
  select b.* from board b, me
   where b.rank between me.my_rank - greatest(0, p_span) and me.my_rank + greatest(0, p_span)
   order by b.rank;
$$;

revoke execute on function public.arena_ranking_around(uuid, integer) from public;
grant execute on function public.arena_ranking_around(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- シーズンを締める。**運営用(service_role だけ)。**
--
--   1. その時点の順位を arena_season_results へ焼く
--   2. シーズンを CLOSED にする
--   3. 次のシーズンを作り、レートをソフトリセットして持ち越す
--
-- ソフトリセットは new = base + round((rating - base) * factor)。
-- **全員を base に戻さない。** 戻すと、上まで登った意味が消える。
-- ---------------------------------------------------------------------
create or replace function public.arena_close_season(
  p_season_id text,
  p_next_season_id text default null,
  p_next_name text default null,
  p_next_starts_at timestamptz default null,
  p_next_ends_at timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season public.arena_seasons%rowtype;
  v_ranked integer := 0;
  v_moved  integer := 0;
begin
  select * into v_season from public.arena_seasons s where s.id = p_season_id for update;
  if not found then
    raise exception 'NO_SEASON';
  end if;
  if v_season.status = 'CLOSED' then
    raise exception 'ALREADY_CLOSED';
  end if;

  insert into public.arena_season_results
    (season_id, user_id, final_rating, final_tier_id, final_rank, wins, losses)
  select s.season_id, s.user_id, s.rating, s.tier_id,
         rank() over (order by s.rating desc, s.updated_at asc)::integer,
         s.wins, s.losses
    from public.arena_standings s
   where s.season_id = p_season_id
  on conflict (season_id, user_id) do nothing;
  get diagnostics v_ranked = row_count;

  update public.arena_seasons s
     set status = 'CLOSED', closed_at = now()
   where s.id = p_season_id;

  if p_next_season_id is not null then
    insert into public.arena_seasons (id, name, starts_at, ends_at, status,
                                      soft_reset_base, soft_reset_factor)
    values (p_next_season_id,
            coalesce(p_next_name, p_next_season_id),
            coalesce(p_next_starts_at, now()),
            coalesce(p_next_ends_at, now() + make_interval(days => 28)),
            'ACTIVE',
            v_season.soft_reset_base, v_season.soft_reset_factor)
    on conflict (id) do update set status = 'ACTIVE';

    insert into public.arena_standings (user_id, season_id, rating, best_rating, tier_id)
    select s.user_id, p_next_season_id,
           v_reset.rating, v_reset.rating,
           public.arena_tier_for_rating(v_reset.rating)
      from public.arena_standings s
      cross join lateral (
        select greatest(0, (v_season.soft_reset_base
                 + round((s.rating - v_season.soft_reset_base) * v_season.soft_reset_factor))::integer) as rating
      ) as v_reset
     where s.season_id = p_season_id
    on conflict (user_id, season_id) do nothing;
    get diagnostics v_moved = row_count;
  end if;

  return jsonb_build_object('ok', true, 'seasonId', p_season_id,
                            'ranked', v_ranked, 'carriedOver', v_moved,
                            'nextSeasonId', p_next_season_id);
end;
$$;

revoke execute on function public.arena_close_season(text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.arena_close_season(text, text, text, timestamptz, timestamptz) to service_role;
