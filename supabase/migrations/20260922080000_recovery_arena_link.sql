-- =====================================================================
-- 復旧IDに、アリーナの身元を結び付ける
--
-- ## なぜ要るのか
--
-- アリーナの身元は**端末の localStorage にしかない**
-- (`crimon.arena.auth.v1`)。クラウドの控えにもセーブファイルにも入らないので、
-- 端末を変えたり、サイトデータが消えたり、クラウド復旧で別端末へ移すと、
-- **新しい匿名ユーザが生まれる。**名前はセーブから来るので、
-- ランキングに**同じ名前で2人**並ぶ(実際に起きた)。
--
-- 復旧IDの側に「この人のアリーナはこれ」を覚えさせておけば、
-- 復旧した時に**元の身元へ戻せる。**
--
-- ## 外部キーは張らない
--
-- `arena_profiles` が消えても、復旧データそのものは残さなければいけない。
-- ここは「覚え書き」であって、参照の整合性を守る場所ではない。
--
-- **冪等。**何度流しても同じ結果になる。
-- =====================================================================

alter table public.crimon_recovery_accounts
  add column if not exists arena_user_id uuid;

comment on column public.crimon_recovery_accounts.arena_user_id is
  'このアカウントが最後に使っていたアリーナの user_id。復旧した時に元の身元へ戻すために使う。arena_profiles への外部キーは張らない(あちらが消えても復旧データは残す)';

-- 引き当てに使うので索引を置く。**一意にはしない**——
-- 同じアリーナ身元を指す復旧IDが2つできても、止めるのはここではない
create index if not exists crimon_recovery_accounts_arena_user_id_idx
  on public.crimon_recovery_accounts (arena_user_id)
  where arena_user_id is not null;
