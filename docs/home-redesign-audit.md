# CRIMON ホーム UI 刷新 Task A — 現状監査・デザイン仕様・実装計画

> 基準: PR #135 マージ後 `41671048d23e9b16797f87317857498db58db8d4`  
> 対象: iPhone 縦画面を第一優先とするホーム。本文書は設計のみで、production 実装を変更しない。

## 0. 監査条件と結論

- 開始ブランチは `work`、開始 HEAD は指定 SHA と一致、worktree は clean だった。
- remote は設定されていない。したがって開始時の fetch/pull は行っていない。
- 調査対象は `src/web/views/home.ts`、`src/web/style.css`、`src/web/home-theme.css`、`src/web/main.ts`、`src/web/views/bottomNav.ts`、`src/web/icons.ts`、`src/web/three/portrait.ts`、各 view、player/navigation state、既存 JPG asset とした。
- 推奨は **resource/player header → 小型 CRIMON ブランド → 通常ステージ進行 HERO → CURRENT PARTY → 主要カード → 育成・挑戦カード → bottom nav**。現行の「初心者ミッションがすべてに先行」「PARTY の後に HERO」「resource の二重表示」は整理する。
- PR #135 の party card タップ、モンスター詳細、装備変更、編成、`returnContext` は DOM の見た目ではなく callback/state 契約で保護する。

## 1. 参考コンセプト画像の分析と CRIMON への翻訳

### 採用する要素

1. 黒〜濃紺の低輝度背景を大面積に使い、深紫は霧・魔力・選択状態だけに限定する。
2. アンティークゴールドは細線、角金具、見出し、重要 CTA に限定する。面全体を金にしない。
3. 横長の大きな HERO を一つ置き、現在の進行と次の操作を一目で示す。
4. CURRENT PARTY は 4 体を等幅で見せる主要面とし、実際の 3D portrait を利用する。
5. content card の面積差で「進行」「日常導線」「管理」を階層化する。
6. resource header と 5 項目 bottom navigation を固定的なフレームとして扱う。
7. ロゴ、細い装飾線、十分な余白でダークファンタジーの高級感を作る。

### 採用しない要素

- 参考用の架空イベント、クエスト名、通貨、通知、キャラクターは追加しない。
- 参考画像固有の IP、書体、紋章、モンスター造形を複製しない。
- 常時動く大量 particle、過剰な glow、全面金枠、可読性を落とす極細本文は採用しない。
- 画像内の固定数値を焼き込まず、`PlayerState` と既存ゲーム定義を唯一の data source とする。
- portrait を HERO 全面まで引き伸ばさない。192×192 の動的 portrait はカード用途に留める。
- 現在コード上に存在しない「おすすめイベント」は作らない。

## 2. 現在のホーム DOM と機能監査

### 2.1 ルート構造（上から順）

`renderHome(props)` は初回 session のみ title screen を重ね、その下に menu を生成する。

```text
div.screen.home-screen[--menu-only]
├─ section.title-screen                         (初回 session のみ)
│  ├─ forge / arcane rings / motes / ridge / grain / vignette
│  ├─ div.title-screen__logo > inline SVG CREATE MONSTERS
│  └─ button.title-start
└─ div.home-menu[--hidden|--visible]
   ├─ div.home-menu__rings
   ├─ section.reward-banner.compensation        (条件付き)
   ├─ section.reward-banner.login-bonus-banner  (条件付き)
   ├─ section.tutorial-roadmap.panel--ornate
   ├─ div.home-crown
   │  ├─ section.home-id
   │  └─ section.home-wallet
   ├─ section.home-party.panel--ornate
   │  ├─ div.home-mark + 編成 button
   │  └─ div.home-party-grid > 4 button.hp-card
   ├─ button.home-adventure
   ├─ section.home-vitals.panel--ornate
   ├─ section.home-group > div.home-feature-grid (召喚、ショップ)
   ├─ section.home-group > div.home-minor-grid    (6 導線)
   └─ div.home-sheet[hidden]                      (設定)
```

`main.ts` はこの content の外側へ `renderBottomNav(state.screen, navigate)` を追加する。bottom nav は HOME / STAGES / MONSTERS / EQUIPMENT / PARTY の 5 タブである。バックグラウンド周回と初心者ミッションの floating panel も別レイヤーとして root に追加され得る。

### 2.2 section / callback / data source 一覧

