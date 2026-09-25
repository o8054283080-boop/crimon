-- =====================================================================
-- 【読み取り専用・一時ファイル】アリーナ改修の前に、本番の状態を集計だけで確かめる。
--
-- - 先頭で read only を宣言する。**書き込みは一切できない**(書こうとすれば取引ごと落ちる)
-- - リポジトリは公開なので、ログに出すのは**集計と関数定義だけ**。
--   名前・user_id・個人のレートは出さない。人数が5人未満の区分はぼかす
-- - 確認が済んだらこのファイルは消す(PRには含めない)
-- =====================================================================
set transaction read only;

\echo '=== 1. 有効シーズン ==='
select id, status, starts_at, ends_at from public.arena_seasons where status = 'ACTIVE';

\echo '=== 2. 有効シーズンの人数(順位・防衛あり・直近に戦った人) ==='
select
  count(*) as standings,
  count(*) filter (where exists (select 1 from public.arena_defenses d where d.user_id = s.user_id)) as with_defense,
  count(*) filter (where s.last_match_at > now() - interval '7 days') as fought_7d,
  count(*) filter (where s.last_match_at > now() - interval '3 days') as fought_3d
from public.arena_standings s
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE');

\echo '=== 3. 防衛ありの人のレート分布(250刻み。5人未満は <5) ==='
select
  (floor(s.rating / 250.0) * 250)::int as band_from,
  case when count(*) < 5 then '<5' else count(*)::text end as players
from public.arena_standings s
join public.arena_defenses d on d.user_id = s.user_id
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE')
group by 1 order by 1;

\echo '=== 4. 防衛ありの人のレートの要約(最小・四分位・最大) ==='
select
  count(*) as n,
  min(s.rating) as min_rating,
  percentile_disc(0.25) within group (order by s.rating) as p25,
  percentile_disc(0.5) within group (order by s.rating) as median,
  percentile_disc(0.75) within group (order by s.rating) as p75,
  max(s.rating) as max_rating
from public.arena_standings s
join public.arena_defenses d on d.user_id = s.user_id
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE');

\echo '=== 5. 挑戦券の所持と上限の分布(人数のみ) ==='
select w.tickets_max, w.tickets, count(*) as wallets
from public.arena_wallets w
group by 1, 2 order by 1, 2;

\echo '=== 6. 直近14日の対戦数(日別・相手の種類別。JST) ==='
select (m.created_at at time zone 'Asia/Tokyo')::date as day, m.opponent_kind,
       count(*) as matches, count(distinct m.attacker_id) as attackers
from public.arena_matches m
where m.created_at > now() - interval '14 days'
group by 1, 2 order by 1, 2;

\echo '=== 7. 直近14日のレート増減とコイン(相手の種類・勝敗別の平均) ==='
select m.opponent_kind, m.attacker_won,
       count(*) as matches,
       round(avg(m.attacker_rating_delta), 2) as avg_attacker_delta,
       round(avg(m.defender_rating_delta), 2) as avg_defender_delta,
       round(avg(m.coins_awarded), 2) as avg_coins,
       round(avg(m.defender_rating_before - m.attacker_rating_before), 1) as avg_gap
from public.arena_matches m
where m.created_at > now() - interval '14 days'
group by 1, 2 order by 1, 2;

\echo '=== 8. 設定表(ゲームの数値のみ) ==='
select key, value from public.arena_config order by key;

\echo '=== 9. 財布の制約 ==='
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'public.arena_wallets'::regclass order by conname;

\echo '=== 10. 触る予定の関数の本番定義(リポジトリとの食い違いを確かめる) ==='
select p.proname, pg_get_function_identity_arguments(p.oid) as args, md5(pg_get_functiondef(p.oid)) as md5,
       pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('arena__refill_tickets', 'arena_refill_tickets_paid', 'arena__record_match',
                    'arena_match_coins', 'arena_rating_delta', 'arena__rating_curve_value',
                    'arena_ensure_profile', 'arena_settle_match', 'arena_begin_match',
                    'arena_state', 'arena__award_defense_coins', 'arena__config')
order by 1, 2;

\echo '=== 11. 候補表(ビュー)の本番定義 ==='
select pg_get_viewdef('public.arena_opponent_pool'::regclass, true);

\echo '=== 12. arena_matches の列(防衛コインの列があるか) ==='
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name in ('arena_matches', 'arena_wallets', 'arena_standings')
 order by table_name, ordinal_position;
