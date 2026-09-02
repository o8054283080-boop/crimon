# アリーナのサーバ側(Supabase)

非同期PvPアリーナを Supabase に載せるための設計と、依頼主が自分で適用する手順。

---

## 0. 先に、確かめていないことを書く

**この作業環境から `plufhhhxokqgedlyfsfz.supabase.co` へは一切到達できない。**
だから次のことは**やっていない**:

- 実プロジェクトへの migration の適用
- PostgREST / RPC への実通信
- Supabase の `authenticated` / `anon` ロールの実際の既定権限との突き合わせ
- Edge Function `crimon-recovery` が使っている既存テーブルとの実地の衝突確認
  (中身が見えないので、`arena_` 接頭辞で確実に分ける方針だけを取った)

**代わりに、手元の PostgreSQL 16 に `auth.uid()` と `anon` /
`authenticated` / `service_role` のスタブを作り、3つの migration をそのまま
流して動きを確かめてある。** 確かめた内容は「6. 手元で確かめたこと」。

Supabase 固有の部分(JWT の発行、`auth.users` の実装、既定の
`alter default privileges` の中身)はスタブなので、**本番で同じになる保証は無い。**
適用したら、まず「7. 適用したら最初に試すこと」の SQL を実行して確かめてほしい。

---

## 1. 置いたもの

```
supabase/
  README.md                      適用手順(短い版)
  migrations/20260902170000_arena_schema.sql      表・索引・制約
  migrations/20260902170100_arena_rls.sql  RLS と権限
  migrations/20260902172000_arena_rpc.sql  RPC(security definer)
src/net/arenaSync.ts             クライアント層(素の fetch。SDKは足していない)
tests/arenaSync.test.ts          通信せずに確かめるテスト(33件)
```

`package.json` は触っていない。`@supabase/supabase-js` は入れていない。

---

## 2. 表の一覧と役割

**名前はすべて `arena_` で始まる。** 既存の `crimon-recovery` のテーブルとは
名前で確実に分かれる。

| 表 | 役割 | 誰が読めるか |
|---|---|---|
| `arena_config` | レート式・コイン・挑戦権などの調整値 | **誰も**(RPCの中だけ) |
| `arena_tiers` | ランク表(`src/data/arena/ranks.ts` の写し) | 全員 |
| `arena_seasons` | シーズン定義。ACTIVE は同時に1つ | 全員 |
| `arena_profiles` | 表示名・アイコン・代表モンスター | 全員(書けるのは自分の2列) |
| `arena_standings` | レート・ランク・戦績(シーズンごと1行) | 全員(**誰も書けない**) |
| `arena_wallets` | アリーナコイン・挑戦権 | **本人だけ**(書けない) |
| `arena_defenses` | 防衛スナップショット(JSONB 1件) | ログイン済み(書けない) |
| `arena_matches` | 対戦履歴。1戦1行 | **自分が関わった行だけ** |
| `arena_season_results` | シーズン締め時点の順位 | ログイン済み |
| `arena_reward_rules` | ランクごとの報酬額 | ログイン済み |
| `arena_reward_claims` | 受取記録。**二重受取を止める本体** | 本人だけ(書けない) |
| `arena_shop_items` | 商品・価格・在庫・購入上限 | 全員(販売中のみ) |
| `arena_shop_purchases` | 購入履歴。上限の検査に使う | 本人だけ(書けない) |

ビュー2つ。どちらも `security_invoker = on`(**見る人の権限で走る**ので、
ビューが RLS の抜け道にならない)。どちらも**開催中のシーズンだけ**を返す。

| ビュー | 中身 | 誰が読めるか |
|---|---|---|
| `arena_public_ranking` | 順位・表示名・レート・ランク・代表モンスター | anon も可 |
| `arena_opponent_pool` | 上記 + **防衛スナップショット** | ログイン済みのみ |

