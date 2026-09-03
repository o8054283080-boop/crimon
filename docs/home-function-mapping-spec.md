# CRIMON HOME 機能マッピング・導線設計仕様（Task B）

## 0. 文書の目的と前提

- 監査基準は `main` の **`6d2e96d7850ebb5d4625190773727140156cd3c8`**。参考画像は情報階層だけの参考とし、現行コードにない機能、通知、状態、報酬は作らない。
- 次の実装 Task は原則 `src/web/views/home.ts` と HOME 用 CSS/asset 配置だけを変更する。`PlayerState`、save、battle、shop、summon、party、navigation のロジックは変更しない。
- HOME は既存 state を読む navigation entry とする。表示専用の duplicate state、schema field、永続化キーを追加しない。
- 監査対象は `home.ts`、`main.ts`、`bottomNav.ts`、`crimon-visual-system.css`、`mobile-ux.css`、`home-theme.css`、`style.css`。補助的に `uxHelpers.ts`、`navigationState.ts`、各遷移先 view、`icons.ts`、`playerState.ts` も確認した。

## 1. 現行 HOME の正式 callback 棚卸し

`HomeProps` と `main.ts` の `renderHome` 呼び出しを source of truth とする。分類は**配置上の分類**であり、callback の型や名前は変えない。

| 分類 | callback | 引数 | 現在の処理 / 正式な遷移 |
|---|---|---:|---|
| PRIMARY | `onGoStages` | なし | `navigate("STAGES")`。Adventure |
| PRIMARY | `onGoEquipDungeon` | なし | `navigate("EQUIP_DUNGEON")`。現状の Dungeon 入口候補 |
| PRIMARY | `onGoArena` | なし | `navigate("ARENA")` |
| MANAGEMENT | `onGoMonsters` | なし | `navigate("MONSTERS")`。所持一覧・育成・詳細 |
| MANAGEMENT | `onGoEquipment` | なし | `navigate("EQUIPMENT")` |
| MANAGEMENT | `onGoSummon` | なし | `navigate("SUMMON")` |
| MANAGEMENT | `onGoShop` | なし | `navigate("SHOP")` |
| SECONDARY | `onGoTrialTower` | なし | `navigate("TRIAL_TOWER")` |
| SECONDARY | `onGoMonsterDex` | なし | `navigate("MONSTER_DEX")` |
| SECONDARY | `onGoLevelDungeon` | なし | `navigate("LEVEL_DUNGEON")` |
| SECONDARY | `onGoGoldDungeon` | なし | `navigate("GOLD_DUNGEON")` |
| UTILITY | `onGoHowToPlay` | なし | `navigate("HOW_TO_PLAY")` |
| UTILITY | `onGoTutorialDestination` | `TutorialDestination` | 既存 `goTutorialDestination`。通常は `navigate(destination)`、`MONSTER_CREATE` のみ既存条件分岐 |
| UTILITY | `onClaimTutorial` | mission id | `claimTutorialMission` 成功時だけ save/SFX、その後再描画 |
| MANAGEMENT | `onGoParty` | なし | `navigate("PARTY")`。CURRENT PARTY の空き枠と編成 button |
| MANAGEMENT | `onViewPartyMonster` | instance id | `monsterDetailId=id`、`screen="MONSTERS"`、再描画 |
| SYSTEM | `onDismissCompensation` | なし | HOME の一時表示 claims を空にして再描画 |
| SYSTEM | `onDismissLoginBonus` | なし | HOME の一時表示 result を `null` にして再描画 |
| SYSTEM | `onRefillStaminaPartial` | なし | 既存 refill API、成功時だけ save、再描画 |
| SYSTEM | `onRefillStaminaFull` | なし | 既存 refill API、成功時だけ save、再描画 |
| SYSTEM | `onEditFighterName` | なし | prompt → 既存 setter → save → 再描画 |
| SYSTEM | `audioSettings` | object | audio 値、context state、変更、試聴 callback 一式 |
| SYSTEM | `onExportSave` | なし | 既存 save export |
| SYSTEM | `onImportSave` | `File` | 既存 save import |
| SYSTEM | `onRestoreBackup` | なし | 前回起動時 backup の既存 restore |

