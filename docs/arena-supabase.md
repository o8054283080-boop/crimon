# アリーナのサーバ側(Supabase)

非同期PvPアリーナを Supabase に載せるための設計と、依頼主が自分で適用する手順。

---

## 0. 適用状況

本番 Supabase へ migration を適用し、内部関数を `anon` / `authenticated` が
直接実行できないこと、シーズン更新 Cron とショップ棚が有効なことを確認済み。
手元のテストに加え、本番の Database Advisor でも権限と索引を確認する。

---

## 1. 置いたもの

```
supabase/
  README.md                                        適用手順(短い版)
  migrations/20260902170000_arena_schema.sql       表・索引・制約
  migrations/20260902170100_arena_rls.sql          RLS と権限
  migrations/20260902171818_arena_catalog_*.sql    **生成物**。検分に使うゲーム定義
  migrations/20260902172000_arena_rpc.sql          RPC(security definer)
  migrations/20260902172100_arena_seed.sql         ACTIVE シーズン・棚・報酬額
  migrations/20260902172200_arena_match_integrity.sql  検分と、勝敗のサーバ確定
  migrations/20260903003038_arena_release_safety.sql   シーズン自動更新・週境界・ショップ領収書
  migrations/20260903015014_arena_shop_goals_and_defense_coins.sql  シーズン商品・防衛成功コイン
  migrations/20260903020202_arena_internal_rpc_lockdown.sql  内部RPCの権限閉鎖・必要索引
  migrations/20260903020600_arena_foreign_key_indexes.sql  外部キー用の補助索引
  functions/arena-settle/index.ts                  **勝敗を決める場所**
src/net/arenaAuth.ts             匿名ログイン(GoTrue を素の fetch で)
src/net/arenaSync.ts             クライアント層(素の fetch。SDKは足していない)
tools/exportArenaCatalog.mts     ゲーム定義 → 照合用SQL の書き出し
tests/arenaAuth.test.ts          匿名ログインのテスト(16件)
tests/arenaSync.test.ts          通信せずに確かめるテスト(36件)
tests/arenaCatalog.test.ts       照合表の抜けと上限のテスト(10件)
tests/arenaSecurity.test.ts      守りが書かれているかのテスト(19件)
tests/arenaConfigParity.test.ts  サーバとクライアントの値の一致(13件)
```

`@supabase/supabase-js` は入れていない。`package.json` に足したのは
`build:edge`(Edge Function 向けの組み立て)と `arena:catalog`(照合表の書き出し)の
2つのスクリプトだけ。

### 適用の順番

migration はファイル名の順に流す。**照合表がRPCより先**であること。
RPC は `arena_catalog_*` を読むので、順番が逆だと存在しない表を指す。

### Edge Function を配る

```
npm run build:edge                        # 共有コードを supabase/functions/_shared/ へ
supabase functions deploy arena-settle
```

`_shared/` は生成物なので `.gitignore` に入れてある。**焼き付けると必ず古くなる。**

---

## 1.5 勝敗はどこで決まるか

**クライアントは勝敗を送らない。送る欄が無い。**

```
  クライアント                    Postgres                 Edge Function
  ─────────────────────────────────────────────────────────────────────
  arena_begin_match  ────────▶  挑戦券を1枚引く
                                対戦IDと nonce を作る
                                乱数の種を作る(サーバが決める)
                                相手の編成を控える
                     ◀────────  { matchId, nonce, battleSeed, ... }

  その種で戦闘を再生
  (見せるためだけ)

  arena-settle       ──────────────────────────────────▶  同じ種・同じ編成で
  { matchId, nonce }                                      戦闘を回し直す
                                                          ↓
                                arena_settle_match  ◀──── 出た勝敗で精算
                                (service_role 限定)
                     ◀────────  { won, rating, coins, ... }
```

戦闘エンジンは種を渡せば完全に決定的なので、**画面で見た決着とサーバの
判定が食い違うことはない**(同じ入力から同じ結果しか出ない)。

`arena_report_match`(勝敗の自己申告)は残してあるが、
誰にも `execute` を許していない。呼べば `SELF_REPORT_DISABLED` が返る。
消さないのは、古いクライアントが「関数が無い」で静かに失敗すると
原因が追えなくなるため。

