--
-- アリーナ: 開けるための初期データ
--
-- ## なぜ別ファイルなのか
--
-- 表を作っただけでは**アリーナは1つも動かない。**
--
--   ・`arena_seasons` に ACTIVE が無いと、`arena_current_season()` が
--     何も返さず、順位表も報酬も対戦の記録も全部止まる
--   ・`arena_shop_items` が空だと、購入は必ず「その商品はありません」になる
--
-- 表の定義(構造)と、動かすための中身(データ)は寿命が違う。
-- シーズンは4週ごとに足すし、棚は入れ替える。だから分けてある。
--
-- ## 並んでいるのは実在するものだけ
--
-- **プレイヤーが実際に持てる7種**しか置かない。
-- 召喚の書 / ★4以上召喚書 / 光闇★4以上召喚書 / 経験ピッグ /
-- 転生ピッグ / ゴールド / 覚醒オーブ。
-- ここに無いものを増やすと、買えたのに手元に増えない道具が生まれる。
-- 値も中身も `src/data/arena/shop.ts` と同じで、
-- `tests/arenaConfigParity.test.ts` が突き合わせを見張っている。
--

-- ---------------------------------------------------------------------
-- シーズン
--
-- 区切りは `src/data/arena/season.ts` の
--   ARENA_SEASON_EPOCH_UTC = 2026-08-30T19:00:00Z(= 2026-08-31 04:00 JST 月曜)
--   ARENA_SEASON_WEEKS     = 4
-- と揃える。**ここがずれると「今シーズンの締めまで」が嘘になる。**
--
-- ソフトリセットも TS 側と同じ:
--   ARENA_SOFT_RESET = { anchor: 1450, keep: 1/3 }
--   new = 1450 + round((rating - 1450) / 3)
-- ---------------------------------------------------------------------
insert into public.arena_seasons
  (id, name, starts_at, ends_at, status, soft_reset_base, soft_reset_factor)
values
  ('S1',
   'シーズン1',
   '2026-08-30T19:00:00Z',
   '2026-09-27T19:00:00Z',
   'ACTIVE',
   1450,
   (1.0 / 3.0))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- ショップ
--
-- `payload` は「何を何個渡すか」。渡す側(クライアント)が読む形にしてある。
--   kind   … SUMMON_SCROLL / FOUR_STAR_SCROLL / LIGHT_DARK_SCROLL /
--             GOLD / AWAKENING_ORB / EXP_PIG / REINCARNATION_PIG
--   amount … 1回の購入で渡す数
--   star   … ピッグの星(それ以外では使わない)
--
-- 値付けの考え方(`src/data/arena/shop.ts` と同じ):
--   ・1戦で 10 / 3 コイン。挑戦券は1日に最大24枚ぶん回復する(上限10)
--   ・週の上限を全部買うと約700コイン。**普通に遊んで届く範囲**
--   ・転生ピッグだけ別格に高い。ランクアップの頭数をそのまま買えるので、
--     安いと育成の順番そのものが壊れる
-- ---------------------------------------------------------------------
insert into public.arena_shop_items
  (id, name, description, price, payload, limit_per_week, limit_per_month, max_per_order, active, sort_order)
values
  ('summon_scroll', '召喚の書', '通常召喚を1回ぶん', 60,
   '{"kind":"SUMMON_SCROLL","amount":1}'::jsonb, 5, null, 1, true, 10),

  ('gold_small', 'ゴールド 50,000', '強化と装備の費用に', 25,
   '{"kind":"GOLD","amount":50000}'::jsonb, 10, null, 1, true, 20),

  ('exp_pig_3', '経験ピッグ★3', 'モンスター強化の素材', 45,
   '{"kind":"EXP_PIG","amount":1,"star":3}'::jsonb, 3, null, 1, true, 30),

  ('awakening_orb', '覚醒オーブ', '潜在覚醒の候補を1つ選べる', 120,
   '{"kind":"AWAKENING_ORB","amount":1}'::jsonb, 2, null, 1, true, 40),

  ('four_star_scroll', '★4以上召喚書', '★4以上が確定で出る', 400,
   '{"kind":"FOUR_STAR_SCROLL","amount":1}'::jsonb, null, 1, 1, true, 50),

  ('light_dark_scroll', '光闇★4以上召喚書', '光か闇の★4以上が確定で出る', 600,
   '{"kind":"LIGHT_DARK_SCROLL","amount":1}'::jsonb, null, 1, 1, true, 60),

  ('reincarnation_pig_4', '転生ピッグ★4', 'ランクアップの素材。レベル上限で届く', 700,
   '{"kind":"REINCARNATION_PIG","amount":1,"star":4}'::jsonb, null, 1, 1, true, 70)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 報酬のアリーナコイン
