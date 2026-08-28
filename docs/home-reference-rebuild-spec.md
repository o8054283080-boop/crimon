# CRIMON ホーム参考画像再構築仕様（Task A）

## 0. この文書の位置づけ

- 対象は `390 × 844px` の縦持ちホーム。参考画像の左側メイン画面の**色ではなく、占有率・順序・視線誘導・情報密度**を CRIMON に移植する。
- これは Task D の実装契約であり、production code を変更する文書ではない。数値に幅がある場合は、実装はまず中央値を使い、実機で下記の first-view 条件を優先して幅内で調整する。
- 開始点は main `6d2e96d7850ebb5d4625190773727140156cd3c8`（PR #140 merge）。
- 画面の視覚優先度は固定：**CRIMON BRAND → CURRENT PARTY → ADVENTURE / DUNGEON / ARENA → MONSTER / EQUIPMENT / SUMMON / SHOP → TOWER / DEX / HOW TO PLAY / BEGINNER MISSIONS**。

## 1. 参考画像の構造を CRIMON へ置き換える

### 1.1 視線誘導と占有率

1. **PLAYER / RESOURCE HEADER**：誰のデータかと、今使える資源を1枚の帯で読む。ページの主役ではないため画面高の 8〜10%。
2. **CRIMON WORLD / BRAND VISUAL**：アート、大型ロゴ、中央シンボルを一つの世界観表現にする。CTA、進行度、コンテンツ名は入れない。
3. **CURRENT PARTY**：ブランドを受けて現在の4体を一瞬で認識させる。モンスターの顔が最大面積、数値は補助。
4. **PRIMARY CONTENT**：冒険、ダンジョン、アリーナの「今から遊ぶ」3枚。各カードの 40〜60% を画像にする。
5. **MANAGEMENT CONTENT**：モンスター、装備、召喚、ショップの2×2。Primary より低く、まとめて読ませる。
6. **STATUS / SECONDARY INFO**：試練の塔、図鑑、遊び方、初心者ミッション。ステータスは必要なときだけ展開する。資源は header と重複表示しない。
7. **BOTTOM NAV**：現在の遷移契約を維持する fixed navigation。本文の階層には数えない。

### 1.2 情報量が多くても窮屈にしないルール

- セクション間は `12px`、見出しとカードは `6px`、同一 grid 内は `8px` を基本値とする。余白の種類を増やさない。
- 横並びにできる小カードは grid にし、一枚ずつ縦に積まない。一方、Primary は画像の解像度を保つため極端に小さくしない。
- カード内は**画像面とテキスト帯を分離**する。画像の上に長い subtitle を置かない。タイトルは1行、subtitle も1行。
- 主役は写真/アートとモンスター顔。金は輪郭と active のサインに限定し、全面を黄金色にしない。
- 左右 content inset は 390px で `12px`。本文幅 `366px`。セクションごとに別の外側 padding を追加しない。

## 2. 390 × 844 固定ワイヤーフレーム

`y` はスクロール本文先頭（top safe area の直下）からの目安。Bottom nav は別レイヤーで、本文末尾に nav と bottom safe area 分の padding を1回だけ確保する。

```text
┌─ y=0
│ HEADER                                      76px
│  [portrait 52] [name / Lv / EXP] [◇] [G] [STA]
├─ 8px
│ BRAND VISUAL                               180px
│  purple lightning / mist / distant castle
│          [central emblem]
│          [CRIMON large logo]
│  ※ button / progress / content title なし
├─ 12px
│ CURRENT PARTY                              142px
│  heading 22px                     [編成 44×44]
│  [monster][monster][monster][monster]      110px
├─ 12px   y≈430: first view で party 全体が見える
│ PRIMARY CONTENT heading                     22px
├─ 6px
│ [ADVENTURE image 60% | title/subtitle]     108px
├─ 8px
│ [DUNGEON image 55%] [ARENA image 55%]     112px
├─ 12px
│ MANAGEMENT heading                          22px
├─ 6px
│ [MONSTER]   [EQUIPMENT]                     88px
├─ 8px
│ [SUMMON]    [SHOP]                          88px
├─ 12px
│ SECONDARY / STATUS heading                  22px
├─ 6px
│ [TRIAL TOWER compact feature]               76px
├─ 8px
│ [MONSTER DEX] [HOW TO PLAY]                 64px
├─ 8px
│ [BEGINNER MISSIONS progress / details]      72px collapsed
│                                            auto expanded
├─ 24px + nav reservation
└─ document end

fixed BOTTOM NAV: 64px + env(safe-area-inset-bottom)
```