### 残っている限界

攻撃編成の**所有**までは確かめられない。手持ちをサーバへ同期していないので、
「作れるはずの編成」であることまでしか見られない。検分は通るが実際には
持っていない編成で挑むことは、いまの作りでは止まらない。
止めるには手持ちの同期が要る。

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
| `arena_begin_match(...)` | 攻撃編成を検分し、相手・乱数・挑戦券を固定した対戦IDを発行 |
| `arena_claim_weekly_reward()` | 週の区切りを `now()` から出す。金額は `arena_reward_rules`。**二重受取は一意制約**で弾く |
| `arena_claim_latest_season_reward()` | 最新のCLOSEDシーズンをサーバが選ぶ。受取直後の通信断では同じ領収内容を再送 |
| `arena_purchase_shop_item(商品, 個数)` | 販売中か・期間内か・1回の上限・在庫・週/月/通算の購入上限・残高。購入ID付きの領収書を返す |
| `arena_pending_shop_purchases()` | サーバで購入済み・端末で未受取の領収書を本人分だけ返す |
| `arena_ack_shop_purchase(購入ID)` | 端末への付与と保存が終わった本人の領収書だけ受取済みにする |
| `arena_ranking_around(誰, 前後何人)` | 読むだけ |

### 対戦結果の記録(`arena_begin_match` → `arena-settle`)

**クライアントは勝敗を送らない。** 対戦IDとnonceだけを送り、Edge Functionが
発行時の編成と乱数で戦闘を再実行する。

- 相手が実プレイヤーなら、相手のレートと防衛編成は**DBの値**を使う
- NPCは種・不変の生成位置・件数から同じ一覧をサーバで組み直す
- 増減幅とコインはサーバで計算し、クライアントから金額を送る口は無い
- 挑戦権は発行時に1つ消費。シーズン境界で未精算なら次期へ混ぜず返却する
- `arena_report_match` は互換用に名前だけ残し、誰にも実行権限を与えていない
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
(RLSの `revoke` が効いているかを見るため)。

確かめたこと:

- migration が**この順で通る**。空のDBに何度流しても同じ結果になる
- `authenticated` から次がすべて `permission denied` になる:
  `arena_standings` の update / `arena_wallets` の update /
  `arena_reward_claims` の insert / `arena_config` の select /
  他人の `arena_defenses` の update / 内部関数の execute /
  `arena_close_season` の execute
- 他人の財布が見えない(自分の1行だけ)
- 表示名は自分で直せる。他人の行は0行更新
- 週間報酬:1回目 ok、**2回目は `ALREADY_CLAIMED`**
- ショップ:週の上限超過で `OVER_WEEKLY_LIMIT`、月は `OVER_MONTHLY_LIMIT`、
  シーズンは `OVER_SEASON_LIMIT`、1回の個数超過で `OVER_ORDER_LIMIT`
- 防衛成功:1戦4コイン、JSTの1日40コインまで。対戦行へ獲得額を確定し、
  本人が次に状態を取得した時、未受取分だけを財布へ一度だけ移す
- 対戦履歴が**攻撃側からも防衛側からも1行として引ける**
- 防衛スナップショット:`version` が文字列、`units` が空 → 例外で弾かれる
- `anon` は**ランキングだけ読めて**、対戦候補・防衛・財布・履歴は `permission denied`
- シーズン締め:順位が焼かれ、次シーズンへレートがソフトリセットで持ち越された
- **レート式が `src/data/arena/rating.ts` と 924 通りすべて一致**
  (レート800〜2600 × レート差 -600〜+600 × 勝敗)
- **ランク判定が `src/data/arena/ranks.ts` と 429 通りすべて一致**(0〜3000)

**ここまでは、勝敗の確定をサーバへ移す前に確かめたもの。**
移した後の `arena_begin_match` / `arena_settle_match` /
`arena__validate_snapshot` は、**手元のDBでは流し直していない。**
確かめてあるのは、SQLの本文が守りを書いていること
(`tests/arenaSecurity.test.ts` 21件)と、TS側で戦闘が決定的であること
(`tests/arenaMatchIntegrity.test.ts` 12件)まで。