| section / class | 現在の表示 | callback / 遷移 | data source | 再利用要素 | iPhone 上の課題 |
|---|---|---|---|---|---|
| Title `.title-screen` | CREATE MONSTERS SVG、START | session flag を立て title を除去 | `sessionStorage` | inline SVG、arcane rings | 初回だけとはいえ全画面。ホーム内の CRIMON branding とは別名・別ロゴ |
| Compensation `.reward-banner` | お詫び本文と配布物 | dismiss（screen 遷移なし） | `compensationClaims` | `icon`、`rewardList` | 複数 claim で高さが可変、above-the-fold を押し下げる |
| Login bonus `.reward-banner` | crystal と節目情報 | dismiss | `loginBonusResult` | 同上 | 同時表示時に主導線が大きく下へ移動 |
| Beginner mission `.tutorial-roadmap` | 30 step、5 chapter details、報酬 | tutorial destination / claim | `PlayerState.tutorialMissions`, `TUTORIAL_MISSIONS` | button/panel | HOME 最上段で全 chapter DOM を常時生成し、最重要 UI を押し下げる。floating panel と情報重複 |
| Player `.home-id` | 先頭 monster portrait、fighter Lv/name/EXP、設定 | rename prompt / settings sheet | fighter fields、`getParty()[0]` | `withPortrait`, `icon` | 小さい Lv・EXP、portrait と wallet が縦積み。header として高さを使い過ぎる |
| Wallet `.home-wallet` | crystal / gold / stamina | なし | `PlayerState` | `currencyChip` | 後段 vitals と crystal/gold/stamina が重複 |
| Current party `.home-party` | 4 枠、属性、星、Lv | occupied: monster detail、empty/編成: PARTY | `getParty(player)`, monster definitions | `homePartyCard`, `partyCardAction`, `withPortrait` | 4 枚×縦長は適切だが 375px では文字と tap affordance が小さい |
| Adventure `.home-adventure` | 固定文言 ADVENTURE | `STAGES` | callback のみ | `icon`、`adventure-bg.jpg` | 158px の大面だが進行状況を出しておらず、毎日見る情報価値が弱い |
| Vitals `.home-vitals` | power、crystal、gold、stamina、回復 | partial/full refill | `PlayerState`, `monsterPower` | `icon` | wallet と重複し、回復 button が狭幅で密集。HERO の直後に重い面が続く |
| Feature `.home-feature-grid` | 召喚 / ショップ | `SUMMON` / `SHOP` | static labels | `renderMenuTile`, existing JPG | 日常優先度に対して 2 枚だけ大きい。shop 更新時刻は「1時間ごと」の固定説明のみ |
| Minor `.home-minor-grid` | 装備/育成/ゴールド dungeon、arena、tower、遊び方 | 各 screen | static labels | `renderMenuTile`, `icon` | 6 枚を 4 列に置くため不揃い。副題非表示、44px target と日本語可読性の余裕が不足 |
| Settings `.home-sheet` | audio、save export/import/restore、build | sheet open/close と各操作 | settings/save state | `renderAudioSettings`, save panel | 正しく退避済み。safe-area と focus management は Task D で確認 |
| Bottom nav `.bottom-nav` | 5 primary tabs | `navigate(screen)` | `TABS` | `icon` | fixed + safe area は実装済み。ホーム CSS と共通 CSS に状態上書きがあり ownership が曖昧 |

### 2.3 CSS と asset の現状

- `index.html` が `home-theme.css` を link し、`main.ts` が `style.css` を import する。ホーム規則が両方にあり cascade の監査が難しい。
- 共通本文 font は `Hiragino Sans` / `Hiragino Kaku Gothic ProN` / `Yu Gothic` / `Noto Sans JP` / system-ui。ADVENTURE は Times New Roman / Hiragino Mincho fallback。
- 既存 asset はすべて軽量 JPG: `home-bg.jpg` 約 40KB、`home-hero.jpg` 約 60KB、`adventure-bg.jpg` 約 32KB、`summon-bg.jpg` 約 20KB、`shop-bg.jpg` 約 20KB、`world-bg.jpg` 約 44KB。
- HOME menu 背景は実際には `style.css` の `.home-menu::before` で `home-hero.jpg` を使用。`adventure-bg.jpg` は adventure card、summon/shop は各 feature card で使用する。
- icon は `src/web/icons.ts` の 24×24、stroke 1.75、`currentColor` の inline SVG で統一され、再利用に適する。