### 列の置き場所が、そのまま「誰に見えるか」

**RLS は行単位でしか効かない。** 公開してよい列と隠す列を同じ表に置くと、
「レートは見せたいがコインは隠したい」が作れなくなる。だから最初から
公開側(`arena_profiles` / `arena_standings`)と本人だけ(`arena_wallets`)を
別の表に分けてある。

同じ理由で、**代表モンスターは `arena_profiles` に置いた。**
最初は防衛スナップショットの表に持たせていたが、それだと
ランキングを見せるために防衛表まで読ませることになり、**編成の中身が
丸ごと公開になる**(手元の検証で anon がランキングを開けず気づいた)。

---

## 3. RLS で防いでいること

3枚重ねで守る。**上から順に、届く前に落ちる。**

1. **GRANT**(列単位まで絞れる唯一の道具)
2. **RLS policy**(触れる行はどれか)
3. **RPC**(値をいくら動かせるか)

具体的に、`anon key` を持った人が PostgREST を直接叩いても次はできない:

| やりたいこと | 何が止めるか |
|---|---|
| `update arena_standings set rating = 9999` | **update の grant が無い**(ポリシー以前) |
| `update arena_wallets set coins = 999999` | 同上 |
| `insert into arena_reward_claims (...)` で報酬を自作 | insert の grant が無い |
| `delete from arena_shop_purchases` で購入上限を消す | delete の grant が無い |
| 他人の防衛編成を書き換える | update の grant が無い |
| 他人のコイン・挑戦権を見る | 本人の行だけのポリシー |
| 他人の購入履歴・受取記録を見る | 本人の行だけのポリシー |
| 他人同士の対戦履歴を見る | `attacker_id = auth.uid() or defender_id = auth.uid()` |
| 調整値(`arena_config`)を読む | **grant もポリシーも無い**(存在しないのと同じ) |
| 他人のプロフィールを書き換える | 自分の行だけのポリシー |
| 自分のプロフィールの隠し列を書く | **列単位の grant**(`display_name` と `icon_key` だけ) |

`enable row level security` は全表。**`force` は付けていない。**
付けると所有者(= `security definer` 関数の実行者)までポリシーに縛られ、
RPC が仕事をできなくなる。

---

## 4. RPC が検証していること

すべて `security definer` + **`set search_path = ''`** + 全参照をスキーマ修飾。
`search_path` を空にしないと、呼ぶ側が自分のスキーマに同名の関数や表を作って
割り込ませ、所有者権限を奪える。

`revoke execute ... from public` を全関数に書き、必要な相手にだけ `grant` している。

### プレイヤーが呼べるもの(`authenticated`)

| 関数 | サーバ側で検証・計算していること |
|---|---|
| `arena_ensure_profile(名前, アイコン)` | `user_id` は**引数で受け取らず** `auth.uid()` から取る。プロフィール・財布・シーズン成績をまとめて用意 |
| `arena_state()` | 自分のレート・コイン・挑戦権。挑戦権の回復は**サーバ時刻**でのみ進む |
| `arena_set_defense(スナップショット)` | JSONBの形(`units` が配列・1〜4体・`version` が数値)、大きさの上限(256KiB)、`capturedAt` を未来に置かせない |
| `arena_report_match(...)` | **下に別項** |
| `arena_claim_weekly_reward()` | 週の区切りを `now()` から出す。金額は `arena_reward_rules`。**二重受取は一意制約**で弾く |
| `arena_claim_season_reward(シーズン)` | シーズンが CLOSED であること、順位が焼かれていること。同じく一意制約 |
| `arena_purchase_shop_item(商品, 個数)` | 販売中か・期間内か・1回の上限・在庫・週/月/通算の購入上限・残高。**引いてから渡す**(同じトランザクション) |
| `arena_ranking_around(誰, 前後何人)` | 読むだけ |

### 対戦結果の記録(`arena_report_match`)