`persistState` と `backupAt` は callback ではないが、settings sheet の正式な表示入力なので維持する。`onGoParty` / `onViewPartyMonster` は CURRENT PARTY 専用契約でもあり、Monster management と統合しない。

## 2. 確定 HOME 情報階層

順序は次で固定する。

1. **HEADER** — fighter identity（portrait/name/level/EXP/edit/settings）と crystal/gold/stamina
2. **BRAND** — CRIMON logo/emblem（小さく、機能カードを押し下げない）
3. **CURRENT PARTY** — 4 slots と「編成」
4. **PRIMARY 3** — Adventure / Dungeon / Arena
5. **MANAGEMENT 4** — Monster / Equipment / Summon / Shop
6. **SECONDARY** — Trial Tower / Monster Dex / 育成ダンジョン / ゴールドダンジョン / How to Play
7. **BEGINNER MISSIONS** — compact panel
8. **BOTTOM NAV** — 現行共通 nav（HOME DOM の中へ複製しない）

Compensation と login bonus は見落とされないよう HEADER より前の受け取り帯を維持してよい。settings sheet は DOM 上の末尾でもよいが overlay のままとする。現在の `renderVitals` は crystal、gold、stamina が HEADER と重複するため、次実装では**重複する3値を削除**する。総戦力を残す場合も単独の party 補助値として CURRENT PARTY に寄せ、resource を再掲しない。スタミナ回復操作は失わず、HEADER の stamina chip から開く compact control または CURRENT PARTY 後の小さな control に移す。

## 3. PRIMARY / MANAGEMENT の callback 確定

### PRIMARY 3

| 表示 | callback | 仕様 |
|---|---|---|
| Adventure | `onGoStages` | `STAGES` へ。選択 stage/difficulty を HOME 側で初期化しない |
| Dungeon | **後述の HOME 内 dungeon chooser** | 単一 callback に偽装せず、展開後に `onGoEquipDungeon` / `onGoLevelDungeon` / `onGoGoldDungeon` |
| Arena | `onGoArena` | 常時正式入口として表示。HOME 独自の lock 判定は置かない |

### MANAGEMENT 4

| 表示 | callback | 境界 |
|---|---|---|
| Monster | `onGoMonsters` | 所持一覧・育成の入口。CURRENT PARTY の個体詳細 tap とは別 |
| Equipment | `onGoEquipment` | PR #135 互換の独立 Equipment screen 入口を維持 |
| Summon | `onGoSummon` | HOME から召喚処理はしない |
| Shop | `onGoShop` | HOME から shop rotation/purchase 処理はしない |

## 4. Dungeon の確定仕様

現行 `ScreenName` に dungeon hub はなく、`renderDungeonList` に相当する hub view もない。`views/dungeonList.ts` は3画面が使う**階層 UI helper**であって hub ではない。3種類はそれぞれ `EQUIP_DUNGEON`、`LEVEL_DUNGEON`、`GOLD_DUNGEON` へ直接遷移する。

したがって Dungeon PRIMARY card を `onGoEquipDungeon` へ直接結び、装備ダンジョンだけを総称 Dungeon と見せる案は不採用。新 route や hub screen も今回追加しない。**HOME 内 chooser**を採用する。

- PRIMARY の Dungeon card tap → 同じ section 内の compact 3-choice（装備 / 育成 / ゴールド）を開閉するだけ。
- 各 choice → 順に `onGoEquipDungeon`、`onGoLevelDungeon`、`onGoGoldDungeon`。
- chooser の開閉は永続化しない DOM/UI 状態でよい（game state ではない）。初期表示を3つ併記する実装なら状態自体も不要。
- `selectedDungeonFloor`、`selectedLevelDungeonTier`、`selectedGoldDungeonFloor` を HOME で読み書き・リセットしない。
- 将来正式 hub が追加された場合にのみ Dungeon card をその callback へ一本化する。