## 3. PR #135 互換性監査

### 3.1 CURRENT PARTY → 詳細

1. occupied `.hp-card` は `partyCardAction(instance, onGoParty, onViewPartyMonster)` を `onclick` に設定する。
2. `partyCardAction` は instance があれば `onMonster(instance.id)`、空なら `onEmpty` を返す。
3. HOME の `onViewPartyMonster` は `state.monsterDetailId = id`、`state.screen = "MONSTERS"`、`render()` を実行する。
4. したがって Task C は **カード全体を button のまま保ち、occupied click に `instance.id` を渡す**。内側に別 button を入れない。

### 3.2 モンスター詳細 → 装備変更

- monster screen は `state.monsterDetailId` を基準に detail を開く。
- 装備枠選択は `handleSelectSlot(monsterId, slot)` が `equipmentPickerContext` を設定して EQUIPMENT へ進む。
- equipped item 詳細は `handleViewEquippedSlot(equipmentId, monsterId)` が `equipmentDetailId` と `equipmentReturnMonsterId` を保持する。
- HOME redesign は `monsterDetailId` を初期化したり、直接 equipment screen へ飛ばしたりしない。

### 3.3 編成と `returnContext`

- HOME の「編成」と empty party card は単純な `navigate("PARTY")`。この入口では `returnContext` は作らない。
- stage / equipment dungeon / level dungeon / gold dungeon / tower からの編成は `openPartyFrom(context, mode)` が選択中 ID、difficulty、floor と label を `returnContext` に保存する。
- PARTY 完了時は context があれば `returnFromParty()` が元 screen と選択を復元し、なければ通常 HOME に戻る。
- navigation state にも `returnContext` が保存・検証される。
- 互換条件: HOME navigate の共通 cleanup、`openPartyFrom`、`returnFromParty`、navigation persistence を Task B/C で変更しない。Task C が party UI callback を rename する場合も `onGoParty` / `onViewPartyMonster(id)` の意味を維持する。

## 4. CRIMON の正式コンテンツ

priority は P0（日常の中核）、P1（主要成長/挑戦）、P2（管理/補助）、P3（結果・戦闘など直接入口不要）。

| 分類 | 正式名称 | screen | callback / 入口 | 現 HOME | 優先度 |
|---|---|---|---|---|---|
| MAIN | 通常ステージ / 冒険 | `STAGES` | `onGoStages` / nav | あり（大） | P0 |
| MAIN | 初心者ミッション | HOME 内 | destination / claim | あり（最上段） | 新規 P0、完了後 P2 |
| MANAGEMENT | パーティ編成 | `PARTY` | `onGoParty` / nav | あり | P0 |
| MANAGEMENT | モンスター | `MONSTERS` | bottom nav | party card 経由＋nav | P0 |
| MANAGEMENT | 装備 | `EQUIPMENT` | bottom nav | nav のみ | P1 |
| SUMMON | 召喚 | `SUMMON` | `onGoSummon` | あり（中） | P1 |
| DUNGEON | 装備ダンジョン | `EQUIP_DUNGEON` | `onGoEquipDungeon` | あり（小） | P1 |
| DUNGEON | 育成ダンジョン | `LEVEL_DUNGEON` | `onGoLevelDungeon` | あり（小） | P1 |
| DUNGEON | ゴールドダンジョン | `GOLD_DUNGEON` | `onGoGoldDungeon` | あり（小） | P1 |
| SPECIAL | 試練の塔 | `TRIAL_TOWER` | `onGoTrialTower` | あり（小） | P1 |
| SPECIAL | アリーナ | `ARENA` | `onGoArena` | あり（小） | P1 |
| COLLECTION | モンスター図鑑 | `MONSTER_DEX` | MONSTERS 内部入口 | 直接なし | P2 |
| GROWTH | モンスター強化 | `MONSTER_TRAINING` | monster detail | 直接なし | P2 |
| GROWTH | モンスタークリエイト / 潜在育成 | `MONSTER_CREATE` | monster detail / tutorial | 直接なし | P2 |
| MANAGEMENT | ショップ | `SHOP` | `onGoShop` | あり（中） | P1 |
| SUPPORT | 遊び方 | `HOW_TO_PLAY` | `onGoHowToPlay` | あり（小） | P2 |
| SUPPORT | 設定・セーブ管理 | HOME sheet | gear callback | あり（sheet） | P2 |
| SYSTEM | 自動周回結果 | `AUTO_FARM_RESULT` | floating status | 条件付き overlay | P1（実行中） |

