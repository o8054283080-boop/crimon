-- Admin-only player snapshots keyed by the existing Supabase auth.uid().
-- This is intentionally separate from recovery accounts: no recovery ID/password is created,
-- and no arena identity/rating/wallet row is modified.
create table if not exists public.crimon_player_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  save jsonb not null,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint crimon_player_snapshots_save_kind check (save->>'kind' = 'crimon-save')
);
alter table public.crimon_player_snapshots enable row level security;
revoke all on public.crimon_player_snapshots from public, anon, authenticated;
grant select, insert, update on public.crimon_player_snapshots to service_role;
comment on table public.crimon_player_snapshots is 'Operational/admin snapshots. Separate from user recovery accounts and arena progression.';

-- 管理APIの読み取り専用アクセス。本番ではservice_roleにも表権限が必要。
-- アリーナの既存行、ID、通貨、戦績、防衛へ書き込む権限は追加しない。
grant select on public.arena_seasons, public.arena_profiles,
  public.arena_standings, public.arena_wallets, public.arena_matches,
  public.trial_tower_progress, public.arena_shop_purchases to service_role;
