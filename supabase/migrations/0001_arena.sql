-- =====================================================================
-- 0001_arena.sql — 非同期PvPアリーナのテーブル定義
--
-- ## 名前の約束
--
-- このプロジェクトには既に Edge Function `crimon-recovery` が動いており、
-- そのテーブルはこのリポジトリからは見えない。**衝突を確実に避けるため、
-- ここで作るものはすべて `arena_` で始める。** ビューも関数も同じ。
--
-- ## 列の置き場所が、そのまま「誰に見えるか」になる
--
-- RLS は行単位でしか効かないので、**公開してよい列と隠す列を同じ表に置くと
-- 守れない。** だから最初から分けてある。
--
--   公開(ランキングに出る)   : arena_profiles / arena_standings / arena_defenses
--   本人だけ                   : arena_wallets / arena_shop_purchases / arena_reward_claims
--
-- レート(arena_standings)は公開側だが、**書き込みは誰にも許さない**。
-- 更新は 0003 の RPC(security definer)だけが行う。
--
-- ## 順番
--   0001_arena.sql      … 表・索引・制約(このファイル)
--   0002_arena_rls.sql  … RLS と権限
--   0003_arena_rpc.sql  … RPC(レート計算・報酬・購入)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 調整値。**関数の中に数字を埋めない。**
-- src/data/arena/rating.ts と同じ値をここへ写す。片方だけ変えると、
-- 画面の予告と実際の増減がずれる(この案件で何度もやっている事故)。
-- クライアントには読ませない(0002 で grant を一切与えない)。
-- ---------------------------------------------------------------------
create table if not exists public.arena_config (
  key         text primary key,
  value       jsonb       not null,
  note        text,
  updated_at  timestamptz not null default now()
);

insert into public.arena_config (key, value, note) values
  ('rating',
   '{"even_win":15,"even_loss":10,"max_win":25,"min_loss":5,"min_win":8,"max_loss":15,"spread":300,"floor":0}'::jsonb,
   'src/data/arena/rating.ts の ARENA_RATING_RULES と同じ値にすること'),
  ('defense',
   '{"scale":0.5,"daily_loss_cap":60}'::jsonb,
   'ARENA_DEFENSE_RATING_SCALE / ARENA_DEFENSE_DAILY_LOSS_CAP と同じ値にすること'),
  ('tickets',
   '{"max":10,"refill_minutes":30,"cost_per_match":1}'::jsonb,
   '挑戦権。回復はサーバ時刻で計算する'),
  ('match_coins',
   '{"win_base":30,"loss_base":8,"upset_step":50,"upset_max":20}'::jsonb,
   '1戦で入るアリーナコイン。格上に勝つと upset_step ごとに +1(upset_max まで)'),
  ('npc',
   '{"rating_band":300,"rating_scale":1.0,"coin_scale":0.5}'::jsonb,
   'NPC戦。相手レートはクライアント申告だが rating_band の範囲へ丸める(申告で格上ボーナスを作れないようにする)'),
  ('match_limit',
   '{"min_seconds":3}'::jsonb,
   '同じ人が連打で戦績を積めないようにする最小間隔')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- ランク表。**src/data/arena/ranks.ts の ARENA_TIERS と同じ内容**を置く。
--
-- サーバ側でも tier_id を決める必要がある(レートを動かすのはサーバなので、
-- ランクもサーバが決めないと、クライアントの申告を信じることになる)。
-- ranks.ts に行を足したら、ここにも足すこと。
-- ---------------------------------------------------------------------
create table if not exists public.arena_tiers (
  id         text    primary key,
  name       text    not null,
  min_rating integer not null check (min_rating >= 0),
  sort_order integer not null
);

insert into public.arena_tiers (id, name, min_rating, sort_order) values
  ('BRONZE_3',   'ブロンズIII',    0,  1),
  ('BRONZE_2',   'ブロンズII',  1000,  2),
  ('BRONZE_1',   'ブロンズI',   1100,  3),
  ('SILVER_3',   'シルバーIII', 1200,  4),
  ('SILVER_2',   'シルバーII',  1300,  5),
  ('SILVER_1',   'シルバーI',   1400,  6),
  ('GOLD_3',     'ゴールドIII', 1500,  7),
  ('GOLD_2',     'ゴールドII',  1600,  8),
  ('GOLD_1',     'ゴールドI',   1700,  9),
  ('PLATINUM_3', 'プラチナIII', 1800, 10),
  ('PLATINUM_2', 'プラチナII',  1900, 11),
  ('PLATINUM_1', 'プラチナI',   2000, 12),
  ('MASTER',     'マスター',    2200, 13),
  ('LEGEND',     'レジェンド',  2500, 14)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- シーズン。**同時に ACTIVE は1つだけ**(下の部分一意索引で担保)。