--
-- **サーバとクライアントで全く違う値が入っていた。**
--
--   週・ブロンズIII   サーバ 200 / クライアント 20
--   季・レジェンド    サーバ 10000 / クライアント 1000
--
-- 桁が1つ違う。繋いだ瞬間に「受け取ったコインが10倍」になる。
-- `src/data/arena/season.ts` の `arenaCoins` と同じ値へ揃える。
--
-- クリスタル・ゴールド・召喚書・称号はサーバの表に入れない。
-- **手持ちをサーバへ同期していないから。** ここに置くと、
-- 「サーバは配ったつもり・手元には無い」が生まれる。
-- コインだけはサーバが残高を持っているので、サーバが配る。
--
-- `do update` にしてあるのは、**古い値が入った環境を直すため**
-- (`do nothing` だと、既に間違った値が入っている所だけが直らない)。
-- ---------------------------------------------------------------------
insert into public.arena_reward_rules (kind, tier_id, coins) values
  ('WEEKLY', 'BRONZE_3',    20), ('WEEKLY', 'BRONZE_2',    25), ('WEEKLY', 'BRONZE_1',    30),
  ('WEEKLY', 'SILVER_3',    40), ('WEEKLY', 'SILVER_2',    45), ('WEEKLY', 'SILVER_1',    50),
  ('WEEKLY', 'GOLD_3',      65), ('WEEKLY', 'GOLD_2',      75), ('WEEKLY', 'GOLD_1',      85),
  ('WEEKLY', 'PLATINUM_3', 105), ('WEEKLY', 'PLATINUM_2', 120), ('WEEKLY', 'PLATINUM_1', 135),
  ('WEEKLY', 'MASTER',     170), ('WEEKLY', 'LEGEND',     210),
  ('SEASON', 'BRONZE_3',   100), ('SEASON', 'BRONZE_2',   120), ('SEASON', 'BRONZE_1',   150),
  ('SEASON', 'SILVER_3',   200), ('SEASON', 'SILVER_2',   240), ('SEASON', 'SILVER_1',   280),
  ('SEASON', 'GOLD_3',     350), ('SEASON', 'GOLD_2',     400), ('SEASON', 'GOLD_1',     450),
  ('SEASON', 'PLATINUM_3', 550), ('SEASON', 'PLATINUM_2', 620), ('SEASON', 'PLATINUM_1', 700),
  ('SEASON', 'MASTER',     850), ('SEASON', 'LEGEND',    1000)
on conflict (kind, tier_id) do update set coins = excluded.coins;

-- ---------------------------------------------------------------------
-- スナップショットの版
--
-- **未来から来た編成を受け取らない。**
--
-- 焼き付けの形を変えた時、新しい版を名乗る編成が先に届くことがある
-- (配信の途中で、新旧のクライアントが同時に動く)。
-- 中身の読み方が変わっているのに古いサーバが受け取ると、
-- **それを引いた相手の画面で編成が崩れる**——本人には見えない事故になる。
--
-- 古い版は受け取る。読めるからで、読めなくなった1体は
-- 閲覧側が黙って落とす(`snapshotToDefinitions`)。
-- 拒むのは「こちらが知らない版」だけにする。
--
-- `src/game/arena/types.ts` の `ARENA_SNAPSHOT_VERSION` と同じ値にすること。
-- `tests/arenaConfigParity.test.ts` が見張っている。
-- ---------------------------------------------------------------------
insert into public.arena_config (key, value, note) values
  ('snapshot',
   '{"max_version":1}'::jsonb,
   'ARENA_SNAPSHOT_VERSION と同じ値にすること。これより新しい版の編成は受け取らない')
on conflict (key) do update set value = excluded.value, note = excluded.note;
