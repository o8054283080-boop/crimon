# supabase/

非同期PvPアリーナのサーバ側。**このリポジトリからは適用していない。**
依頼主が自分の Supabase プロジェクトへ流す想定で置いてある。

くわしい説明は `docs/arena-supabase.md`。ここは手順だけ。

## 適用する

```bash
# Supabase CLI を使う場合(プロジェクトに link 済みであること)
supabase db push

# あるいは SQL エディタに、この順で貼って実行する
#   1. migrations/0001_arena.sql   表・索引・制約
#   2. migrations/0002_arena_rls.sql  RLS と権限
#   3. migrations/0003_arena_rpc.sql  RPC
```

**順番を守ること。** 0002 は 0001 の表に、0003 は両方に依存している。
3つとも**何度流しても同じ結果になる**ように書いてある
(`create table if not exists` / `on conflict do nothing` /
`drop policy if exists` → `create policy` / `create or replace function`)。

## 流した後にやること

```sql
-- 1. シーズンを1つ開ける。これが無いと対戦もランキングも空
insert into public.arena_seasons (id, name, starts_at, ends_at, status)
values ('2026-S1', 'シーズン1', now(), now() + interval '28 days', 'ACTIVE');

-- 2. ショップの商品を入れる(価格・在庫・上限はここが唯一の出どころ)
insert into public.arena_shop_items (id, name, price, limit_per_week, max_per_order, payload)
values ('rune_pack', 'ルーンの小包', 800, 3, 1, '{"kind":"EQUIPMENT_TICKET","count":1}');
```

`public.arena_config` の値は `src/data/arena/rating.ts` と揃えてある。
**片方だけ変えないこと**(画面の予告と実際の増減がずれる)。

## クライアント側の設定

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

**未設定でもゲームは動く**(`src/net/arenaSync.ts` が「未接続」を返して
静かに落ちる)。`service_role` キーをフロントに置いてはいけない。

## まだ済んでいないこと

- **この作業環境からは Supabase へ接続できないため、実プロジェクトへの
  適用も接続テストも行っていない。**
- 書き込み系のRPCは `auth.uid()` を使う。**アプリはまだ Supabase Auth を
  使っていない**(いまの識別子は復旧ID + セッショントークン)。
  匿名サインインなどを入れるまで、書き込みは全部 `NOT_AUTHENTICATED` で弾かれる。
  読み(ランキング)は anon key だけで動く。