-- ---------------------------------------------------------------------
create table if not exists public.arena_seasons (
  id                text        primary key,
  name              text        not null,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            text        not null default 'UPCOMING'
                                check (status in ('UPCOMING', 'ACTIVE', 'CLOSED')),
  -- 締めのソフトリセット: new = base + round((rating - base) * factor)
  soft_reset_base   integer     not null default 1000 check (soft_reset_base >= 0),
  soft_reset_factor numeric     not null default 0.5
                                check (soft_reset_factor >= 0 and soft_reset_factor <= 1),
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  check (ends_at > starts_at)
);

create unique index if not exists arena_seasons_single_active
  on public.arena_seasons ((status)) where status = 'ACTIVE';

-- ---------------------------------------------------------------------
-- プロフィール。**ランキングに出してよいものだけ。** 他人からも読める。
--
-- 代表モンスター(先頭の1体)もここに置く。防衛スナップショット側に
-- 置くと、ランキングを見せるために防衛表まで読ませることになり、
-- **編成の中身が丸ごと公開になる。**
-- 書き込むのは arena_set_defense(0003)だけ(列単位の grant で守る)。
-- ---------------------------------------------------------------------
create table if not exists public.arena_profiles (
  user_id         uuid        primary key references auth.users (id) on delete cascade,
  display_name    text        not null check (char_length(display_name) between 1 and 24),
  icon_key        text        not null default 'default'
                              check (char_length(icon_key) between 1 and 64),
  -- 代表モンスターは MonsterInstance の dexId(「テンプレートID_属性」)と星。
  -- 属性は dexId から引けるので別の列にしない
  lead_dex_id     text,
  lead_star       integer     check (lead_star is null or lead_star between 1 and 6),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- レート・ランク・戦績。**シーズンごとに1行。**
-- 公開列しか置かない(通貨は arena_wallets)。
-- ---------------------------------------------------------------------
create table if not exists public.arena_standings (
  user_id            uuid        not null references public.arena_profiles (user_id) on delete cascade,
  season_id          text        not null references public.arena_seasons (id) on delete cascade,
  rating             integer     not null default 1000 check (rating >= 0),
  best_rating        integer     not null default 1000 check (best_rating >= 0),
  tier_id            text        not null default 'BRONZE_3' references public.arena_tiers (id),
  wins               integer     not null default 0 check (wins >= 0),
  losses             integer     not null default 0 check (losses >= 0),
  defense_wins       integer     not null default 0 check (defense_wins >= 0),
  defense_losses     integer     not null default 0 check (defense_losses >= 0),
  -- 防衛で1日に落ちる量の上限を見るための控え
  defense_loss_date  date        not null default current_date,
  defense_loss_today integer     not null default 0 check (defense_loss_today >= 0),
  last_match_at      timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, season_id),
  check (best_rating >= rating)
);

-- ランキングはレート降順。同点は先に到達した方を上にする
create index if not exists arena_standings_rank_idx
  on public.arena_standings (season_id, rating desc, updated_at asc);

-- ---------------------------------------------------------------------
-- 財布。**アリーナコインと挑戦権。ここは本人しか読めない。**
-- シーズンをまたいで持ち越す。
-- ---------------------------------------------------------------------
create table if not exists public.arena_wallets (
  user_id           uuid        primary key references public.arena_profiles (user_id) on delete cascade,
  coins             bigint      not null default 0 check (coins >= 0),
  lifetime_coins    bigint      not null default 0 check (lifetime_coins >= 0),
  tickets           integer     not null default 10 check (tickets >= 0),
  tickets_max       integer     not null default 10 check (tickets_max > 0),
  tickets_refilled_at timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (tickets <= tickets_max)
);

-- ---------------------------------------------------------------------
-- 防衛スナップショット。**1人1件。** 中身は ArenaDefenseSnapshot
-- ({ version, capturedAt, units }) をそのまま JSONB で焼く。
--
-- 平たく持ち直さない理由は src/game/arena/types.ts に書いてある。
-- ここでは索引と検査に要る値だけ列に出しておく。
-- ---------------------------------------------------------------------
create table if not exists public.arena_defenses (
  user_id          uuid        primary key references public.arena_profiles (user_id) on delete cascade,
  snapshot         jsonb       not null,
  snapshot_version integer     not null check (snapshot_version >= 1),
  unit_count       integer     not null check (unit_count between 1 and 4),
  captured_at      timestamptz not null,
  updated_at       timestamptz not null default now(),
  check (jsonb_typeof(snapshot -> 'units') = 'array')
);

create index if not exists arena_defenses_updated_idx
  on public.arena_defenses (updated_at desc);