### First view の合格条件

- `390 × 844px` で header、brand 180px、CURRENT PARTY の見出しと4体の**全体**が bottom nav に隠れず見える。「大部分」を最低条件とせず、CRIMON では全体を合格線にする。
- Primary 見出しが first view 下端に少し見えるのは推奨するが、party の高さを削って達成しない。
- brand を `150px` 未満にしない。最大 `210px`。ロゴだけの 84px 帯に戻さない。
- header から Primary までの間に、Trial Tower やその他 CTA を挿入しない。

## 3. セクション別実装仕様

### 3.1 PLAYER / RESOURCE HEADER（72〜80px）

- 1枚の header 内を `player minmax(0, 1fr) / resources auto` の横並びにする。現在のように identity と wallet を縦に2段カード化しない。
- 左：`52px` portrait、名前（1行 ellipsis）、`Lv` と EXP bar。名前編集と設定は 44px tap target を保ちつつ、アイコンを過度に強調しない。
- 右：diamond / gold / stamina を各 `44px` 以上の操作/表示セルにする。数値が長い場合はタブラー数字 + compact notation または ellipsis。
- 高さは 844px の 9.0% 目安。細い金線 `1px`、dark translucent surface。

### 3.2 CRIMON BRAND VISUAL（150〜210px、390px 基準 180px）

- 背景は前景の暗い山/城、中景の霧、後景の紫雷を一枚のアートで統合する。城は背景記号であり Trial Tower の CTA ではない。
- CRIMON logo は中央横幅の `68〜80%`、emblem は logo 後方で直径 `72〜96px`。ロゴの可読性を落とさない範囲で稲妻/霧が重なる。
- セクション全体を button / anchor にしない。CTA、chevron、バッジ、進行度、「試練の塔」は禁止。

### 3.3 CURRENT PARTY（136〜148px）

- 4列固定。カード間 `6px`、390px でカード幅は約 `87px`。空き枠も同じ幅で編成画面へ遷移する。
- 上側 `72〜78px` を monster portrait、下側を element badge / stars / `Lv NN` に使う。モンスターの表情・頭部が切れない `object-fit` と crop を個体ごとに確認する。
- frame は `1px` muted gold + `1px` inner line + dark inset。属性色はバッジ/小さな glow のみで、枠全体を属性色にしない。
- カード tap でモンスター詳細、「編成」は party 画面。既存の `partyCardAction` 契約を保つ。

### 3.4 PRIMARY CONTENT（ADVENTURE / DUNGEON / ARENA）

- 順序は Adventure を全幅1枚、次行に Dungeon / Arena の2列。これにより Adventure を日常進行の入り口にしつつ、3つを同じ第一階層に保つ。
- Adventure `108px`：画像帯 `64px` 目安（59%）。Dungeon / Arena `112px`：画像帯 `62px` 目安（55%）。残りは dark text strip。
- タイトルは HTML/CSS で英字、subtitle は日本語。画像にテキスト、button、ロゴ、数値を焼き込まない。CSS icon だけを visual の代用にしない。
- Arena は現在正式実装済みであり Primary に復帰させる。Summon を Primary に置かない。

### 3.5 MANAGEMENT（MONSTER / EQUIPMENT / SUMMON / SHOP）

- 2×2、各1枚 `88px`、gap `8px`。Primary より面積と明度を一段下げる。
- 画像は 40〜48%、タイトル/subtitle 帯は 52〜60%。カード間で画像高を統一する。
- 図鑑、試練の塔、育成/ゴールドダンジョンを Management grid に混ぜない。後者2つは Dungeon 先のリストで選択できる構造にする。

### 3.6 STATUS / SECONDARY