Battle / result screens はそれぞれの正式 content の子画面であり、HOME card にしない。図鑑、training、create は正式機能だが monster detail からの文脈が重要なため HOME 直リンクを増やさない。

## 5. 推奨情報階層

1. **LEVEL 1 — compact resource/player header（64–72px）**: fighter Lv/name、EXP、stamina、gold、crystal、settings。現在の wallet/vitals 重複をここへ統合する。stamina 回復は chip tap の sheet/popover へ移す候補。
2. **LEVEL 2 — CRIMON branding（34–44px）**: 大型 title screen とは別の compact wordmark。スクロール時は流れてよい。
3. **LEVEL 3 — progress HERO（152–176px）**: 通常ステージの「次に進む」入口。stage name / difficulty / progress を既存 state から取得できる設計にする。
4. **LEVEL 4 — CURRENT PARTY（146–172px）**: 4 portrait と編成 CTA。カード tap は monster detail。
5. **LEVEL 5 — primary content（大型/中型）**: 召喚、3 dungeon、tower、arena、shop。実行中の auto farm は状態 card として優先表示。
6. **LEVEL 6 — guidance/management**: beginner mission は current step のみ compact card、遊び方。monster/equipment/party は bottom nav と重複させない。
7. **LEVEL 7 — fixed bottom nav（64px + safe area）**: 現行 5 項目を維持。

Login/compensation は LEVEL 1 の下に dismissible compact banner として割り込み可能だが、全 content を長期間押し下げない。claim 可能 mission は HERO 上の badge または compact card で通知する。

## 6. HERO 候補比較

5 = 最良。実装容易性は高得点ほど容易。

| 候補 | 視覚 | 代表性 | 毎日価値 | 実装容易性 | 更新性 | 評価 |
|---|---:|---:|---:|---:|---:|---|
| A. 通常ステージ進行 | 4 | 5 | 5 | 5 | 5 | **推奨**。既存 ADVENTURE と callback を置換しやすく、常設の中核 |
| B. 試練の塔 | 5 | 4 | 3 | 4 | 4 | 塔の視覚は強いが、登り切り型で日常の唯一 HERO には弱い |
| C. おすすめ dungeon | 4 | 4 | 5 | 2 | 2 | 3 dungeon の選出規則・unlock/reward 比較が現状なく、架空の推薦ロジックが必要 |
| D. 初心者ミッション | 3 | 3 | 4（序盤）/1（完了後） | 4 | 5 | onboarding 中の差替え候補。恒久 HERO には不適 |

### 最終案

**通常ステージ進行 HERO** を採用する。`onGoStages` をそのまま使用し、将来 Task C で player の clear state と stage definitions から「次の未clear stage」を求める。data の安全な導出が Task C の範囲を超える場合、第一段階は現行 `ADVENTURE / 冒険に出る` のまま visual refresh し、架空進捗は表示しない。試練の塔は最も大きい中型 challenge card とし、塔背景 asset を HERO と呼ばず準主役に使う。

## 7. CURRENT PARTY 仕様

### 表示する

- 4 体の 192×192 generated portrait（`contain`、中央、透明背景）
- 属性: 文字ではなく属性色の小型 gem。accessible name/title には日本語属性名を残す
- `Lv`（tabular number）
- 星: 最大数を小さな 1 行で表示
- 潜在覚醒: **覚醒済みの時だけ**小さな紫 rune 1 個。能力名や段階を常時文字表示しない
- card 全体の button 表現、pressed feedback、明示的 chevron/detail affordance

### 表示しない

- monster name、power、全 stat、装備 6 枠、潜在能力名。4 枚同時では情報過多になる。

### interaction / fallback

- occupied: `partyCardAction` 相当で `onViewPartyMonster(instance.id)`。
- empty: `onGoParty()` と「編成する」。section 右上の編成 CTA も維持。
- portrait bake 前・WebGL unavailable・definition missing は既存 emoji / `❓` と属性色 gradient を使う。
- 192px portrait を 1 CSS px あたり概ね 2 device px を超えて拡大しない。375px では 4 枚の各幅が約 77–80 CSS px なので安全。

## 8. Home card hierarchy

