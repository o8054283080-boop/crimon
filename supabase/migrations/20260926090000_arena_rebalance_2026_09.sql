-- =====================================================================
-- アリーナ改修(2026-09)。**冪等。既存の行を消さない・作り直さない。**
--
-- 目的
--   1. 日課の負担を減らす      … 挑戦券 最大10→5、回復 60分→120分(戦闘回数 約半分)
--   2. コインの取得量は落とさない … 1戦のコイン 勝ち10→20・負け3→6、防衛成功 4→8(1日の上限40は据え置き)
--   3. レートのインフレを抑える   … 格下に勝った時の増加を小さく(差400以上で+1)
--   5. ジャイアントキリング       … 格上に勝つほど大きく(差1500で最大+250)
--   8. 防衛側の減少は切り離す     … 防衛は今までどおり v1 の半分・1日60まで。500以上格上に破られたら−1
--
-- 触らないもの
--   - user_id・プロフィール・順位(rating / best_rating / 勝敗)・財布の coins・防衛編成・戦績
--   - 挑戦券の枚数そのもの(5枚を超えて持っている人も**切り捨てない**)
--   - 候補表(arena_opponent_pool)・ランキング・シーズン・ショップ
--
-- 画面側の同じ式: src/data/arena/rating.ts(整数だけで計算し、四捨五入も同じ形)
-- 検証: tests/arenaRebalance.test.ts / tools/arenaRebalanceSim.ts
--
-- ## 本番で効いていた式について
--
-- `20260912120000_arena_rating_gap_rebalance.sql`(v2)は**本番に一度も流れていなかった**。
-- 本番の arena_rating_delta は `arena_rpc.sql` の v1、防衛の倍率は 0.5 のまま。
-- ここでは v1 を `arena__rating_delta_v1` として残し(攻撃側の格下負け・防衛側・連勝の上限に使う)、
-- 攻撃側の勝ちと格上負けだけを新しい式にする。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. v1(本番でずっと効いていた式)。整数で書き直したが結果は同じ
--    勝ち: 互角+15 → 格上(差300以上)+25 / 格下+8。負け: 互角−10 → 格上に−5 / 格下に−15
-- ---------------------------------------------------------------------
create or replace function public.arena__rating_delta_v1(
  p_my integer, p_opponent integer, p_won boolean
)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_diff   integer := p_opponent - p_my;
  v_t      integer := least(300, abs(p_opponent - p_my));
  v_target integer;
  v_num    integer;
begin
  if p_won then
    v_target := case when v_diff > 0 then 25 else 8 end;
    v_num := 15 * 300 + (v_target - 15) * v_t;
    return (v_num * 2 + 300) / 600;
  end if;
  v_target := case when v_diff > 0 then 5 else 15 end;
  v_num := 10 * 300 + (v_target - 10) * v_t;
  return -((v_num * 2 + 300) / 600);
