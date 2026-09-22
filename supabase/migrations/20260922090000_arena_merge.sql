-- =====================================================================
-- 分かれてしまったアリーナアカウントを、1つに合わせる
--
-- ## なぜ要るのか
--
-- アリーナの身元は端末の localStorage にしかないので、機種を変えたり
-- サイトデータが消えたりすると**新しい匿名ユーザが生まれる。**
-- 名前はセーブから来るので、ランキングに**同じ名前で2人**並ぶ
-- (荒モンボス猿さん: レート2535/99勝6敗 と レート1180/10勝0敗)。
--
-- 以後は `crimon_recovery_accounts.arena_user_id` で気づけるようにしたが、
-- **既に分かれてしまったぶんは、こちらで合わせるしかない。**
--
-- ## 取り返しがつくようにする
--
-- 本番のデータを動かすので、**実行前の姿を丸ごと控えてから**触る
-- (`crimon_arena_merge_log.before_snapshot`)。間違えたら戻せる。
--
-- `p_dry_run` が true なら**何も書かずに、こうなるという予測だけ**返す。
-- 押す前に必ず見る。
--
-- ## 1つでも表を漏らすと、成績が置き去りになる
--
-- `public.arena_profiles.user_id` は**9つの表から CASCADE で参照されている。**
-- 親を消すと子が道連れになるので、**子を全部移してから**親を消す。
-- 表の一覧は `docs/handoff.md` にある(本番から取得したもの)。
--
-- **冪等。**何度流しても同じ結果になる。
-- =====================================================================

create table if not exists public.crimon_arena_merge_log (
  id              uuid        primary key default gen_random_uuid(),
  from_user_id    uuid        not null,
  to_user_id      uuid        not null,
  -- **実行前の姿。**戻す時はこれだけが頼りなので、必ず全部入れる
  before_snapshot jsonb       not null,
  summary         jsonb       not null,
  created_at      timestamptz not null default now()
);

alter table public.crimon_arena_merge_log enable row level security;
revoke all on public.crimon_arena_merge_log from anon, authenticated;

comment on table public.crimon_arena_merge_log is
  'アリーナアカウントを合わせた記録。before_snapshot は実行前の姿(戻す時の頼り)';

-- ---------------------------------------------------------------------
-- 実行前の姿を固める。**合わせる前にも、戻す時にも使う**
-- ---------------------------------------------------------------------
create or replace function public.crimon_arena_account_snapshot(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id',        p_user_id,
    'profile',        (select to_jsonb(r) from public.arena_profiles r where r.user_id = p_user_id),
    'standings',      coalesce((select jsonb_agg(to_jsonb(r)) from public.arena_standings r where r.user_id = p_user_id), '[]'::jsonb),
    'wallet',         (select to_jsonb(r) from public.arena_wallets r where r.user_id = p_user_id),
    'tower',          (select to_jsonb(r) from public.trial_tower_progress r where r.user_id = p_user_id),
    'defense',        (select to_jsonb(r) from public.arena_defenses r where r.user_id = p_user_id),
    'season_results', coalesce((select jsonb_agg(to_jsonb(r)) from public.arena_season_results r where r.user_id = p_user_id), '[]'::jsonb),
    'reward_claims',  coalesce((select jsonb_agg(to_jsonb(r)) from public.arena_reward_claims r where r.user_id = p_user_id), '[]'::jsonb),
    'gifts',          coalesce((select jsonb_agg(to_jsonb(r)) from public.personal_gifts r where r.user_id = p_user_id), '[]'::jsonb),
    -- 対戦と購入は件数だけ。全部入れると控えが巨大になる
    'match_count',    (select count(*) from public.arena_matches r where r.attacker_id = p_user_id or r.defender_id = p_user_id),
    'purchase_count', (select count(*) from public.arena_shop_purchases r where r.user_id = p_user_id)
  );
$$;