| size | content | 目的 / layout |
|---|---|---|
| Large | 通常ステージ進行 HERO | 全幅、152–176px、唯一の大 CTA |
| Large | CURRENT PARTY（content card ではなく主要 status 面） | 全幅、4 portrait |
| Medium-wide | 試練の塔 | 2 列の幅 2、塔進行を出せる余地 |
| Medium | 装備・育成・ゴールド dungeon | 2 列または horizontal rail ではなく安定した grid |
| Medium | 召喚、ショップ、アリーナ | 画像または icon＋短い status。2 列 |
| Small | 初心者ミッション current step、遊び方 | compact 1 行。完了後は mission を畳む |
| Bottom nav only | モンスター、装備、パーティ | 常設 nav と重複 card を作らない |
| Context only | 図鑑、monster training、monster create | monster screen/detail 内の文脈を維持 |

## 9. Design System（Task B の token 契約）

### Color / effect tokens

| token | value 案 | 用途 |
|---|---|---|
| `--home-bg` | `#05040A` | 最深部の黒 |
| `--home-bg-navy` | `#090D1B` | 背景の濃紺 |
| `--home-surface` | `#100D18` | card 基面 |
| `--home-surface-raised` | `#181126` | selected / raised card |
| `--home-gold` | `#D6B36A` | 重要線・CTA |
| `--home-gold-hi` | `#F2D99B` | highlight（小面積） |
| `--home-gold-muted` | `#806A42` | 非 active 装飾 |
| `--home-purple` | `#6E35A8` | 魔力・覚醒 |
| `--home-purple-glow` | `rgba(151, 74, 226, .34)` | glow |
| `--home-text-primary` | `#F4EFE6` | 本文主色 |
| `--home-text-muted` | `#A59BAF` | 補助文字（contrast 要確認） |
| `--home-border` | `rgba(214, 179, 106, .32)` | 細い金 border |
| `--home-border-subtle` | `rgba(255, 255, 255, .08)` | 通常 card border |
| `--home-shadow` | `0 12px 28px rgba(0, 0, 0, .52)` | raised surface |
| `--home-glow` | `0 0 24px rgba(110, 53, 168, .26)` | purple energy |

色の比率目安は black/navy 78%、surface 15%、gold 4%、purple 3%。紫と金を同じ面積で競わせない。

### Shape / spacing

- radius: `--home-radius-sm: 6px`, `md: 10px`, `lg: 14px`, `pill: 999px`。高級感は過度に丸くせず 6–14px。
- spacing: 4px 基準で `--space-1: 4px`, `2: 8px`, `3: 12px`, `4: 16px`, `5: 24px`, `6: 32px`。
- content gutter: 375–393px は 12px、430px は 16px。section gap 16–20px。
- ornament line: 原則 1px、二重枠は HERO と party のみ。tap target は最低 44×44px。

既存 `--crimon-*`, `--gold-*`, `--panel-*` を即削除せず、Task B では alias を作って段階移行する。他 screen の色を巻き込まないため token scope は `.home-screen` を基本とする。

## 10. Typography

| role | 推奨 |
|---|---|
| CRIMON logo | inline SVG wordmark。serif/display の輪郭を path/controlled SVG text で表現し OS 差を抑える |
| 英字見出し | `Georgia`, `Times New Roman`, `Hiragino Mincho ProN`, serif; 600、0.12–0.20em |
| 日本語見出し | 現行 sans stack、700–800、0.04–0.08em |
| 本文 | 現行 sans stack、400–500、14px 以上、line-height 1.55 |
| resource number | system-ui sans、700、`font-variant-numeric: tabular-nums` |
| monster Lv | system-ui sans、700–800、11–12px（9px 未満禁止） |
| button | 現行 sans、700、12–14px、letter spacing は日本語 0.02–0.05em |

外部 font は追加しない。ネットワーク・FOIT・日本語 subset の容量に対して効果が小さい。ロゴだけ SVG で固有性を作り、通常 UI は端末標準 stack を使う。

## 11. CRIMON logo 3 案

### 案 1 — 金属ゴールド wordmark + 中央紫結晶（最終推奨）

- 長所: 黒/紫/金 palette を一印で示し、既存 title emblem の「中央 core + 左右対称」構造を再利用可能。小型 header に縮小しやすい。
- 短所: 金 gradient と glow が強過ぎると廉価に見える。文字 CRIMON と現在の CREATE MONSTERS ブランド表記の整理が必要。
- asset: 不要。inline SVG を第一選択。
- HTML/CSS/SVG: wordmark、細線、結晶、金 gradient、紫 glow まで可能。
- 画像生成: 不要。背景の質感のみ別 asset が必要なら生成対象。