SECONDARY には育成・Gold の短い直接入口を残してもよい。PRIMARY chooser と重複しても正式導線であり問題ない。装備 dungeon の duplicate shortcut は不要。

## 5. Arena / Shop / Summon の表示状態

### Arena

Arena は season points/rank、今期戦績、period end、tickets、offense/defense party を遷移先で扱う。コード上、HOME 入口を隠す player-level unlock 条件はない。対戦可否は `arenaTickets > 0` かつ offense team があることを Arena 内 CTA が判定する。従って PRIMARY card は disabled/locked にしない。HOME に season/ticket badge を追加する必要もない。追加するなら既存 `PlayerState` から純粋導出し、Arena 本体と同じ helper を共有する別 Task が必要。

### Shop

Shop の lineup rotation、購入済み slot、slot unlock、購入直後 notice は Shop screen の責務。現 HOME props に shop view/rotation/notice は渡されていないため、Management card は `onGoShop` のみ。更新 dot、NEW、売切 badge は作らない。

### Summon

正式 source は `player.crystal`、`summonScrolls`、各 special scroll、`tutorialSummonDone`。無料なのは `tutorialSummonDone === false` の一度きりの「はじまりの10連」であり、一般的な日次無料召喚ではない。現 HOME に専用 badge 契約はないため card は `onGoSummon` のみとし、「無料」「NEW」dot を新設しない。召喚書数を補足表示する案は既存 player 値から安全に導出可能だが、resource header と競合するため初回実装では表示しない。

## 6. CURRENT PARTY 契約（PR #135 互換）

`getParty(player)` の順序で4枠を描画し、次を厳守する。

1. **occupied slot tap** → `partyCardAction(instance, onGoParty, onViewPartyMonster)` により `onViewPartyMonster(instance.id)` → 該当個体の Monster detail（装備も確認可能）。
2. **empty slot tap** → `onGoParty()` → Party edit。
3. **「編成」button** → `onGoParty()` → Party screen。
4. missing dex master は `❓` / `instance.dexId` fallback のまま click を有効にする。missing instance は empty として扱う。
5. slot callback を全体 card の `onGoParty` で上書きしない。Monster card と Party card の役割を混同しない。

## 7. SECONDARY / UTILITY の配置

| 順序 | 表示 | callback | 表示データ |
|---:|---|---|---|
| 1 | Trial Tower | `onGoTrialTower` | `homeTowerSummary(player)` の最高到達 `bestFloor`、挑戦中なら現在 `floor` / 続行状態 |
| 2 | Monster Dex | `onGoMonsterDex` | 入口だけ。未実装の詳細・達成報酬を予告しない |
| 3 | 育成ダンジョン | `onGoLevelDungeon` | 「経験値」程度の既知用途 |
| 4 | ゴールドダンジョン | `onGoGoldDungeon` | 「ゴールド」程度の既知用途 |
| 5 | How to Play / 遊び方 | `onGoHowToPlay` | guide 入口 |

Trial Tower は巨大 HERO からここへ降格する。`trialTowerBestFloor` と `trialTowerRun` のみを用い、旧 save / malformed 値は既存 `homeTowerSummary` で 0–100F に clamp する。「最高到達 nF」、run があれば「nF 挑戦中」、なければ「次 nF」で十分。tower art は小さな補助 art としてのみ使う。

How to Play は分類上 UTILITY だが視覚上は Secondary grid の末尾でよい。Beginner Missions は Utility card ではなく独立 compact panel とする。

## 8. Beginner Missions 維持条件

次実装は `nextTutorialMission(player)`、`canClaimTutorialMission(player, mission)`、`player.tutorialMissions.claimedIds`、`TUTORIAL_MISSIONS` を引き続き source of truth とし、以下をすべて表示/操作可能にする。