- **Trial Tower**：`76px` の小型 feature card。Secondary 先頭に1枚。小さな tower art、タイトル、`best floor / next floor` の1行、chevron まで。独立した 248px HERO、大型 h1、大型 CTA、大型 progress bar は使わない。
- **Monster Dex / How to Play**：2列の utility card、高さ `64px`。画像は必須ではなく、既存 icon + dark surface でよい。Primary より border contrast、影、タイトルサイズを下げる。
- **Beginner Missions**：閉じた状態 `72px`。`BEGINNER MISSIONS`、`STEP n / 30`、progress bar、次の目標/受取可サインを表示。`details/summary` で現在の条件、報酬、移動/受取、全30件を展開する。状態と受取機能は削除しない。
- **Resource summary**：本文下部に作らない。gold / crystal / stamina は header だけ。既存 vitals にしかない stamina refill 操作がある場合は header の stamina セルから sheet を開き、資源サマリー自体は重複させない。

### 3.7 BOTTOM NAV

- PR #135 以来の navigation state、項目、ARIA、遷移先を維持する。`position: fixed`、高さ `64px + env(safe-area-inset-bottom)`。
- background `#07070c` 系、top border `1px` muted gold。active の icon/label のみ bright gold、補助的な purple glow。非 active を金にしない。
- 本文 bottom padding は nav 高 + safe area + `24px`。safe area を nav と本文で二重加算しない。

## 4. カードの造形仕様

- outer border：`1px solid rgba(gold, .55)`。Primary の active/focus 時だけ `.8`相当まで。`2px` 以上の黄金枠を全カードに使わない。
- inner line：outer から `3px` 内側に `1px rgba(240,211,139,.18)`。操作を妨げない pseudo element、`pointer-events:none`。
- corner ornament：対角の2箇所のみ、`12〜18px`。大型 brand でも `24px` 以下。全4角を太い飾りで囲まない。
- dark inset：テキスト帯は `#0a0a12` 系、inset shadow `0 1px 0 rgba(255,255,255,.04)` と `0 -6px 12px rgba(0,0,0,.25)` 相当。
- radius：Primary `10px`、Management/Secondary `8px`。参考画像の装飾枠より丸い `16〜18px` カードを新規コンテンツに使わない。
- focus-visible：`2px` purple-bright outline + `2px` offset。色のみに依存せず、既存 label / ARIA name を保つ。

## 5. 375 / 390 / 430px レスポンシブ仕様

| viewport | 左右 inset / content | Party | Primary | Management | Secondary |
|---|---:|---|---|---|---|
| 375px | `10px` / `355px` | 4列維持、gap `4px`、約85px/枚、portrait 70px以上 | Adventure 1列 + Dungeon/Arena 2列。subtitle は ellipsis | 2列維持、gap `6px` | Dex/How to Play 2列。Tower 1列 |
| 390px | `12px` / `366px` | 4列、gap `6px`、約87px/枚 | 1 + 2列、`108/112px` | 2列、`88px` | ワイヤー値どおり |
| 430px | `14px` / `402px` | 4列、gap `8px`、約94px/枚。portrait を横に引き伸ばさない | 1 + 2列維持。カードの高さは増やさない | 2列維持。文字帯に余裕を回す | Dex/How to Play 2列。Tower 1列 |

禁止ブレークポイント：`max-width:374px` で Management や Utility を1列に落とさない。それは参考画像の密度と大きく異なる。375〜430px の3幅で階層と列数は同一にし、inset、gap、画像 crop だけを変える。タップ面積はすべて最小 `44 × 44px`。

## 6. 参考画像 vs 現在の #140 HOME

