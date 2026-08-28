# 潜在能力 BattleEngine 統合（⑧-6B-0）

## 調査結果と統合方針

PR #100 は、216候補の `latentAbilityId` を戦闘定義へ引き渡し、S1のダメージ補正、追加デバフ、回復、シールド、ゲージ、条件付きバフ等を BattleEngine で解決する先行実装だった。しかし未マージのまま基点が古くなり、その後 main に入った再覚醒・再選択、覚醒オーブ、UI、セーブ正規化、EXP、バックグラウンド周回を含んでいないため、そのままの統合はできない。参考にしたのは「保存IDを戦闘用定義へ解決する」「S1使用単位で効果を解決する」「既存の命中・抵抗経路を使う」という境界である。

現在の main には、72体×3件の安定ID付き候補、選択・保存、初回覚醒、再覚醒の支払いと再選択待ち、セーブ正規化、表示までが存在した。一方、`toBattleDefinition` が `latentAbilityId` を戦闘定義へ運ばず、BattleEngine も候補を参照しないため、選択した効果は戦闘では発動しなかった。

今回、現行 main の候補値を変更せず、`data` 層が安定IDリゾルバを `core` 層へ注入し、`toBattleDefinition` が選択済み候補を `MonsterDefinition.latentAbility` に載せるようにした。無効・未知のIDは戦闘効果にならないが、保存されたID自体は変更もリセットもしない。再選択後は次に `toBattleDefinition` を作る戦闘から新IDが解決される。

## BattleEngine の解決

潜在の入口は `BattleEngine.act` のスキル選択後に一つだけ置いた。`skillSlot === 0` かつ実際に選ばれたスキルindexが0のときだけ有効なので、S2/S3には適用されない。前処理では元のSkillを変更せず派生Skillを作り、`DAMAGE_UP`、`CRIT_TRIGGER`、`HP_SCALING`、`DEF_SCALING`、`DEBUFF_CHANCE_UP` をダメージ/既存効果解決へ合成する。

使用後効果は全ヒット・全対象の処理が終了した後、`applyLatentAfterSkill` を一度だけ呼ぶ。したがって多段S1でもヒット数ぶん回復、シールド、ゲージ、バフ、追加デバフが重複しない。クリティカル条件は「そのS1使用中に1回以上クリティカル」、デバフ成功条件も「そのS1使用中に1回以上成功」を集約する。条件付きの我慢/反射はユニットと潜在IDの組で戦闘中1回を記録する。

追加デバフは `rollEffectSuccess` を通し、候補の基礎発動率の後に、現行BattleEngine正式式による術者の命中・対象の抵抗、装備の抵抗無視、抵抗時回復、RESISTイベントを利用する。免疫も既存の `isImmune` で処理する。潜在だから必中にはしない。ゲージ減少は状態異常ではないため、候補の別判定確率を用いる。

対応する現行 `effectType` は次の全12種である。

- `DAMAGE_UP`
- `CRIT_TRIGGER`
- `HP_SCALING`
- `DEF_SCALING`
- `DEBUFF_CHANCE_UP`
- `ADD_DEBUFF`
- `TURN_METER_DOWN`
- `SELF_HEAL`
- `ADD_BUFF`
- `ALLY_SUPPORT`
- `SHIELD`
- `SPECIAL_TRIGGER`

## 現行仕様との互換性

初回覚醒コスト、再覚醒のオーブ/ゴールド費用、再選択待ち、オーブ報酬、UI、PlayerState、セーブ形式には変更を加えていない。旧PR由来の費用・UI・セーブ設計は持ち込んでいない。通常戦闘とバックグラウンド周回の双方が既存の `setupWaveBattle` / `setupDungeonBattle` で `toBattleDefinition` を経由し、最終的に同じBattleEngineを生成するため、周回専用の潜在処理は存在しない。

潜在処理の入口はBattleEngine内の一箇所だけであり、既存mainに別の潜在発動経路がないことも確認した。このためPR #100相当処理との二重発動はない。

## 将来の `effects[]` 拡張

使用前の合成と使用後の「単一潜在効果」解決を分離している。将来候補を `primaryEffect + secondaryEffect` または `effects[]` に移行するときは、S1使用単位で集約した `anyCrit` / `debuffApplied` を維持したまま、各effectについて単一効果関数を反復する。候補選択、安定ID、MonsterInstanceの保存形式、BattleEngineへの入口を変える必要はない。今回は⑧-6A提案の複合効果や強化値を216候補へ適用していない。

## Task B: 宣言的ランタイム拡張

`LatentAbilityCandidate` は従来の安定ID・単一 `effectType` を保持したまま、任意の
`runtimeEffects[]`、`aoeConversion`、部分防御無視、デバフ数ダメージ、耐久補正を持てる。
既存216候補の割り当てや保存形式は変更していない。新しい候補だけ `effectType: "RUNTIME"`
を選べば、ゲージ増減、SPD DOWN、HEAL_BLOCK、STRIP、POISON、STUN、BUFF_BLOCK、
デバフ延長、解除、回復、シールド、継続回復、能力バフを組み合わせられる。

ランタイム入口は全対象・全hitの正式スキル解決が終わった後の一箇所である。
したがって `hits: 3` でも潜在効果の基礎発動は3回にならない。既存スキル自身の
hit/効果解決には手を加えない。STRIPはIMMUNITY判定より前に正式な命中・抵抗経路を
通り、IMMUNITYそのものをBUFFとして解除できる。その後に並べた妨害は通常の免疫、
命中、抵抗規則で解決される。

`aoeConversion` は元が `SINGLE_ENEMY` の場合だけ対象列を敵全体へ展開する。ダメージは
候補固有の `damageMultiplier` を掛け、既存の追加効果は `PRIMARY_ONLY` または副対象の
`secondaryEffectChanceMultiplier` で制限できる。元から `ALL_ENEMIES` の技には倍率も
対象変換も二重適用しない。対象列の先頭には手動選択またはAI選択した主対象を維持する。

部分防御無視は別damage engineを作らず、既存 `calcDamage` が防御計算へ渡す実効防御だけを
`ignoreDefenseRatio` 分減らす。HP/DEF/被ダメージ補正も既存 `BattleUnit`、実効ステータス、
共通ダメージ適用へ合成する。塔の階数を参照する潜在分岐はなく、通常ステージ、ダンジョン、
アリーナ、試練の塔で同じBattleEngine規則になる。