- current mission の step/title、condition、reward、claimed count
- 未達時の「移動する」→ `onGoTutorialDestination(mission.destination)`
- claimable 時だけ「報酬を受け取る」→ `onClaimTutorial(mission.id)`
- 全件 claimed の completed state
- destination の `MONSTER_CREATE` 特例（★6 target があれば ability menu、なければ Monsters）を HOME 側へ複製せず `main.ts` に委譲

compact 化で全30件 details を初期表示する必要はないが、現在の詳細 disclosure を残すか、少なくとも current/complete の情報欠落を起こさない。claim 後の save と SFX は main の callback に委譲する。

## 9. Login / compensation / settings / title

### Login / compensation

- 起動時に `claimDailyLoginBonus` と `claimCompensations` が既に player へ付与し、HOME props は「付与結果の告知」を受け取る。
- `compensationClaims.length > 0` と `loginBonusResult !== null` の banner、reward 内訳、閉じる callback を維持する。
- 閉じるのは一時 UI state の消去であり、再付与や save schema を変更しない。compact 化しても自動 dismiss しない。

### Settings

gear から開く sheet の audio settings（変更・試聴を含む）、save export/import、persist note、backup 時刻/restore、build id、close/scrim を維持する。HOME 上に常設大型 panel として展開しない。fighter name edit は gear と別の pencil action のまま維持する。

### Title screen

- `HOME_STARTED_KEY = "crimon.started"`、`sessionStorage` の `hasStartedHome` / `startHome` を維持。
- 未開始時は title、CRIMON logo/fallback、START を表示。START 後の `title-screen--leaving`、`home-screen--menu-only`、menu visible、scroll top、320ms removal を維持。
- HOME の再配置は title DOM/CSS/transition に触れない。旧 session で started なら menu-only の現挙動を維持。

## 10. Resource header と data 方針

HEADER で既存 helper を再利用する。

- `renderIdentity`: party lead portrait（missing dex fallback）、fighterName、edit、settings、fighterLevel、fighterExp/required EXP、MAX 表示。
- `currencyChip`: crystal、gold、stamina/maxStamina。数値は player から直接読む。
- stamina の ratio、総戦力を表示するなら既存 clamp / `monsterPower` 導出を使う。

値が `NaN`、負数、missing の旧 save は原則 player load migration の責務。HOME helper は tower 同様、progress width や表示計算が DOM/CSS を壊さないよう finite check + clamp を行う。monster/dex が欠落しても portrait fallback で render を継続する。notification 用 field や HOME view model を `PlayerState` に足さない。

## 11. Bottom nav 正式 route

route/label/data-tour を一切変更しない。

| route | label | data-tour |
|---|---|---|
| `HOME` | ホーム | `tab:HOME` |
| `STAGES` | ステージ | `tab:STAGES` |
| `MONSTERS` | モンスター | `tab:MONSTERS` |
| `EQUIPMENT` | 装備 | `tab:EQUIPMENT` |
| `PARTY` | パーティ | `tab:PARTY` |

HOME cards との重複は許容する。Summon、Shop、Dungeon、Arena、Tower、Dex、HowTo を bottom nav に追加しない。

## 12. 参考画像との機能対応

| 参考画像の項目 | CRIMON の正式機能 | 採用 |
|---|---|---|
| Adventure | `STAGES` / `onGoStages` | PRIMARY |
| Dungeon | 3つの独立 dungeon route | PRIMARY chooser + Secondary direct links |
| Arena | `ARENA` / `onGoArena` | PRIMARY |
| Monster | `MONSTERS` / `onGoMonsters` | MANAGEMENT |
| Equipment | `EQUIPMENT` / `onGoEquipment` | MANAGEMENT |
| Summon | `SUMMON` / `onGoSummon` | MANAGEMENT |
| Shop | `SHOP` / `onGoShop` | MANAGEMENT |