| 項目 | 参考画像 | 現在（#140） | 問題 | 修正方針 |
|---|---|---|---|---|
| header | portrait/name/Lv/EXP と3資源が高さ8〜10%の1 header | identity の下に wallet が積まれる | ヘッダーが2段で縦を消費 | 76px の1枚・横並びに統合 |
| brand | 城/霧/稲妻/大型ロゴ/シンボルが統合 | 84px に logo + emblem、背景はページ全体の山 | 狭く「ロゴ帯」に留まり世界の顔でない | 180px 独立 art。CTA なし |
| hero | brand 自体が視覚的 hero。機能 hero なし | 248px Trial Tower hero、h1/CTA/progress | 毎回塔がゲーム全体より強く、party を first view 外へ押し出す | 機能 hero を削除。brand に視覚的主役を一本化 |
| party | brand 直下、4体の portrait 主体 | Tower hero の後。実カードは4体だが first view から遠い | 優先度が逆転 | brand 直下、142px、4列固定 |
| primary | Adventure/Dungeon/Arena の大きな画像カード | Adventure/Dungeon/Summon。icon 主体、64〜78px | Arena が secondary、Summon が遊ぶ層に混入、アート不足 | A/D/A、画像40〜60%、1+2 grid |
| management | Monster/Equipment/Summon/Shop の小型4枚 | Monster/Equipment/Dex/Tower/育成D/ゴールドD の6枚 | 管理と遊び/ユーティリティが混在 | M/E/S/S の2×2に固定 |
| tower | 第一階層の上にはない | brand 直下の巨大 hero + Management 内の重複入口 | 過剰強調と重複 | Secondary 先頭 76px の入口1つ |
| tutorial | utility / secondary | Secondary の後だが、現在ミッション本文・報酬・操作を常時表示 | 進行中はパネルが大きい | 72px progress summary + details 展開へ |
| bottom nav | dark surface / thin gold / active gold-purple | 方向は合う。PR #135 navigation 契約あり | 大幅な構造変更は不要 | 項目・ARIA・safe area 維持、visual のみ統一 |

## 7. #140 から残すもの / 削るもの

### 残す（回帰させない）

- 全 interactive element の 44px 最小 tap target、top/bottom safe area、本文の nav 高分予約。
- button の accessible name / ARIA、progressbar の value、装飾層 `pointer-events:none`、keyboard focus-visible。
- `prefers-reduced-motion` で animation / transition を無効化する方針。新たな連続 particle loop は導入しない。
- PR #135 の navigation state と画面遷移契約、bottom nav のみが fixed navigation であること。
- `crimon-logo.svg`、`crimon-emblem.svg`、ロゴの HTML fallback、unknown monster portrait fallback。
- `--crimon-bg / surface / gold / purple / text` 系 visual tokens。役割は維持し、カードごとの独自 gold を増やさない。
- party card の詳細/空き枠遷移、Trial Tower の persisted summary、Beginner Missions の受取/移動/詳細機能。
- login compensation / login bonus の機能。表示時は header 上の dismissible overlay/banner とし、通常時の section 順序は変えない。

### 削除または縮小

- `crimon-hero` の 248px 試練の塔 HERO、大型 CTA、大型 progress bar。
- brand の 84px logo-only 帯と、brand と分離した tower art による世界観の分断。
- Trial Tower の2重入口（hero + Management）。Secondary の1入口だけにする。
- Primary の Summon、Secondary の Arena/Shop。Arena は Primary、Summon/Shop は Management へ移動。
- Management の Monster Dex / Trial Tower / 育成ダンジョン / ゴールドダンジョン。Dex/Tower は Secondary、ダンジョン2種は Dungeon 下へ。
- 本文末尾の重複 resource/vitals summary。refill の機能は header 経由で維持。
- 375px 未満で Management / Utility を1列化するルール。

## 8. アセット監査と gap

### 8.1 最終的に必要な art スロット

| slot | 推奨 source サイズ / crop | テキスト焼き込み | 現状 |
|---|---|---|---|
| Brand background | 860×400 以上、中央 safe 55%、wide crop | なし | **生成推奨** |
| Adventure | 800×480 以上、横長 | なし | `adventure-bg.jpg` を仮再利用可 |
| Dungeon | 640×480 以上 | なし | **不足・生成推奨** |
| Arena | 640×480 以上 | なし | **不足・生成推奨** |
| Monster | 640×360 以上 | なし | **専用 art 不足** |
| Equipment | 640×360 以上 | なし | **専用 art 不足** |
| Summon | 640×360 以上 | なし | `summon-bg.jpg` を仮再利用可 |
| Shop | 640×360 以上 | なし | `shop-bg.jpg` を仮再利用可 |
| Trial Tower | 480×280 以上（右側に塔） | なし | `crimon-tower-hero.svg` を縮小 crop して再利用可 |