-- ---------------------------------------------------------------------
-- 対戦履歴。**1戦につき1行。** 攻撃側と防衛側の両方から引ける。
-- NPC戦は defender_id が null(相手は npc_seed / npc_name で表す)。
-- ---------------------------------------------------------------------
create table if not exists public.arena_matches (
  id                     uuid        primary key default gen_random_uuid(),
  season_id              text        not null references public.arena_seasons (id) on delete cascade,
  attacker_id            uuid        not null references public.arena_profiles (user_id) on delete cascade,
  defender_id            uuid        references public.arena_profiles (user_id) on delete set null,
  opponent_kind          text        not null check (opponent_kind in ('PLAYER', 'NPC')),
  npc_seed               text,
  npc_name               text,
  attacker_won           boolean     not null,
  attacker_rating_before integer     not null check (attacker_rating_before >= 0),
  attacker_rating_delta  integer     not null,
  attacker_rating_after  integer     not null check (attacker_rating_after >= 0),
  defender_rating_before integer     check (defender_rating_before is null or defender_rating_before >= 0),
  defender_rating_delta  integer,
  defender_rating_after  integer     check (defender_rating_after is null or defender_rating_after >= 0),
  coins_awarded          integer     not null default 0 check (coins_awarded >= 0),
  created_at             timestamptz not null default now(),
  -- 相手が実プレイヤーの時だけ defender_id が入る。NPC戦で他人の行を作れない
  check ((opponent_kind = 'PLAYER') = (defender_id is not null)),
  check (defender_id is null or defender_id <> attacker_id)
);

create index if not exists arena_matches_attacker_idx
  on public.arena_matches (attacker_id, created_at desc);
create index if not exists arena_matches_defender_idx
  on public.arena_matches (defender_id, created_at desc)
  where defender_id is not null;
create index if not exists arena_matches_season_idx
  on public.arena_matches (season_id, created_at desc);

-- ---------------------------------------------------------------------
-- シーズン結果。締めた時点の順位を焼く。**1シーズン1人1行。**
-- ---------------------------------------------------------------------
create table if not exists public.arena_season_results (
  season_id     text        not null references public.arena_seasons (id) on delete cascade,
  user_id       uuid        not null references public.arena_profiles (user_id) on delete cascade,
  final_rating  integer     not null check (final_rating >= 0),
  final_tier_id text        not null references public.arena_tiers (id),
  final_rank    integer     not null check (final_rank >= 1),
  wins          integer     not null default 0 check (wins >= 0),
  losses        integer     not null default 0 check (losses >= 0),
  created_at    timestamptz not null default now(),
  primary key (season_id, user_id)
);

create index if not exists arena_season_results_rank_idx
  on public.arena_season_results (season_id, final_rank asc);

-- ---------------------------------------------------------------------
-- 報酬表。ランクごとの受取量。**金額はサーバのここにしか無い。**
-- ---------------------------------------------------------------------
create table if not exists public.arena_reward_rules (
  kind    text    not null check (kind in ('WEEKLY', 'SEASON')),
  tier_id text    not null references public.arena_tiers (id),
  coins   integer not null check (coins >= 0),
  note    text,
  primary key (kind, tier_id)
);

insert into public.arena_reward_rules (kind, tier_id, coins) values
  ('WEEKLY', 'BRONZE_3',   200), ('WEEKLY', 'BRONZE_2',   260), ('WEEKLY', 'BRONZE_1',   320),
  ('WEEKLY', 'SILVER_3',   420), ('WEEKLY', 'SILVER_2',   520), ('WEEKLY', 'SILVER_1',   620),
  ('WEEKLY', 'GOLD_3',     780), ('WEEKLY', 'GOLD_2',     920), ('WEEKLY', 'GOLD_1',    1060),
  ('WEEKLY', 'PLATINUM_3',1300), ('WEEKLY', 'PLATINUM_2',1500), ('WEEKLY', 'PLATINUM_1',1700),
  ('WEEKLY', 'MASTER',    2200), ('WEEKLY', 'LEGEND',    3000),
  ('SEASON', 'BRONZE_3',   600), ('SEASON', 'BRONZE_2',   800), ('SEASON', 'BRONZE_1',  1000),
  ('SEASON', 'SILVER_3',  1400), ('SEASON', 'SILVER_2',  1700), ('SEASON', 'SILVER_1',  2000),
  ('SEASON', 'GOLD_3',    2600), ('SEASON', 'GOLD_2',    3000), ('SEASON', 'GOLD_1',    3400),
  ('SEASON', 'PLATINUM_3',4200), ('SEASON', 'PLATINUM_2',4800), ('SEASON', 'PLATINUM_1',5400),
  ('SEASON', 'MASTER',    7000), ('SEASON', 'LEGEND',   10000)