### 案 2 — 古代紋章 + CRIMON

- 長所: app icon、favicon、badge に展開しやすく、世界観が強い。
- 短所: 小画面で紋章が複雑になりやすく、現在の monster/create の意味が伝わりにくい。
- asset: emblem を SVG 化できれば不要。
- HTML/CSS/SVG: 幾何学的な角、円環、C monogram は可能。
- 画像生成: 複雑な彫金 texture の探索には向くが、最終 logo は手修正 SVG が必要。

### 案 3 — 紫魔力円環 + 金文字

- 長所: animation と相性がよく、既存 arcane rings を利用可能。
- 短所: 円環が占める高さが大きく header 向きでない。常時回転は distraction と電力負荷になる。
- asset: 不要。
- HTML/CSS/SVG: 円環、rune、gradient、低速 transform は可能。
- 画像生成: 不要。

**最終推奨は案 1**。表示文字は product decision として `CRIMON` を主、必要なら `CREATE MONSTERS` を小さな subtitle にする。Task B では既存 title screen を壊さず compact logo component を先に用意する。

## 12. Image asset 計画

| asset | 目的 | 推奨寸法 / ratio | alpha | format | AI 向き | CSS 代替 |
|---|---|---|---|---|---|---|
| `home-background` | 黒濃紺の遠景、紫霧 | 860×1864, 約 9:19.5 | 不要 | WebP | 高 | gradient/noise で仮実装可 |
| `stage-hero-background` | 通常進行 HERO | 1200×520, 30:13 | 不要 | WebP | 高 | 既存 `adventure-bg.jpg` で fallback 可 |
| `tower-card-background` | tower 準主役 card | 800×600, 4:3 | 不要 | WebP | 高 | gradient + tower icon 可 |
| `logo-emblem` | 中央紫結晶 / mark | 256×256, 1:1 | 要 | SVG 推奨 | 低 | **SVG で完全代替** |
| `gold-ornament` | corner/rule | 256×64, 4:1 | 要 | SVG | 低 | border/gradient/pseudo element で代替推奨 |
| `purple-magic-texture` | card 局所 glow | 512×512, 1:1 | 要 | WebP（alpha 対応）/PNG | 中 | radial gradients で大部分代替 |

生成時は文字、既存キャラクター、UI 枠を画像へ焼き込まない。1x/2x の別ファイルを乱造せず responsive crop を設計する。新 asset の採用判断は Task B で既存画像との A/B と容量計測後に行う。

## 13. 既存 monster asset の安全性

- 静的 monster PNG はなく、`MonsterAvatar` を WebGL で 192×192 transparent PNG data URL に bake し cache する。key は template + element で最大 78 通り想定、1 frame 1 体で非同期生成される。
- HOME party では 4 体、約 77–92 CSS px 幅なので 192px source で十分。`background-size: contain` を維持し、`cover` で角・翼・頭を切らない。
- HERO への転用は不可: 192px を 350px 超へ拡大するとぼけ、同じ monster の instance 固有差も portrait key には含まれない。
- WebGL unavailable、bake error、未接続 DOM では既存 emoji が残る。unknown definition は `❓`。fallback の背景に属性色を使うが比率を変形しない。
- portrait の data URL は転送 asset 予算には入らないが、GPU 初期化と PNG memory を伴う。HOME 初回で必要な 4 件以上を先読みしない。

## 14. iPhone 縦画面 layout

### 共通高さ（目安）

| section | 375×812 | 390/393×844/852 | 430×932 |
|---|---:|---:|---:|
| resource/player header | 68px | 68px | 72px |
| compact logo | 36px | 40px | 44px |
| HERO | 152px | 160px | 176px |
| CURRENT PARTY | 150px | 158px | 172px |
| section gaps/padding in first fold | 約 44px | 約 48px | 約 52px |
| bottom nav | 64px + safe area | 同左 | 68px + safe area |
| cards below party | content に応じて scroll | 同左 | 同左 |

### Above the fold

