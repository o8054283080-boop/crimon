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
