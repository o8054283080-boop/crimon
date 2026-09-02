-- =====================================================================
-- 0002_arena_rls.sql — RLS と権限
--
-- ## 考え方
--
-- **「アプリが送らないから安全」は安全ではない。** anon key はブラウザに
-- 配られるので、誰でも PostgREST を直接叩ける。だから
-- 「送られたら困る操作」は、そもそも権限として与えない。
--
-- 守る順番は3枚重ね:
--
--   1. GRANT      … その表・その列に触れるか(列単位で絞れる唯一の道具)
--   2. RLS policy … 触れる行はどれか
--   3. RPC        … 値をいくら動かせるか(0003)
--
-- レートと通貨には **1枚目の時点で update を与えない。**
-- `update arena_standings set rating = 9999` は権限不足で弾かれ、
-- ポリシーの書き間違いがあっても届かない。
--
-- ## Supabase の既定値に注意
--
-- Supabase では public スキーマに作った表へ、既定で anon / authenticated へ
-- 広い権限が付く。**まず revoke してから、要る分だけ grant する。**
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 全表で RLS を有効にする
--
-- `force` は付けない。付けると所有者(= security definer 関数の実行者)まで
-- ポリシーに縛られ、0003 の RPC が自分の仕事をできなくなる。
-- ---------------------------------------------------------------------
alter table public.arena_config          enable row level security;
alter table public.arena_tiers           enable row level security;
alter table public.arena_seasons         enable row level security;
alter table public.arena_profiles        enable row level security;
alter table public.arena_standings       enable row level security;
alter table public.arena_wallets         enable row level security;
alter table public.arena_defenses        enable row level security;
alter table public.arena_matches         enable row level security;
alter table public.arena_season_results  enable row level security;
alter table public.arena_reward_rules    enable row level security;
alter table public.arena_reward_claims   enable row level security;
alter table public.arena_shop_items      enable row level security;
alter table public.arena_shop_purchases  enable row level security;

-- ---------------------------------------------------------------------
-- 2. いったん全部取り上げる
-- ---------------------------------------------------------------------
revoke all on public.arena_config         from anon, authenticated;
revoke all on public.arena_tiers          from anon, authenticated;
revoke all on public.arena_seasons        from anon, authenticated;
revoke all on public.arena_profiles       from anon, authenticated;
revoke all on public.arena_standings      from anon, authenticated;
revoke all on public.arena_wallets        from anon, authenticated;
revoke all on public.arena_defenses       from anon, authenticated;
revoke all on public.arena_matches        from anon, authenticated;
revoke all on public.arena_season_results from anon, authenticated;
revoke all on public.arena_reward_rules   from anon, authenticated;
revoke all on public.arena_reward_claims  from anon, authenticated;
revoke all on public.arena_shop_items     from anon, authenticated;
revoke all on public.arena_shop_purchases from anon, authenticated;
revoke all on public.arena_public_ranking from anon, authenticated;
revoke all on public.arena_opponent_pool  from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. arena_config … クライアントには一切見せない
--
-- ポリシーも grant も書かない。RLS 有効 + 権限なしなので、
-- anon / authenticated からは存在しないのと同じ。
-- 読むのは 0003 の security definer 関数だけ。
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. シーズン・報酬表・商品 … 読むだけ
-- ---------------------------------------------------------------------
grant select on public.arena_seasons to anon, authenticated;
drop policy if exists arena_seasons_read on public.arena_seasons;
create policy arena_seasons_read on public.arena_seasons
  for select to anon, authenticated using (true);

-- ランク表は画面の表示に要る(境界も色も公開情報)
grant select on public.arena_tiers to anon, authenticated;
drop policy if exists arena_tiers_read on public.arena_tiers;
create policy arena_tiers_read on public.arena_tiers
  for select to anon, authenticated using (true);

-- 報酬表は「自分がいくら貰えるか」を画面に出すために読ませる。
-- 実際にいくら入るかは 0003 がこの表を見て決める(クライアントの申告は使わない)。
grant select on public.arena_reward_rules to authenticated;
drop policy if exists arena_reward_rules_read on public.arena_reward_rules;
create policy arena_reward_rules_read on public.arena_reward_rules
  for select to authenticated using (true);

-- 販売中の商品だけ見せる。価格はここが唯一の出どころ
grant select on public.arena_shop_items to anon, authenticated;
drop policy if exists arena_shop_items_read on public.arena_shop_items;
create policy arena_shop_items_read on public.arena_shop_items
  for select to anon, authenticated
  using (
    active
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now())
  );