end;
$$;
revoke execute on function public.arena__rating_delta_v1(integer, integer, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. 攻撃側が勝った時の増加。diff = 相手 − 自分。**連続した1本の式**
--      diff ≤ −400      … +1
--      −400 < diff < 0  … 10 × ((400 + diff) / 400)²
--      0 ≤ diff ≤ 300   … 10 + diff/10 + diff²/9000
--      300 < diff       … diff / 6、最大 +250(差1500)
-- ---------------------------------------------------------------------
create or replace function public.arena__attack_win_gain(p_diff integer)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_x bigint;
begin
  if p_diff <= -400 then
    return 1;
  end if;
  if p_diff < 0 then
    v_x := 400 + p_diff;
    return greatest(1, ((10 * v_x * v_x) * 2 + 160000) / 320000)::integer;
  end if;
  if p_diff <= 300 then
    return ((p_diff::bigint * p_diff + 900 * p_diff + 90000) * 2 + 9000) / 18000;
  end if;
  return least(250, (p_diff * 2 + 6) / 12);
end;
$$;
revoke execute on function public.arena__attack_win_gain(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. 攻撃側が負けた時の減少(正の数)。
--    格下に負けた: v1 のまま(互角10 → 差300以上で15)
--    格上に負けた: 実力どおりの人の期待値がほぼ0になる量。互角の10は超えない
--                  (0〜250で10、300で9、400で7、500で5、600で3、750で2、900以上で1)
-- ---------------------------------------------------------------------
create or replace function public.arena__attack_loss_amount(p_diff integer)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_d0 integer;
  v_v0 integer;
  v_d1 integer;
  v_v1 integer;
  v_span integer;
begin
  if p_diff < 0 then
    return -public.arena__rating_delta_v1(0, p_diff, false);
  end if;
  if p_diff >= 900 then
    return 1;
  end if;
  select t.d, t.v into v_d0, v_v0
    from (values (0,10),(250,10),(300,9),(400,7),(500,5),(600,3),(750,2),(900,1)) as t(d, v)
   where t.d <= p_diff order by t.d desc limit 1;
  select t.d, t.v into v_d1, v_v1
    from (values (0,10),(250,10),(300,9),(400,7),(500,5),(600,3),(750,2),(900,1)) as t(d, v)
   where t.d >= p_diff order by t.d asc limit 1;
  if v_d0 = v_d1 then
    return v_v0;
  end if;
  v_span := v_d1 - v_d0;
  return ((v_v0 * v_span + (v_v1 - v_v0) * (p_diff - v_d0)) * 2 + v_span) / (v_span * 2);
end;
$$;
revoke execute on function public.arena__attack_loss_amount(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. 攻撃側の1戦ぶん。**名前も引数も grant も今までと同じ**(外から呼ぶ入口を変えない)
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
begin
  if p_won then
    return public.arena__attack_win_gain(p_opponent - p_my);
  end if;
  return -public.arena__attack_loss_amount(p_opponent - p_my);
end;
$$;
revoke execute on function public.arena_rating_delta(integer, integer, boolean) from public;
grant execute on function public.arena_rating_delta(integer, integer, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. 1戦の記録。`20260902172200_arena_match_integrity.sql` の本体に、次の3点だけを足した
--    (本番の定義がこのファイルと同じことは 2026-09-25 に読み取りで確かめた)
--
--    a. 同じ実プレイヤーに20時間以内に勝っていたら、増加は「半分(切り捨て)かつ v1 が上限」
--    b. 防衛側は v1 の半分(新しい格上ボーナスは使わない)。500以上格上に破られたら −1
--    c. 攻撃側の勝ちと格上負けは新しい式(arena_rating_delta)
-- ---------------------------------------------------------------------
create or replace function public.arena__record_match(
  p_attacker uuid,
  p_opponent_kind text,
  p_defender uuid,
  p_npc_seed text,
  p_npc_name text,
  p_opponent_rating integer,
  p_attacker_won boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_season    text := public.arena_current_season();
  v_me        public.arena_standings%rowtype;
  v_foe       public.arena_standings%rowtype;
  v_npc       jsonb;
  v_defense   jsonb;
  v_delta     integer;
  v_new       integer;
  v_coins     integer;
  v_balance   bigint;
  v_def_delta integer;
  v_def_new   integer;
  v_def_cap   integer;
  v_def_room  integer;
  v_match_id  uuid;
  v_tickets   integer;
  v_repeat    boolean := false;
begin
  if v_season is null then
    raise exception 'NO_ACTIVE_SEASON';
  end if;

  v_npc     := public.arena__config('npc', '{"rating_band":300,"rating_scale":1.0,"coin_scale":1.0}'::jsonb);
  v_defense := public.arena__config('defense', '{"scale":0.5,"daily_loss_cap":60,"coin_win":8,"daily_coin_cap":40}'::jsonb);

  -- 2人ぶんの行を user_id 順に1文で押さえる。
  -- 別々に押さえると、同時に殴り合った2人でデッドロックになる
  perform 1 from public.arena_standings s
   where s.season_id = v_season
     and s.user_id in (p_attacker, p_defender)
   order by s.user_id
     for update;

  select * into v_me from public.arena_standings s
   where s.user_id = p_attacker and s.season_id = v_season;
  if not found then
    raise exception 'NO_STANDING';
  end if;

  if p_opponent_kind = 'PLAYER' then
    select * into v_foe from public.arena_standings s
     where s.user_id = p_defender and s.season_id = v_season;
    if not found then
      raise exception 'NO_OPPONENT_STANDING';
    end if;
  end if;

  -- a. 同じ相手への連勝。**この対戦の行はまだ入っていない**ので、前の勝ちだけが数に入る
  if p_opponent_kind = 'PLAYER' and p_attacker_won then
    select exists (
      select 1 from public.arena_matches m
       where m.attacker_id = p_attacker
         and m.defender_id = p_defender
         and m.attacker_won
         and m.created_at > now() - interval '20 hours'
    ) into v_repeat;
  end if;

  v_delta := public.arena_rating_delta(v_me.rating, p_opponent_rating, p_attacker_won);
  if v_repeat then
    v_delta := least(v_delta / 2, public.arena__rating_delta_v1(v_me.rating, p_opponent_rating, true));
  end if;
  if p_opponent_kind = 'NPC' then
    v_delta := round(v_delta * (v_npc ->> 'rating_scale')::numeric);
  end if;
  v_new := greatest(0, v_me.rating + v_delta);
  v_delta := v_new - v_me.rating;

  v_coins := public.arena_match_coins(p_attacker_won, v_me.rating, p_opponent_rating, p_opponent_kind);

  update public.arena_standings s
     set rating = v_new,
         best_rating = greatest(s.best_rating, v_new),
         tier_id = public.arena_tier_for_rating(v_new),
         wins = s.wins + case when p_attacker_won then 1 else 0 end,
         losses = s.losses + case when p_attacker_won then 0 else 1 end,
         last_match_at = now(),
         updated_at = now()
   where s.user_id = p_attacker and s.season_id = v_season;

  v_balance := public.arena__grant_coins(p_attacker, v_coins);

  -- b. 防衛側。**攻撃側のボーナスとは切り離す**(v1 の半分・1日の上限あり)
  if p_opponent_kind = 'PLAYER' then
    if p_attacker_won and v_me.rating - v_foe.rating >= 500 then
      -- 大幅に格上の相手に破られた。狩られる側を削らない
      v_def_delta := -1;
    else
      v_def_delta := public.arena__rating_delta_v1(v_foe.rating, v_me.rating, not p_attacker_won);
      if v_def_delta <> 0 then
        v_def_delta := sign(v_def_delta)::integer
          * greatest(1, round(abs(v_def_delta) * (v_defense ->> 'scale')::numeric))::integer;
      end if;
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
           defense_wins = s.defense_wins + case when p_attacker_won then 0 else 1 end,
           defense_losses = s.defense_losses + case when p_attacker_won then 1 else 0 end,
           defense_loss_date = current_date,
           defense_loss_today = case when v_foe.defense_loss_date <> current_date then 0
                                     else s.defense_loss_today end
                                + greatest(0, -v_def_delta),
           updated_at = now()
     where s.user_id = p_defender and s.season_id = v_season;
  end if;

  insert into public.arena_matches (
    season_id, attacker_id, defender_id, opponent_kind, npc_seed, npc_name,
    attacker_won, attacker_rating_before, attacker_rating_delta, attacker_rating_after,
    defender_rating_before, defender_rating_delta, defender_rating_after, coins_awarded)
  values (
    v_season, p_attacker,
    case when p_opponent_kind = 'PLAYER' then p_defender else null end,
    p_opponent_kind,
    case when p_opponent_kind = 'NPC' then left(p_npc_seed, 64) else null end,
    case when p_opponent_kind = 'NPC' then left(p_npc_name, 24) else null end,
    p_attacker_won, v_me.rating, v_delta, v_new,
    case when p_opponent_kind = 'PLAYER' then v_foe.rating else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_delta else null end,
    case when p_opponent_kind = 'PLAYER' then v_def_new else null end,
    v_coins)
  returning id into v_match_id;

  select w.tickets into v_tickets from public.arena_wallets w where w.user_id = p_attacker;

  return jsonb_build_object(
    'ok', true,
    'matchId', v_match_id,
    'won', p_attacker_won,
    'ratingBefore', v_me.rating,
    'ratingDelta', v_delta,
    'rating', v_new,
    'tierId', public.arena_tier_for_rating(v_new),
    'coins', v_coins,
    'coinBalance', v_balance,
    'tickets', coalesce(v_tickets, 0),
    'opponentRating', p_opponent_rating);
end;
$$;
revoke execute on function public.arena__record_match(uuid, text, uuid, text, text, integer, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. 挑戦券の自然回復。**上限は「財布の上限」と「設定の上限」の小さい方**
--
--    5枚を超えて持っている人(財布の上限はまだ10)は、その枚数のまま使える。
--    5枚以下になった時に、財布の上限を5へ下げる(表の制約 tickets <= tickets_max を守る順番)。
--    **枚数は1枚も減らさない。**
-- ---------------------------------------------------------------------
create or replace function public.arena__refill_tickets(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rules   jsonb;
  v_minutes numeric;
  v_max     integer;
  v_cap     integer;
  v_wallet  public.arena_wallets%rowtype;
  v_gain    integer;
begin
  v_rules := public.arena__config('tickets', '{"max":5,"refill_minutes":120,"cost_per_match":1}'::jsonb);
  v_minutes := greatest(1::numeric, (v_rules ->> 'refill_minutes')::numeric);
  v_max := greatest(1, (v_rules ->> 'max')::integer);

  select * into v_wallet from public.arena_wallets w where w.user_id = p_user for update;
  if not found then
    return;
  end if;

  -- 上限の引き下げ。枚数が新しい上限以下になってから(制約を破らない)
  if v_wallet.tickets_max > v_max and v_wallet.tickets <= v_max then
    update public.arena_wallets w
       set tickets_max = v_max, updated_at = now()
     where w.user_id = p_user;
    v_wallet.tickets_max := v_max;
  end if;
  v_cap := least(v_wallet.tickets_max, v_max);

  if v_wallet.tickets >= v_cap then
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
     set tickets = least(v_cap, w.tickets + v_gain),
         tickets_refilled_at = w.tickets_refilled_at + make_interval(mins => (v_gain * v_minutes)::integer),
         updated_at = now()
   where w.user_id = p_user;
end;
$$;
revoke execute on function public.arena__refill_tickets(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. ダイヤでの全回復。**同じ上限(財布と設定の小さい方)まで。**
--    5枚以上持っている人は「満タン」として断る(持っている枚数は減らさない)
-- ---------------------------------------------------------------------
create or replace function public.arena_refill_tickets_paid()
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_wallet public.arena_wallets%rowtype;
  v_rules jsonb;
  v_cap integer;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  perform public.arena__refill_tickets(v_uid);
  select * into v_wallet from public.arena_wallets w where w.user_id=v_uid for update;
  if not found then raise exception 'NO_WALLET'; end if;
  v_rules := public.arena__config('tickets', '{"max":5,"refill_minutes":120,"cost_per_match":1}'::jsonb);
  v_cap := least(v_wallet.tickets_max, greatest(1, (v_rules ->> 'max')::integer));
  if v_wallet.tickets >= v_cap then
    return jsonb_build_object('ok',false,'code','TICKETS_FULL','tickets',v_wallet.tickets,'ticketsMax',v_cap);
  end if;
  update public.arena_wallets w
     set tickets=v_cap, tickets_refilled_at=now(), updated_at=now()
   where w.user_id=v_uid
   returning * into v_wallet;
  return jsonb_build_object('ok',true,'tickets',v_wallet.tickets,'ticketsMax',v_cap);
end;
$$;
revoke execute on function public.arena_refill_tickets_paid() from public, anon;
grant execute on function public.arena_refill_tickets_paid() to authenticated;

-- ---------------------------------------------------------------------
-- 8. 設定値。**既存のキーを残したまま上書きする**(defense は必要なキーだけ差し替える)
-- ---------------------------------------------------------------------
insert into public.arena_config (key, value, note) values
  ('tickets',
   '{"max":5,"refill_minutes":120,"cost_per_match":1}'::jsonb,
   '挑戦券。ARENA_TICKET_MAX / ARENA_TICKET_REGEN_MINUTES と同じ値にすること(2026-09: 10枚/60分 → 5枚/120分)'),
  ('match_coins',
   '{"win_base":20,"loss_base":6,"upset_step":50,"upset_max":0}'::jsonb,
   '1戦で入るアリーナコイン。ARENA_COIN_WIN / ARENA_COIN_LOSS と同じ値にすること(2026-09: 10/3 → 20/6)')
on conflict (key) do update
  set value = excluded.value, note = excluded.note, updated_at = now();

insert into public.arena_config (key, value, note) values
  ('defense',
   '{"scale":0.5,"daily_loss_cap":60,"coin_win":8,"daily_coin_cap":40}'::jsonb,
   '防衛レート倍率(v1の半分)・日次損失上限・防衛成功コイン・日次コイン上限(2026-09: 防衛成功 4 → 8)')
on conflict (key) do update
  set value = public.arena_config.value || '{"coin_win":8}'::jsonb,
      note = excluded.note,
      updated_at = now();

-- ---------------------------------------------------------------------
-- 9. 財布の上限を下げる。**枚数は触らない。**
--    5枚以下の人だけ上限を5へ。5枚を超えて持っている人は、使って5枚以下になった時に
--    自然回復の関数が下げる(それまで持っている分はそのまま使える)。
-- ---------------------------------------------------------------------
update public.arena_wallets w
   set tickets_max = 5, updated_at = now()
 where w.tickets_max > 5
   and w.tickets <= 5;