参考画像にだけ存在し、正式 callback/state がない guild、mail、quest、イベント、日次無料召喚、card notification/NEW/red dot、統合 dungeon hub 等は**実装しない**。逆に CRIMON 固有の Trial Tower、Monster Dex、Beginner Missions、育成/Gold dungeon、How to Play は前節の位置へ置く。

## 13. Existing asset / icon mapping

| asset | 現状 / 推奨用途 |
|---|---|
| `home-bg.jpg` | HOME 全体背景。`crimon-visual-system.css` で使用中 |
| `home-hero.jpg` | 旧/別 HOME hero 背景として `style.css` に参照あり。新 PRIMARY への転用は絵柄確認後のみ |
| `adventure-bg.jpg` | Adventure card 背景候補。`style.css` で使用中 |
| `summon-bg.jpg` | Summon management card art 候補。`style.css` で使用中 |
| `shop-bg.jpg` | Shop management card art 候補。`style.css` で使用中 |
| `world-bg.jpg` | world/stages 系背景。Adventure の補助候補だが重複利用に注意 |
| `crimon-tower-hero.svg` | 現 Tower HERO art。Secondary の小 art に縮小可。巨大 HERO は禁止 |
| `crimon-logo.svg`, `crimon-emblem.svg` | BRAND/title。既存 onerror fallback を維持 |
| `crimon-divider.svg`, `crimon-corner-ornament.svg` | section 装飾。機能意味を持たせない |
| runtime monster portraits | `withPortrait` + monster master/Three.js 生成。CURRENT PARTY / identity / monster art。静的 portrait files はない |

`icons.ts` には Adventure/map、3 dungeon variants、Arena、Tower、Monster、Equipment、Summon、Shop、Party、resources、settings/info 等が揃う。PRIMARY は画像主体でも icon は aria-hidden の補助として再利用可能。

**不足 asset:** Arena 専用背景、Equipment/Monster 専用 card 背景、3 dungeon を総括する背景（または3種個別背景）、Monster Dex/HowTo の専用 art は存在しない。存在しない art を他機能の画像で誤表示しない。次実装は gradient + existing icon で安全に fallback し、asset 制作は別 Task とする。`home-hero.jpg` の意味を検証せず Dungeon/Arena に流用しない。

## 14. Save / navigation / return context 制約

- `PlayerState` schema、default/migration、save format/version を変更しない。旧 save は現在の load normalization を通した後、そのまま HOME を開けること。
- HOME entry で `returnContext`、`selectedStageId`、`selectedDifficulty`、`selectedDungeonFloor`、`selectedLevelDungeonTier`、`selectedGoldDungeonFloor`、detail ids を初期化しない。
- `DungeonReturnContext` と `restoreDungeonSelection`、`keepReturnContext`、`normalStageReturnContext` を変更しない。Party complete で元 screen と選択値へ戻る現挙動を維持する。
- navigation storage key `crimon.ui.navigation.v1` と `safeRestoredScreen` を変更しない。
- HOME card は必ず既存 callback を呼び、`state.screen` や save を home.ts に複製しない。

## 15. 次実装 Task の test checklist

### Callback / DOM unit contract

- [ ] Adventure tap が `onGoStages` を1回だけ呼ぶ。
- [ ] Dungeon tap が3種を提示し、装備/育成/Gold が対応 callback を1回だけ呼ぶ。
- [ ] Arena tap が `onGoArena` を呼び、ticket/team 不足でも入口は disabled でない。
- [ ] Monster / Equipment / Summon / Shop が各正式 callback を呼ぶ。
- [ ] Tower / Dex / HowTo が各正式 callback を呼ぶ。
- [ ] occupied party slot がその id で `onViewPartyMonster` を呼び、`onGoParty` は呼ばない。
- [ ] empty party slot と編成 button が `onGoParty` を呼ぶ。
- [ ] missing dex / missing tower / invalid numeric input でも render が throw せず、progress が範囲外にならない。
- [ ] tutorial の current condition/reward/destination、claimable claim、completed state が残る。
- [ ] login/compensation banner と各 dismiss が残る。
- [ ] settings の audio/change/test、export/import、persist note、backup restore、build id が残る。
- [ ] resource が HEADER と下部で二重表示されない。stamina refill 操作は残る。

