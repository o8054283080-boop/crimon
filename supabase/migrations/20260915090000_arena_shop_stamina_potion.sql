-- ---------------------------------------------------------------------
-- アリーナショップにスタミナポーションを1品足す。
--
-- **棚は両側で決まる。**クライアントの `src/data/arena/shop.ts` だけを
-- 変えると、買った瞬間にサーバが「その商品はありません」と返す。
-- 逆にサーバだけへ足すと、買えたのに手元で何も増えない。
-- `tests/arenaConfigParity.test.ts` が両者を突き合わせている。
--
-- 既に流したマイグレーションは二度と走らないので、
-- **棚の変更は必ず新しいファイルで足す。**
-- 挿入の形は元の棚(20260903015014)と同じ upsert。
--
-- 週2個まで・80コイン。1戦10コインなので、週8戦ぶんで1個。
-- ここを厚くすると自動周回がコインの力でいくらでも伸びるので、
-- 「今日あと少し回りたい」を埋める量に留める。
-- ---------------------------------------------------------------------

insert into public.arena_shop_items
  (id, name, description, price, payload,
   limit_per_week, limit_per_month, limit_per_season,
   max_per_order, active, sort_order)
values
  ('stamina_potion', 'スタミナポーション', 'ダイヤを使わずスタミナを回復する', 80,
   '{"kind":"STAMINA_POTION","amount":1}'::jsonb, 2, null, null, 1, true, 25)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  payload = excluded.payload,
  limit_per_week = excluded.limit_per_week,
  limit_per_month = excluded.limit_per_month,
  limit_per_season = excluded.limit_per_season,
  max_per_order = excluded.max_per_order,
  active = excluded.active,
  sort_order = excluded.sort_order,
  updated_at = now();