on conflict (kind, tier_id) do nothing;

-- ---------------------------------------------------------------------
-- 受取記録。**二重受取は UNIQUE で物理的に止める。**
--
-- 「アプリが気をつける」では守れない。通信のやり直し・二重タップ・
-- 端末を2台並べる、のどれでも同じ行を2回入れようとする。
-- period_key は週なら 'IYYY-"W"IW'(例 2026-W07)、シーズンならシーズンID。
-- ---------------------------------------------------------------------
create table if not exists public.arena_reward_claims (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.arena_profiles (user_id) on delete cascade,
  kind       text        not null check (kind in ('WEEKLY', 'SEASON')),
  period_key text        not null check (char_length(period_key) between 1 and 32),
  tier_id    text        not null references public.arena_tiers (id),
  coins      integer     not null check (coins >= 0),
  created_at timestamptz not null default now(),
  constraint arena_reward_claims_once unique (user_id, kind, period_key)
);

create index if not exists arena_reward_claims_user_idx
  on public.arena_reward_claims (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- ショップ。価格・在庫・購入上限は**すべてサーバのこの表**が持つ。
-- クライアントが送るのは「どれを何個」だけ。
-- ---------------------------------------------------------------------
create table if not exists public.arena_shop_items (
  id              text        primary key,
  name            text        not null,
  description     text,
  price           integer     not null check (price >= 0),
  payload         jsonb       not null default '{}'::jsonb,
  -- null は「上限なし」
  stock           integer     check (stock is null or stock >= 0),
  limit_per_week  integer     check (limit_per_week is null or limit_per_week >= 1),
  limit_per_month integer     check (limit_per_month is null or limit_per_month >= 1),
  limit_total     integer     check (limit_total is null or limit_total >= 1),
  max_per_order   integer     not null default 1 check (max_per_order between 1 and 99),
  active          boolean     not null default true,
  starts_at       timestamptz,
  ends_at         timestamptz,
  sort_order      integer     not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists arena_shop_items_active_idx
  on public.arena_shop_items (active, sort_order asc);

create table if not exists public.arena_shop_purchases (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.arena_profiles (user_id) on delete cascade,
  item_id     text        not null references public.arena_shop_items (id) on delete restrict,
  quantity    integer     not null check (quantity >= 1),
  unit_price  integer     not null check (unit_price >= 0),
  total_price integer     not null check (total_price >= 0),
  -- 上限の検査に使う。now() は immutable でないので生成列にはできず、RPCが入れる
  week_key    text        not null,
  month_key   text        not null,
  payload     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists arena_shop_purchases_user_idx
  on public.arena_shop_purchases (user_id, created_at desc);
create index if not exists arena_shop_purchases_week_idx
  on public.arena_shop_purchases (user_id, item_id, week_key);
create index if not exists arena_shop_purchases_month_idx
  on public.arena_shop_purchases (user_id, item_id, month_key);

-- ---------------------------------------------------------------------
-- ビュー。**公開してよい列だけを並べたもの。**
--
-- どちらも**開催中のシーズンだけ**を返す。過去シーズンの順位は
-- arena_season_results にある(締めた時点で焼いてあるので、
-- ランキングのビューに過去分を混ぜる必要がない)。
--
-- どちらも `security_invoker = on`。**見る人の権限で走る**ので、
-- ビューが RLS の抜け道にならない(所有者権限で走るビューを作ると、
-- 下の表の RLS を素通りする)。
-- ---------------------------------------------------------------------
create or replace view public.arena_public_ranking
with (security_invoker = on) as
select
  s.season_id,
  s.user_id,
  p.display_name,
  p.icon_key,
  s.rating,
  s.best_rating,
  s.tier_id,
  s.wins,
  s.losses,
  p.lead_dex_id,
  p.lead_star,
  rank() over (order by s.rating desc, s.updated_at asc) as rank
from public.arena_standings s
join public.arena_profiles p on p.user_id = s.user_id
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE');

-- 対戦候補。**防衛スナップショットまで入っている**ので、
-- 見せる相手は 0002 で authenticated だけに絞る。
create or replace view public.arena_opponent_pool
with (security_invoker = on) as
select
  s.season_id,
  s.user_id,
  p.display_name,
  p.icon_key,
  s.rating,
  s.tier_id,
  p.lead_dex_id,
  p.lead_star,
  d.snapshot,
  d.snapshot_version,
  d.unit_count,
  d.captured_at,
  d.updated_at
from public.arena_standings s
join public.arena_profiles p on p.user_id = s.user_id
join public.arena_defenses d on d.user_id = s.user_id
where s.season_id = (select x.id from public.arena_seasons x where x.status = 'ACTIVE');