- 375×812: header、logo、HERO 全体、CURRENT PARTY 見出し＋portrait 上部までを見せ、「下にも content がある」cut-off を意図的に残す。
- 390/393: header、logo、HERO、CURRENT PARTY のほぼ全体まで。
- 430×932: CURRENT PARTY 全体と次 section 見出し/最初の card 上端まで。
- login/compensation がある場合は compact banner 分だけ下がることを許容。beginner mission 全 30 step を first fold 前に置かない。
- `100dvh`、`env(safe-area-inset-top/bottom)`、固定 bottom nav に対する bottom padding を維持。landscape/tablet は secondary だが max-width 620px の既存方針を継承する。

## 15. Performance / accessibility 予算

- 初回 HOME の新規 network image 合計: **500KB 以下**（目標 350KB）。
- background: 220KB 以下、stage HERO: 180KB 以下、tower/補助画像: 各 100KB 以下、logo/ornament SVG 合計 30KB 以下。
- 既存含む HOME 装飾 image 合計: 650KB hard cap。AVIF は fallback 管理を増やすためまず WebP。
- above-the-fold asset は background と HERO の 2 request 以内。below-fold card 背景は lazy/deferred decode を検討。
- animation は opacity/transform の CSS のみ、同時常時 animation 3 layer 以下。大量 DOM particle は禁止。
- `prefers-reduced-motion: reduce` で rings/glow/parallax/entry を停止。blur/backdrop-filter は 1–2 fixed surfaces に限定。
- portrait は既存 1 shared WebGL renderer、1 frame 1 bake、HOME は最大 4 件。再レンダーで cache を利用する。
- DOM budget: HOME menu 約 180 element 目標、250 hard cap。閉じた tutorial の全 row 常時生成を避ける。
- tap target 44×44px、focus-visible、button accessible name、主要文字 WCAG AA 4.5:1（大文字 3:1）、装飾は `aria-hidden`。
- font は追加 download 0KB。

## 16. Task B / C / D / E 実装分割

### Task B — Design System / compact logo / asset 基盤

1. `.home-screen` scope の token と reduced-motion baseline を追加。
2. 案 1 の compact CRIMON inline SVG component を独立 file に作成。既存初回 title logo の互換を維持。
3. background/HERO/tower asset の採否、WebP 圧縮、fallback、preload 方針を確定。
4. HOME 専用 style の新しい置き場所を一つ決める。推奨 `src/web/home-theme.css` を owner とし、`style.css` では共通 primitive のみ。
5. DOM layout、callback、main navigation は変更しない。

### Task C — HOME layout / HERO / CURRENT PARTY / cards

1. `HomeProps` の callback 契約を維持して `renderHome` の menu DOM を新階層へ組み替える。
2. resource/player header を統合し重複 vitals を解消。回復操作を失わない。
3. compact logo を配置。通常 stage HERO はまず `onGoStages` を維持し、安全に導出可能な進捗のみ表示。
4. CURRENT PARTY 4 card、empty state、編成 CTA、occupied detail tap を維持。潜在覚醒 badge を optional に追加。
5. 正式 content だけを hierarchy 表に従って配置。`data-tour` の安定 selector を維持/更新する。
6. reward、tutorial current step、settings/save/audio、自動周回 overlay を regression 対象にする。

### Task D — iPhone polish / motion / accessibility / regression

1. 375×812、390×844、393×852、430×932 の screenshot comparison。
2. safe area、長い fighter name、大きい resource number、0/4 party、reward 同時表示、tutorial complete を確認。
3. focus order、keyboard、screen-reader name、contrast、44px target、reduced motion を修正。
4. CSS transform/opacity 中心の restrained animation。layout shift、WebGL fallback、slow asset load を確認。
5. callback/navigation/returnContext の巡回 regression を実施。production feature を追加しない。

### Task E — 最新 main 統合 / final verification

1. 最新 main を取り込み、B→C→D の順で単一系列に統合（並列 cherry-pick を避ける）。
2. conflict は ownership に従い意味ベースで解消し、`HomeProps` と `ScreenName` の upstream 追加を失わない。
3. typecheck、unit tests、build、tour、iPhone screenshots、asset bytes、`git diff --check` を実行。
4. HOME の全 callback、bottom nav、monster detail→equipment、party returnContext、save/settings、reward/tutorial を smoke test。
5. 最終 visual/contrast/performance 調整後に PR。Task E で新規 architecture を始めない。

## 17. ファイル ownership と競合リスク

