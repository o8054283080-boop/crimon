# supabase/

非同期PvPアリーナのサーバ側。**このリポジトリからは適用していない。**
依頼主が自分の Supabase プロジェクトへ流す想定で置いてある。

くわしい説明は `docs/arena-supabase.md`。ここは手順だけ。

## 適用する

```bash
# Supabase CLI(プロジェクトに link 済みであること)
supabase db push
```

ファイル名の順に流れる。**この順番に意味がある。**

```
20260902170000_arena_schema.sql            表・索引・制約
20260902170100_arena_rls.sql               RLS と権限
20260902171818_arena_catalog_*.sql         検分に使うゲーム定義(生成物)
20260902172000_arena_rpc.sql               RPC
20260902172100_arena_seed.sql              ACTIVE シーズン・棚・報酬額
20260902172200_arena_match_integrity.sql   検分と、勝敗のサーバ確定
```

RPC は `arena_catalog_*` を読むので、**照合表が先**でなければならない。

すべて**何度流しても同じ結果になる**ように書いてある
(`create table if not exists` / `on conflict do nothing` /
`drop policy if exists` → `create policy` / `create or replace function`)。
本番の migration 履歴がどうなっていても、後ろへ積むだけでよい。

## 勝敗を決める場所を配る

**これを配らないと、オンラインの対戦が1つも精算されない。**

```bash
npm run build:edge                        # 共有コードを functions/_shared/ へ
supabase functions deploy arena-settle
```

`arena-settle` はクライアントと同じ戦闘エンジンを、サーバが決めた種で
回し直して勝敗を出す。`_shared/` は生成物なので `.gitignore` にある
(**焼き付けると必ず古くなる**)。

Edge Function には `SUPABASE_SERVICE_ROLE_KEY` が要る
(Supabase が既定で渡す)。**フロントには絶対に置かないこと。**

## 匿名ログインを有効にする

Authentication → Providers → **Anonymous sign-ins を有効**にする。

これが無いと `auth.uid()` が生えないので、書き込み系のRPCは全部
`NOT_AUTHENTICATED` で弾かれる。読み(ランキング)だけが動く状態になる。

## 流した後にやること

**特に無い。** シーズンも棚も報酬額も seed に入っている。

以前ここには「シーズンを1つ開ける」「商品を入れる」という手作業の例が
書いてあった。その例に出てくる `EQUIPMENT_TICKET` は**実装に無い商品**で、
そのまま入れると「買えたのに手元に何も増えない」道具が棚に並ぶ。
seed に置いたのは、プレイヤーが実際に持てる7種だけ。

確かめたいときは:

```sql
select id, name, price from public.arena_shop_items order by sort_order;
select id, status, starts_at, ends_at from public.arena_seasons;
select count(*) from public.arena_catalog_monsters;  -- 174 のはず
```

`public.arena_config` と報酬額は `src/data/arena/` と揃えてある。
**片方だけ変えないこと。** 揃っているかは
`tests/arenaConfigParity.test.ts` が見張っている
(挑戦券の回復・勝敗コイン・報酬・シーズンの期間・ソフトリセット・棚)。

## クライアント側の設定

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

**未設定でもゲームは動く**(`src/net/arenaSync.ts` が「未接続」を返して
静かに落ちる)。`service_role` キーをフロントに置いてはいけない。
置いていないことは `tests/arenaSecurity.test.ts` が見張っている。

## まだ済んでいないこと

- **この作業環境からは Supabase へ接続できないため、実プロジェクトへの
  適用も接続テストも行っていない。** 手元の PostgreSQL に
  `auth.uid()` などのスタブを作って流す確認まで。
- 攻撃編成の**所有**は確かめられない。手持ちをサーバへ同期していないので、
  「作れるはずの編成」であることまでしか見られない。