-- ---------------------------------------------------------------------
-- 5. arena_profiles … 表示名とアイコンは公開。**書けるのは自分の2列だけ**
--
-- 列単位の grant を使う。ポリシーだけでは列を絞れないので、
-- 「自分の行の update は許すが rating 列は無い」を作るにはこれが要る
-- (もっとも rating はそもそも別の表にある。二重に守っている)。
-- 行の作成は RPC 経由(arena_ensure_profile)なので insert は与えない。
-- ---------------------------------------------------------------------
grant select on public.arena_profiles to anon, authenticated;
grant update (display_name, icon_key) on public.arena_profiles to authenticated;

drop policy if exists arena_profiles_read on public.arena_profiles;
create policy arena_profiles_read on public.arena_profiles
  for select to anon, authenticated using (true);

drop policy if exists arena_profiles_update_own on public.arena_profiles;
create policy arena_profiles_update_own on public.arena_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 6. arena_standings … レートは**読めるが、誰も書けない**
--
-- update / insert / delete の grant を出さない。ポリシーも作らない。
-- `update arena_standings set rating = 9999 where user_id = auth.uid()` は
-- 権限の段階で落ちる。増減は 0003 の arena_report_match だけが行う。
-- ---------------------------------------------------------------------
grant select on public.arena_standings to anon, authenticated;
drop policy if exists arena_standings_read on public.arena_standings;
create policy arena_standings_read on public.arena_standings
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- 7. arena_wallets … **本人の行だけ読める。書けない。**
--
-- 他人のコインも挑戦権も見えない。自分のコインも増やせない。
-- ---------------------------------------------------------------------
grant select on public.arena_wallets to authenticated;
drop policy if exists arena_wallets_read_own on public.arena_wallets;
create policy arena_wallets_read_own on public.arena_wallets
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 8. arena_defenses … 防衛編成は**見られるためにある**ので読みは全員に。
-- 書き込みは自分の行でも与えない(検査つきの RPC を通す)。
-- ---------------------------------------------------------------------
grant select on public.arena_defenses to authenticated;
drop policy if exists arena_defenses_read on public.arena_defenses;
create policy arena_defenses_read on public.arena_defenses
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 9. arena_matches … **自分が関わった戦いだけ**読める
--
-- 攻撃側でも防衛側でも同じ1行を引ける。他人同士の戦績は見えない。
-- 書き込みは無し(「勝ちました」を自分で書けたら意味がない)。
-- ---------------------------------------------------------------------
grant select on public.arena_matches to authenticated;
drop policy if exists arena_matches_read_own on public.arena_matches;
create policy arena_matches_read_own on public.arena_matches
  for select to authenticated
  using (
    attacker_id = (select auth.uid())
    or defender_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------
-- 10. arena_season_results … 過去シーズンの順位表。読むだけ
-- ---------------------------------------------------------------------
grant select on public.arena_season_results to authenticated;
drop policy if exists arena_season_results_read on public.arena_season_results;
create policy arena_season_results_read on public.arena_season_results
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 11. arena_reward_claims … **本人の受取記録だけ。書けない。**
--
-- 行を作れると「受け取っていないことにする」削除や、
-- 別の週として作り直すことができてしまう。insert も delete も与えない。
-- ---------------------------------------------------------------------
grant select on public.arena_reward_claims to authenticated;
drop policy if exists arena_reward_claims_read_own on public.arena_reward_claims;
create policy arena_reward_claims_read_own on public.arena_reward_claims
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 12. arena_shop_purchases … **本人の購入履歴だけ。書けない。**
--
-- 購入上限の検査はこの表を数えて行う(0003)。
-- 自分で行を消せると上限がすり抜けるので delete も与えない。
-- ---------------------------------------------------------------------
grant select on public.arena_shop_purchases to authenticated;
drop policy if exists arena_shop_purchases_read_own on public.arena_shop_purchases;
create policy arena_shop_purchases_read_own on public.arena_shop_purchases
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 13. ビュー
--
-- どちらも security_invoker なので、見る人の権限とポリシーで走る。
-- ランキングは通貨も購入履歴も含まない(そもそも別の表にある)。
-- ---------------------------------------------------------------------
grant select on public.arena_public_ranking to anon, authenticated;
grant select on public.arena_opponent_pool  to authenticated;