### 8.2 repo 内で再利用するアセット

- `crimon-logo.svg`：Brand の正式 logo。UI で例外的にテキストを含む正式ロゴとして維持。カード名には流用しない。
- `crimon-emblem.svg`：Brand 中央シンボル。
- `crimon-corner-ornament.svg` / `crimon-divider.svg`：角装飾と section divider。原寸の大きな金装飾ではなく、上記カード仕様の透明度/大きさに制限する。
- `home-bg.jpg`：紫の山並み/星空で、ページ背景の仮素材には適合。城、稲妻、中央 focus がなく Brand 専用 art としては不足。
- `home-hero.jpg` / `world-bg.jpg`：紫の城/山の雰囲気素材。Brand 生成画の完成まで仮背景または color reference に使える。現状は形が単純で、霧/稲妻/細部の密度が不足。
- `adventure-bg.jpg`：紫の遠景と山。Adventure の仮 art。小サイズで古代遺跡への道がないため最終品は差し替え推奨。
- `summon-bg.jpg` / `shop-bg.jpg`：それぞれ Management の仮 art。Shop は青い山だけで店の識別性が弱いため最終差し替え対象。
- `crimon-tower-hero.svg`：Secondary の小型 tower art に crop して再利用。巨大 HERO には戻さない。
- 既存 monster portrait renderer / fallback：Current Party に維持。新たな固定 portrait セットは不要。

### 8.3 生成推奨アセット（優先順）

すべて**人物名、カード名、UI、ロゴ、数字、文字なし**。重要被写体を外周 10% に置かず、375/390/430px の crop に耐える。

1. **Brand**：暗いファンタジーの山頂城、紫の霧と雲、細い紫雷、黒に沈む前景、中央の logo/emblem 用 negative space、wide composition。
2. **Dungeon**：岩壁の奥に青紫の魔法門、濡れた暗い石床、奥行きのある一点透視、人物なし。
3. **Arena**：暗い円形闘技場、中央床の紋章、観客席は暗闇、紫の火と細い金属装飾、戦闘中の人物なし。
4. **Adventure（差し替え）**：手前から古代遺跡へ続く道、遠景に印象的な目的地、夕紫の空、人物なし。
5. **Monster**：異なる属性のモンスターのシルエット3体、中央の頭部と輪郭を読ませる、名前なし。既存造形と乖離する場合はゲーム内 portrait の composite を優先。
6. **Equipment**：暗い台座上の剣、兜、紫のルーン石、細い金属ハイライト、所有者なし。
7. **Summon（差し替え）**：黒い石の召喚陣と青紫の光柱、周囲の暗い祭壇、召喚された人物なし。
8. **Shop（差し替え）**：暗い店内の陳列棚、小瓶/巻物/コイン、暖かい小さな灯り、店主なし。

Monster / Equipment / Summon / Shop の生成が Task D に間に合わない場合でも、まず Brand / Dungeon / Arena を優先する。Primary の art gap を CSS icon で仮完成としない。

## 9. Task D 受け入れ条件

- [ ] DOM の順番が Header → Brand → Party → Primary → Management → Secondary → Beginner Missions。
- [ ] Brand は 150〜210px、CTA なし、background art + logo + emblem を含む。
- [ ] 390×844 の first view で header / brand / party 4体が nav に隠れず全表示。
- [ ] Primary は Adventure / Dungeon / Arena、Management は Monster / Equipment / Summon / Shop。
- [ ] Primary の各カードで art が高さの40〜60%。カード名は HTML/CSS。
- [ ] Trial Tower は Secondary 先頭の 76px 小型 card のみ。巨大 hero や重複入口なし。
- [ ] Dex / How to Play は2列 utility、Beginner Missions は 72px collapsed + details。受取/移動機能が残る。
- [ ] 重複 resource summary なし。stamina refill は header から到達可能。
- [ ] 375 / 390 / 430px すべてで Party 4列、Primary 1+2、Management 2×2、Utility 2列を維持。
- [ ] カードは1px金縁 + inner line + dark inset。全カードの極太金枠なし。
- [ ] 44px tap target、ARIA name/value、safe area、focus-visible、reduced motion、PR #135 navigation が回帰しない。
- [ ] 375/390/430 の実ブラウザ screenshot を比較し、横はみ出し、テキスト切れ、nav 被り、portrait crop を目視確認。
- [ ] `prefers-reduced-motion: reduce`、keyboard only、長い player/resource 数値、party 空き枠、mission complete/claimable を確認。
- [ ] `npx tsc --noEmit`、ホーム/UX/navigation tests、`git diff --check`、実ブラウザ tour を実行。

