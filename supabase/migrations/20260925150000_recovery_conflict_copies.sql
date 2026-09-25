-- =====================================================================
-- 保存が競合した端末の最新データを、別のバックアップとして残す
--
-- ## なぜ要るのか
--
-- 同じ復旧IDを2台で使うなどして、端末の内容とクラウドの内容が分かれると、
-- 保存は STALE_REVISION で止まる(古い方で上書きしないため)。
-- 止まっている間の端末の遊びは、**クラウドのどこにも届いていなかった。**
-- 本人が「保存内容を確認して再開」を押すまで、端末が壊れたら失われる。
--
-- ここに、競合した端末の最新データを**端末ごとに1行**で控える。
--   - 本来のバックアップ(crimon_recovery_accounts.latest_save)は**書き換えない**
--   - 世代(latest_revision)も進めない
--   - アリーナのID・戦績・通貨には触らない
--
-- ## 外部キーは張らない
--
-- recovery_arena_link と同じ考え方。控えは「覚え書き」で、
-- 復旧アカウントの整合性を守る場所ではない。account_id は文字列で持つ。
--
-- **冪等。**何度流しても同じ結果になる。
-- =====================================================================

create table if not exists public.crimon_recovery_conflict_copies (
  account_id text not null,
  -- 端末ごとの控えの番号。同じ端末からの保存は同じ行を上書きする(際限なく増やさない)
  device_id text not null,
  save jsonb not null,
  -- 競合を検知した時に端末が知っていた本来のバックアップの世代
  base_revision integer,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (account_id, device_id),
  constraint crimon_recovery_conflict_copies_save_kind check (save->>'kind' = 'crimon-save'),
  constraint crimon_recovery_conflict_copies_device_id check (device_id ~ '^[a-z0-9-]{8,64}$')
);

alter table public.crimon_recovery_conflict_copies enable row level security;
revoke all on public.crimon_recovery_conflict_copies from public, anon, authenticated;
grant select, insert, update on public.crimon_recovery_conflict_copies to service_role;

comment on table public.crimon_recovery_conflict_copies is
  '保存が競合した端末の最新データの控え。本来のバックアップ(latest_save)と世代、アリーナの行には触れない。端末ごとに1行。';