### 通信せずに確かめているもの

| テスト | 件数 | 見ているもの |
|---|---|---|
| `arenaAuth` | 16 | 匿名ログイン。**起動のたびに別人にならない**こと |
| `arenaSync` | 36 | 通信層。**勝敗を送る欄が無い**こと |
| `arenaCatalog` | 10 | 照合表の抜けと、上限が本物の装備を弾かないこと |
| `arenaSecurity` | 21 | 誰が何を呼べるか。鍵がフロントに無いこと |
| `arenaConfigParity` | 13 | サーバとクライアントの値の一致 |
| `arenaMatchIntegrity` | 12 | 画面とサーバが**同じ戦い**を戦うこと |

とくに次の2件は回帰よけとして残してある:

> `arena_begin_match` へ送る本文の鍵は
> `p_opponent_kind / p_attacker_snapshot / p_opponent_id /
> p_opponent_seed / p_opponent_index / p_opponent_count / p_opponent_name`
> だけで、**`won` も `delta` も `coin` も `rating` も含まれない。**

> 同じ種で3回まわして、経過(ログの行数)まで完全に一致する。
> 種を変えると結果が変わる——**つまり種が効いている。**

---

## 7. 適用したら最初に試すこと

migration を流したうえで、**自分のアカウントで**次を SQL エディタから
実行して、想定どおり弾かれることを確かめてほしい。
(SQL エディタは所有者権限なので、`set local role authenticated` で降りる)

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<自分のuser_id>', true);

-- どれも permission denied / 例外 になるはず
update public.arena_standings set rating = 9999 where user_id = auth.uid();
update public.arena_wallets    set coins  = 999999 where user_id = auth.uid();
select * from public.arena_config;
select public.arena_settle_match('00000000-0000-0000-0000-000000000000'::uuid, true);
select public.arena_report_match('NPC', true);
rollback;
```

最後の2つが**通ってしまったら、勝敗を自己申告できる状態**なので、
そこで止めてほしい。

検分が効いているかは、わざと壊した編成で見る:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '<自分のuser_id>', true);

-- ABILITY_POINTS_OVER_BUDGET で弾かれるはず(星3に能力ポイント100)
select public.arena_set_defense('{
  "version":1,"capturedAt":0,
  "units":[{"instance":{"id":"x","dexId":"slime_FIRE","star":3,"level":30,
    "exp":0,"equipment":{},"skillLevels":[1,1,1],
    "development":{"schemaVersion":1,"type":null,
      "abilityPoints":{"hp":100,"atk":0,"def":0,"spd":0},
      "latentAbilityId":null,"latentReselectPending":false}},
    "equipment":[]}]}'::jsonb);
rollback;
```

`permission denied` 以外が返ったら、**Supabase の既定権限がスタブと違う。**
その場合はRLSの `revoke` に足りない行がある(まずそこを疑う)。

---

## 8. 依頼主がやる必要のあること

1. **migration を流す**(`supabase/README.md` の手順)
2. **Authentication → Providers で Anonymous sign-ins を有効にする。**
   これが無いと `auth.uid()` が生えず、書き込み系のRPCが全部弾かれる
3. **Edge Function を配る。** `npm run build:edge` →
   `supabase functions deploy arena-settle`。
   **配らないとオンラインの対戦が1つも精算されない**
4. `.env`(または配信先の環境変数)に `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` を置く。**`service_role` は置かない**
5. **上の「7.」の確認を実際に走らせる**
6. `cron.job` に `crimon-arena-season-rollover` が登録されていることを確認する

シーズンも棚も報酬額も seed に入っているので、**手で入れる作業は無い。**
値を変えたい時は `src/data/arena/` を直して、
`tests/arenaConfigParity.test.ts` が通ることを確かめてから
SQL 側も直す(片方だけ触ると、繋いだ瞬間に数字が飛ぶ)。

モンスターや装備の定義を触った時は、**照合表を作り直す**:

```
npm run arena:catalog
```

忘れると、足したモンスターを使う人だけが防衛を登録できなくなる
(CI の「アリーナの照合表が最新か」がこれを見張っている)。