**クライアントが送るのは「誰と」「勝ったか負けたか」だけ。**

- 相手が実プレイヤーなら、相手のレートは**DBの値**を使う(申告は捨てる)
- NPCなら申告を受け取るが、**自分のレート ±300 に丸める**
  (「レート9999のNPCに勝った」で格上ボーナスを作れない)
- 増減幅は `arena_rating_delta`(= `src/data/arena/rating.ts` と同じ式)
- コインは `arena_match_coins`。**金額を送る口が無い**
- 挑戦権を1つ消費する。無ければ `NO_TICKET` で戦績にならない
- 連打よけの最小間隔(既定3秒)
- 自分自身とは戦えない
- 防衛側は増減を**半分**にし、**1日に落ちる量に上限**(既定60)を置く
  ── 寝ている間に順位が溶けないように
- 攻撃側と防衛側の行は**同じ1行**。両方から引ける
- 2人ぶんの行は `user_id` 順に1文で押さえる(**別々に押さえるとデッドロックになる**)

### 運営だけが呼べるもの(`service_role`)

| 関数 | 用途 |
|---|---|
| `arena_grant_coins(誰, いくら)` | 補填。**anon key では届かない** |
| `arena_close_season(...)` | 順位を焼く → CLOSED にする → 次シーズンを開き、レートをソフトリセットして持ち越す |

ソフトリセットは `new = base + round((rating - base) * factor)`。
**全員を base に戻さない。** 戻すと、上まで登った意味が消える。

### 誰も呼べないもの(内部専用)

`arena__config` / `arena__grant_coins` / `arena__refill_tickets`。
とくに `arena__grant_coins` は「コインを増やす」関数そのものなので、
これを誰でも呼べるようにしたら他の検査が全部無意味になる。
**「コイン付与のRPC」を `authenticated` に開けてはいけない。**

---

## 5. 鍵が無い時のクライアントの挙動

`src/net/arenaSync.ts` は次の約束を守る。**これは必須条件。**
いま遊んでいる人は誰も認証を持っていないので、必須依存にすると
**全員がアリーナを開けなくなる。**

| 状況 | 返るもの |
|---|---|
| 環境変数が無い | `arenaSyncAvailable()` が `false`。**通信を1回もしない** |
| 通信が失敗・時間切れ | 既定値(`[]` / `false` / `null`) |
| HTTP が 4xx / 5xx | 既定値 |
| 本文がJSONでない | 既定値 |
| 行が壊れている | **読める行だけ**使い、残りは捨てる |
| 知らないランクID | `BRONZE_3` に寄せる |

**どの関数も例外を投げない。** 「失敗したら例外」にすると、その `try` を
1つ書き忘れた画面が丸ごと落ちる。呼ぶ側は `arenaSyncAvailable()` を見て、
`false` なら NPC 対戦だけで組み立てればよい。

環境変数:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

名前は `ARENA_SYNC_URL_ENV` / `ARENA_SYNC_KEY_ENV` として書き出してある
(散らばらないように)。**`service_role` キーをフロントに置かないこと。**

ログイン後は `setArenaSyncAccessToken(token)` でアクセストークンを渡す。
渡すまでは anon key で投げるので、**書き込み系は必ず失敗する**
(サーバ側で `auth.uid()` が null)。

---

## 6. 手元で確かめたこと

**Supabase ではなく、この作業環境の PostgreSQL 16 に
`auth.uid()` と3つのロールのスタブを作って確かめた。**
Supabase の既定権限を模すため、`alter default privileges ... grant all on
tables to anon, authenticated, service_role` も入れてある
(0002 の `revoke` が効いているかを見るため)。

確かめたこと:

- 3つの migration が**この順で通る**。空のDBに何度流しても同じ結果になる
- `authenticated` から次がすべて `permission denied` になる:
  `arena_standings` の update / `arena_wallets` の update /
  `arena_reward_claims` の insert / `arena_config` の select /
  他人の `arena_defenses` の update / 内部関数4つの execute /
  `arena_close_season` の execute