-- ---------------------------------------------------------------------
-- 合わせる
-- ---------------------------------------------------------------------
create or replace function public.crimon_arena_merge(
  p_from    uuid,
  p_to      uuid,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before  jsonb;
  v_summary jsonb;
  v_moved   int;
  v_counts  jsonb := '{}'::jsonb;
begin
  if p_from is null or p_to is null then raise exception 'MISSING_USER'; end if;
  if p_from = p_to then raise exception 'SAME_USER'; end if;
  if not exists (select 1 from public.arena_profiles where user_id = p_from) then raise exception 'FROM_NOT_FOUND'; end if;
  if not exists (select 1 from public.arena_profiles where user_id = p_to)   then raise exception 'TO_NOT_FOUND'; end if;

  v_before := jsonb_build_object(
    'from', public.crimon_arena_account_snapshot(p_from),
    'to',   public.crimon_arena_account_snapshot(p_to)
  );

  -- 合わせた後にどうなるか。**押す前に必ずこれを見る**
  v_summary := jsonb_build_object(
    'rating', (
      select jsonb_build_object(
        'from', max(case when user_id = p_from then rating end),
        'to',   max(case when user_id = p_to   then rating end),
        'after', max(rating))
      from public.arena_standings where user_id in (p_from, p_to)
    ),
    'wins', (
      select coalesce(sum(wins), 0) from public.arena_standings where user_id in (p_from, p_to)
    ),
    'losses', (
      select coalesce(sum(losses), 0) from public.arena_standings where user_id in (p_from, p_to)
    ),
    'coins_after', (
      select coalesce(sum(coins), 0) from public.arena_wallets where user_id in (p_from, p_to)
    ),
    'tower_after', (
      select coalesce(max(best_floor), 0) from public.trial_tower_progress where user_id in (p_from, p_to)
    ),
    'matches_moved', (
      select count(*) from public.arena_matches where attacker_id = p_from or defender_id = p_from
    )
  );

  if p_dry_run then
    return jsonb_build_object('dryRun', true, 'before', v_before, 'after', v_summary);
  end if;

  -- === 1. レートと戦績 ===============================================
  -- 片方にしか無いシーズンは、そのまま付け替える
  update public.arena_standings s set user_id = p_to
  where s.user_id = p_from
    and not exists (select 1 from public.arena_standings t where t.user_id = p_to and t.season_id = s.season_id);
  -- 両方にあるシーズンは合成する。**レートは高い方、勝敗は合算**
  update public.arena_standings t set
    rating         = greatest(t.rating, f.rating),
    best_rating    = greatest(t.best_rating, f.best_rating),
    tier_id        = case when f.rating > t.rating then f.tier_id else t.tier_id end,
    wins           = t.wins + f.wins,
    losses         = t.losses + f.losses,
    defense_wins   = t.defense_wins + f.defense_wins,
    defense_losses = t.defense_losses + f.defense_losses,
    -- 片方しか持っていない時に epoch へ落とさない
    last_match_at  = nullif(greatest(coalesce(t.last_match_at, '-infinity'::timestamptz),
                                     coalesce(f.last_match_at, '-infinity'::timestamptz)), '-infinity'::timestamptz),
    updated_at     = now()
  from public.arena_standings f
  where t.user_id = p_to and f.user_id = p_from and f.season_id = t.season_id;
  delete from public.arena_standings where user_id = p_from;

  -- === 2. コインと挑戦券 =============================================
  update public.arena_wallets w set user_id = p_to
  where w.user_id = p_from and not exists (select 1 from public.arena_wallets t where t.user_id = p_to);
  update public.arena_wallets t set
    coins          = t.coins + f.coins,
    lifetime_coins = t.lifetime_coins + f.lifetime_coins,
    -- 券は「持てる数」なので合算しない。多い方に合わせる
    tickets        = greatest(t.tickets, f.tickets),
    tickets_max    = greatest(t.tickets_max, f.tickets_max),
    updated_at     = now()
  from public.arena_wallets f
  where t.user_id = p_to and f.user_id = p_from;
  delete from public.arena_wallets where user_id = p_from;

  -- === 3. 試練の塔 ===================================================
  update public.trial_tower_progress g set user_id = p_to
  where g.user_id = p_from and not exists (select 1 from public.trial_tower_progress t where t.user_id = p_to);
  update public.trial_tower_progress t set
    best_floor            = greatest(t.best_floor, f.best_floor),
    -- 到達日時は、**その階に着いた方**のものを持ってくる
    best_floor_reached_at = case when f.best_floor > t.best_floor then f.best_floor_reached_at else t.best_floor_reached_at end,
    updated_at            = now()
  from public.trial_tower_progress f
  where t.user_id = p_to and f.user_id = p_from;
  delete from public.trial_tower_progress where user_id = p_from;

  -- === 4. 防衛編成 ===================================================
  -- **新しい方を残す。**防衛は今の手持ちで組むもので、古い編成を
  -- 持ってきても、いま持っていないモンスターが並ぶ
  update public.arena_defenses d set user_id = p_to
  where d.user_id = p_from and not exists (select 1 from public.arena_defenses t where t.user_id = p_to);
  delete from public.arena_defenses where user_id = p_from;

  -- === 5. シーズン結果 ===============================================
  update public.arena_season_results r set user_id = p_to
  where r.user_id = p_from
    and not exists (select 1 from public.arena_season_results t where t.user_id = p_to and t.season_id = r.season_id);
  delete from public.arena_season_results where user_id = p_from;

  -- === 6. 受け取り記録 ===============================================
  -- **衝突したら残す。**移すと二重受け取りができてしまう
  update public.arena_reward_claims c set user_id = p_to
  where c.user_id = p_from
    and not exists (
      select 1 from public.arena_reward_claims t
      where t.user_id = p_to and t.kind = c.kind and t.period_key = c.period_key);
  delete from public.arena_reward_claims where user_id = p_from;

  -- === 7. 個別配布 ===================================================
  update public.personal_gifts g set user_id = p_to
  where g.user_id = p_from
    and not exists (select 1 from public.personal_gifts t where t.user_id = p_to and t.gift_key = g.gift_key);
  delete from public.personal_gifts where user_id = p_from;

  -- === 8. 履歴(主キーが id なので、そのまま付け替えでよい) ==========
  update public.arena_matches         set attacker_id = p_to where attacker_id = p_from;
  update public.arena_matches         set defender_id = p_to where defender_id = p_from;
  update public.arena_match_sessions  set attacker_id = p_to where attacker_id = p_from;
  update public.arena_match_sessions  set defender_id = p_to where defender_id = p_from;
  update public.arena_shop_purchases  set user_id     = p_to where user_id     = p_from;
  get diagnostics v_moved = row_count;
  v_counts := jsonb_build_object('purchases_moved', v_moved);

  -- === 9. 親 =========================================================
  -- 登録日は**古い方**を残す。「いつから遊んでいるか」が消える
  update public.arena_profiles t set
    created_at = least(t.created_at, f.created_at),
    updated_at = now()
  from public.arena_profiles f
  where t.user_id = p_to and f.user_id = p_from;
  -- 子は全部移し終えている。ここで消しても道連れは出ない
  delete from public.arena_profiles where user_id = p_from;

  insert into public.crimon_arena_merge_log (from_user_id, to_user_id, before_snapshot, summary)
  values (p_from, p_to, v_before, v_summary || v_counts);

  return jsonb_build_object('dryRun', false, 'before', v_before, 'after', v_summary || v_counts);
end;
$$;

-- **クライアントからは絶対に呼ばせない。**呼べるのは service_role だけ
revoke all on function public.crimon_arena_account_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.crimon_arena_merge(uuid, uuid, boolean) from public, anon, authenticated;
