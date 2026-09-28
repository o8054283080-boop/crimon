-- 一時: 試練の塔HARDランキングの本番確認(読み取り専用。確認後に消す)
select
  to_regclass('public.trial_tower_progress')              as normal_table,
  to_regclass('public.trial_tower_hard_progress')         as hard_table,
  to_regclass('public.trial_tower_hard_public_ranking')   as hard_view,
  to_regprocedure('public.trial_tower_hard_submit_progress(integer)') as hard_rpc,
  to_regprocedure('public.trial_tower_submit_progress(integer)')      as normal_rpc;
select count(*) as normal_rows, max(best_floor) as normal_max from public.trial_tower_progress;
select count(*) filter (where best_floor >= 100) as normal_cleared from public.trial_tower_progress;