| file | owner | 他 Task の規則 | risk |
|---|---|---|---|
| `src/web/views/home.ts` | **Task C** | B は変更禁止、D は小規模 a11y fix のみ、E は統合のみ | 最大。DOM/callback が集中 |
| `src/web/home-theme.css` | **Task B（token/asset基盤）→ Task C（layout block）→ Task D（media/a11y）** | 同時編集禁止、必ず直列 | 最大。既存 `style.css` と cascade 重複 |
| `src/web/style.css` | **Task B**（共通 token/primitive の必要最小限） | C は原則変更禁止、D は既存共通 nav 修正が不可避な時のみ | 最大。全 screen に影響 |
| `src/web/main.ts` | **Task C**（props/data wiring が必要な場合のみ） | B/D は変更禁止、E は upstream conflict 解消のみ | 高。巨大 switch と state cleanup |
| `src/web/views/bottomNav.ts` | **Task D**（必要な accessibility polish のみ） | B/C は変更禁止 | 中。screen union / tour selector を壊し得る |
| `src/web/icons.ts` | **Task B**（必要 icon が既存にない場合のみ） | C/D は変更禁止 | 低〜中。union と paths の共有影響 |
| `src/web/views/homeLogo.ts`（新規候補） | **Task B** | C は import/use のみ | 低 |
| `src/web/assets/home-*`（新規/置換候補） | **Task B** | C/D は変更禁止 | binary conflict。命名を先に確定 |
| tests / tour | **Task D** | C は selector 契約を記録、E は実行 | 中 |

**直列順序を B → C → D → E とする。** B と C を並列にしない。特に `style.css` と `home-theme.css` を別々の task が同時に「整理」してはならない。大規模 CSS 移動は刷新と分離し、Task E まで延期する。

## 18. 実装 acceptance checklist

- [ ] 架空 content / currency / event を追加していない。
- [ ] occupied party card が monster detail を開き、empty card と編成 CTA が PARTY を開く。
- [ ] detail から equipment picker/detail が従来通り機能する。
- [ ] dungeon/stage/tower から PARTY を開いた `returnContext` が復元される。
- [ ] HOME から PARTY の通常入口は不要な returnContext を生成しない。
- [ ] summon/stages/3 dungeon/arena/tower/shop/how-to callbacks が残る。
- [ ] 5 bottom tabs と `data-tour` の安定 selector が残る。
- [ ] reward dismiss、tutorial navigate/claim、stamina refill、rename、settings/audio/save/restore が残る。
- [ ] portrait は contain、最大 4 件、emoji fallback。HERO へ拡大しない。
- [ ] 4 iPhone viewport、safe area、reduced motion、contrast、44px target を満たす。
- [ ] image/font/DOM/animation budget を満たす。

## Task A HANDOFF

- **starting main SHA**: `41671048d23e9b16797f87317857498db58db8d4`
- **Task A final SHA**: Task A commit の SHA（commit 後の報告を正とする）
- **採用デザイン**: 黒/濃紺 78%、深紫の局所魔力、細い antique gold。compact resource header → CRIMON logo → 通常 stage HERO → 4-card CURRENT PARTY → 正式 content cards → fixed 5-tab nav。
- **Design System**: `#05040A`, `#090D1B`, `#100D18`, `#181126`, gold `#D6B36A`, muted gold `#806A42`, purple `#6E35A8`, text `#F4EFE6/#A59BAF`; 4px spacing、6/10/14px radius、1px ornament。
- **logo 方針**: 案 1「金属ゴールド CRIMON + 中央紫結晶」の inline SVG。外部 font/生成 bitmap 不要。既存 title screen は B では壊さない。
- **asset 一覧**: optional WebP home background（≤220KB）、stage HERO（≤180KB）、tower card（≤100KB）。logo/gold ornament は SVG/CSS、purple texture は CSS 優先。
- **B が変更すべき file**: `src/web/home-theme.css`（token/asset基盤）、新規 `src/web/views/homeLogo.ts` 候補、必要な HOME asset、必要最小限の `src/web/style.css`/`icons.ts`。
- **B が変更してはいけない file**: `src/web/views/home.ts`, `src/web/main.ts`, `src/web/views/bottomNav.ts`。
- **重要な互換性条件**: `HomeProps` callback、`partyCardAction` → `onViewPartyMonster(id)`、empty/編成 → PARTY、monster detail/equipment state、`openPartyFrom`/`returnFromParty`/`returnContext`、5 bottom tabs、reward/tutorial/stamina/settings/save、自動周回 overlay、portrait contain/fallback を維持する。