### Integration / regression

- [ ] HOME 7 cards と Secondary の全 route を開き、bottom nav の5 route/label/data-tour が不変。
- [ ] PR #135: party occupied → exact monster detail → back/party の挙動。
- [ ] PR #135: HOME Equipment → Equipment screen、monster equipped-slot / picker flow。
- [ ] PR #135: Stages の selected stage+difficulty → Party → complete で同じ選択へ return。
- [ ] PR #135: Equipment dungeon selected floor → dungeon party → 同じ floor へ return。
- [ ] Level/Gold dungeon の selected tier/floor も Party 後に復元。
- [ ] tutorial destination の `MONSTER_CREATE` 特例と claim 後 save/SFX。
- [ ] first launch title → START transition、同 session の再 HOME、new session の title。
- [ ] login bonus/compensation の付与は一度だけで、banner dismiss が再付与しない。
- [ ] current save export → import、backup restore、main 基準以前の fixture save で HOME render。
- [ ] `npm run typecheck`、`npm test`、`npm run tour`、`npm run build`、`git diff --check`。
- [ ] perceptible UI 実装時は 390px mobile と desktop の screenshot を取得し、PRIMARY 3、CURRENT PARTY、overflow、settings overlay、title を目視確認。

## TASK B HANDOFF

- **starting main SHA:** `6d2e96d7850ebb5d4625190773727140156cd3c8`
- **final SHA:** Task B commit（commit 後に handoff/PR metadata で通知）
- **正式 HOME callback 一覧:** §1 の function callback 24件（navigation/tutorial/party 16件、system操作8件）と `audioSettings` callback 一式。
- **PRIMARY 3:** Adventure=`onGoStages`、Dungeon=HOME 内3択から `onGoEquipDungeon` / `onGoLevelDungeon` / `onGoGoldDungeon`、Arena=`onGoArena`。
- **MANAGEMENT 4:** Monster=`onGoMonsters`、Equipment=`onGoEquipment`、Summon=`onGoSummon`、Shop=`onGoShop`。
- **SECONDARY:** Tower、Dex、育成 dungeon、Gold dungeon、How to Play の順。Beginner は独立 compact panel。
- **Trial Tower 最終位置:** Secondary 先頭。最高到達/挑戦中だけを表示し、巨大 HERO は撤去。
- **Dungeon:** 正式 hub なし。装備だけを代表にせず HOME 内3択。新 route は作らない。
- **CURRENT PARTY:** occupied→specific monster detail、empty→Party、編成→Party。`partyCardAction` 契約を維持。
- **tutorial:** current/condition/reward/destination/claim/completed と `MONSTER_CREATE` 特例を維持。
- **title:** START、`sessionStorage` の `crimon.started`、320ms transition、logo fallback を維持。
- **login/compensation:** 既存付与結果 banner、内訳、manual dismiss を維持し、自動 dismiss/再付与しない。
- **settings:** audio、試聴、name edit、save export/import、persist/backup restore、build id を overlay sheet で維持。
- **existing asset mapping / 不足 asset:** §13。既存7 raster/vector art と ornaments/runtime portrait を用途限定。Arena、Equipment/Monster、Dungeon総括、Dex/HowTo 専用 art が不足。
- **save 互換:** schema/keys/migration を変更せず、既存 player/navigation state のみから描画。旧/malformed tower と missing monster を fallback。
- **PR #135 回帰:** exact monster detail、Equipment screen/picker、Party edit、全 selected stage/difficulty/dungeon selection の returnContext 復元。
- **最終実装 test checklist:** §15 の callback、状態、old save、title、banner、settings、navigation、PR #135、mobile/desktop screenshot をすべて実施。
