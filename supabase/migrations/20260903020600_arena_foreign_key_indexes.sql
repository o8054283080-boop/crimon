-- 外部キーの参照確認と結合を、テーブル全走査にしない。
create index if not exists arena_reward_claims_tier_idx
  on public.arena_reward_claims (tier_id);
create index if not exists arena_reward_rules_tier_idx
  on public.arena_reward_rules (tier_id);
create index if not exists arena_season_results_final_tier_idx
  on public.arena_season_results (final_tier_id);
create index if not exists arena_shop_purchases_item_idx
  on public.arena_shop_purchases (item_id);
create index if not exists arena_standings_tier_idx
  on public.arena_standings (tier_id);