- 他人の財布が見えない(自分の1行だけ)
- 表示名は自分で直せる。他人の行は0行更新
- `arena_report_match`:同格の勝ちで +15、相手は -5(防衛は半分)
- NPC のレートに 99999 を申告しても、**自分の +300 に丸められた**
  (ratingDelta は +25 で頭打ち、コインも NPC 係数がかかる)
- 週間報酬:1回目 ok、**2回目は `ALREADY_CLAIMED`**
- ショップ:週の上限超過で `OVER_WEEKLY_LIMIT`、1回の個数超過で `OVER_ORDER_LIMIT`
- 対戦履歴が**攻撃側からも防衛側からも1行として引ける**
- 防衛スナップショット:`version` が文字列、`units` が空 → 例外で弾かれる
- `anon` は**ランキングだけ読めて**、対戦候補・防衛・財布・履歴は `permission denied`
- シーズン締め:順位が焼かれ、次シーズンへレートがソフトリセットで持ち越された
  (1040 → 1020、995 → 997)
- **レート式が `src/data/arena/rating.ts` と 924 通りすべて一致**
  (レート800〜2600 × レート差 -600〜+600 × 勝敗)
- **ランク判定が `src/data/arena/ranks.ts` と 429 通りすべて一致**(0〜3000)

`tests/arenaSync.test.ts`(33件)はクライアント層を**通信せずに**確かめる。
とくに次の1件は回帰よけとして残してある:

> `reportArenaMatch` が送る本文の鍵は
> `p_opponent_kind / p_won / p_opponent_id / p_opponent_seed /
> p_opponent_name / p_opponent_rating` の6つだけで、
> **`delta` も `coin` も含まれない。**

---

## 7. 適用したら最初に試すこと

migration を流し、シーズンを1つ開けたうえで、**自分のアカウントで**
次を SQL エディタから実行して、想定どおり弾かれることを確かめてほしい。
(SQL エディタは所有者権限なので、`set local role authenticated` で降りる)

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<自分のuser_id>', true);

-- どれも permission denied になるはず
update public.arena_standings set rating = 9999 where user_id = auth.uid();
update public.arena_wallets    set coins  = 999999 where user_id = auth.uid();
select * from public.arena_config;
rollback;
```

`permission denied` 以外が返ったら、**Supabase の既定権限がスタブと違う。**
その場合は 0002 の `revoke` に足りない行がある(まずそこを疑う)。

---

## 8. 依頼主がやる必要のあること

1. **migration を流す**(`supabase/README.md` の手順)
2. **シーズンを1つ ACTIVE にする。** 無いと対戦もランキングも空のまま
3. **ショップの商品を入れる。** 価格・在庫・上限はDBが唯一の出どころ
4. **上の「7.」の確認を実際に走らせる**
5. **Supabase Auth を入れる。** ここがいちばん大きい。
   いまアプリは Auth を使っておらず(復旧ID + セッショントークン)、
   `auth.uid()` が null のままでは**書き込み系のRPCが全部弾かれる**。
   匿名サインインを入れて、取れたトークンを
   `setArenaSyncAccessToken(token)` に渡すのが最短。
   既存の復旧IDとの紐づけをどうするかは、まだ決めていない
6. `.env`(または配信先の環境変数)に `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` を置く。**`service_role` は置かない**
7. `src/data/arena/rating.ts` の数字を変えたら、
   `public.arena_config` の `rating` も同じ値に直す。
   `src/data/arena/ranks.ts` に行を足したら `public.arena_tiers` にも足す。
   **片方だけ触ると、画面の予告と実際の増減がずれる**
8. シーズンを締める運用(`arena_close_season`)を、Edge Function か
   スケジュール実行のどちらに載せるか決める。`service_role` が要る