---

# TASK A HANDOFF

- **starting main SHA**: `6d2e96d7850ebb5d4625190773727140156cd3c8`
- **final SHA**: Task A commit 後の `git rev-parse HEAD` を PR / handoff メッセージに記載する（本文書自身に commit 前の SHA を焼き込まない）。
- **参考画像との最大差分**: #140 は 84px brand の後に 248px Trial Tower HERO を置き、世界の顔と party を塔の下に退けている。最終仕様は 180px Brand を視覚的 hero にし、Party を直下へ戻す。
- **最終 HOME section 順序**: Header → Brand Visual → Current Party → Primary → Management → Status/Secondary → Beginner Missions → bottom padding（Bottom Nav は fixed）。
- **各 section 高さ目安**: Header 76px / gap 8 / Brand 180px / gap 12 / Party 142px / gap 12 / Primary heading 22 + gap 6 + 108 + gap 8 + 112px / gap 12 / Management heading 22 + gap 6 + 88 + gap 8 + 88px / gap 12 / Secondary heading 22 + gap 6 + Tower 76 + gap 8 + Utilities 64px / gap 8 / Missions 72px collapsed / Bottom Nav 64px + safe area。
- **Trial Tower の最終位置**: Status/Secondary の先頭、76px 小型 feature card。他の入口は置かない。
- **PRIMARY 3カード**: Adventure / Dungeon / Arena。
- **MANAGEMENT 4カード**: Monster / Equipment / Summon / Shop。
- **必要 asset 一覧**: Brand background / Adventure / Dungeon / Arena / Monster / Equipment / Summon / Shop / Trial Tower + CRIMON logo/emblem + runtime monster portraits + frame ornament/divider。
- **再利用 asset 一覧**: `crimon-logo.svg`, `crimon-emblem.svg`, `crimon-corner-ornament.svg`, `crimon-divider.svg`, `crimon-tower-hero.svg`, `home-bg.jpg`, `home-hero.jpg`, `world-bg.jpg`, `adventure-bg.jpg`, `summon-bg.jpg`, `shop-bg.jpg`, 既存 monster portrait/fallback。用途と品質上の制約は §8.2 に固定。
- **生成推奨 asset 一覧**: 最優先 Brand（城+紫霧+紫雷+logo 用中央空間）、Dungeon（青紫の魔法門）、Arena（暗い円形闘技場+紋章）。次に Adventure 差し替え、Monster、Equipment、Summon 差し替え、Shop 差し替え。すべて文字なし。
- **#140 から残すもの**: 44px tap、safe area、ARIA/focus、reduced motion、PR #135 navigation、logo/emblem/fallback、visual tokens、party action、tower persisted summary、missions/bonus の機能。
- **#140 から削るもの**: 巨大 Trial Tower HERO/CTA/progress、Tower 重複入口、84px logo-only brand、Primary の Summon、Secondary の Arena/Shop、Management の Dex/Tower/ダンジョン2種、重複 vitals summary、375px の1列化。
- **iPhone 375/390/430 仕様**: 列構成は全幅共通（Party 4 / Primary 1+2 / Management 2×2 / Utility 2）。inset は 10/12/14px、grid gap は幅に合わせ 4〜8px。高さと階層を不要に変えない。
- **Task D 実装チェックリスト**: §9 の14項目をそのまま acceptance criteria として使う。
