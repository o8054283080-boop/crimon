# スキル調整ガイド

**「このスキルの数字を変えたい」と思った時に、最初に読むもの。**

いちばん大事なことを先に書く。

- **ゲーム内の本当の数字は `npm run skills:report` で見る。**定義ファイルを読んで判断しない
  (実行時の差し替えやレベル補正で、定義ファイルの数字とゲーム内の数字が違うことがある。
  クロノスの時空崩壊は `star5.ts` とゲーム内で倍率も確率も違っていた)
- **数字を変える場所は、そのスキルの定義ファイル1か所だけ。**実行時の差し替え(後述)には足さない
- **変えたら `npm run skills:report` をやり直して、差分を読む。**`docs/skills/effective-skills.md` の
  差分が、プレイヤーに届く変化そのもの

---

## 1. スキル定義の場所

| 種族 | ファイル |
|---|---|
| スライム〜ネメシス(★1〜★3の古参12種) | `src/data/monsters.ts` |
| スコーピオン・ハーピー・フェニックス・ジョーカー | `src/data/newMonsters/fourSpecies.ts` |
| ★3 マッシュルン・シェルタートル・コボルト | `src/data/newMonsters/star3.ts` |
| ★4 バジリスク・ミミック・ヴァルキリア・サンダービースト | `src/data/newMonsters/star4.ts` |
| ★5 アビスリーパー・フェンリル・クロノス・ベヒモス | `src/data/newMonsters/star5.ts` |
| クリム | `src/data/newMonsters/crim.ts` |
| コラボ(モッチー・スエゾー・ウンディーネ・グジラ) | `src/data/collabMonsters/*.ts` |
| パッシブの種類と説明文 | `src/core/passive.ts` |
| 効果の型・レベル補正・説明文 | `src/core/skill.ts` |
| 戦闘での処理 | `src/battle/engine.ts` |

スキルIDから定義を探す時は `grep -rn 'id: "slime_s3_a"' src/data` でよい。
`fourSpecies.ts` の一部と `described(...)` で包んだものも、`id:` の行で見つかる。

**スキルが戦闘に届くまでの経路**:

```
定義ファイル(Skill)
  → createMonsterVariant(src/core/monster.ts)……属性ごとに S2/S3 を選び、実行時の差し替えを通す
  → MONSTER_DEX(図鑑)/ findSkillById(継承スキルの参照)
  → computeLeveledSkill(skill, Lv)……Lv1〜5 の実効値
  → applySkillTalents(才能覚醒)→ 戦闘
```

**敵はレベル補正を通らない。**敵として出る時は `skill.effects`(= Lv1)がそのまま使われる。
Lv1 を変えると、ステージ・ダンジョン・遺跡・塔に**敵として出てくる同じ種族も変わる**(後述「15」)。

## 2. 一律成長(generic skill leveling)の仕組み

`levelOverrides` も `passive` も持たないスキルは、`computeLeveledSkill` が一律に伸ばす。

- Lv2〜4: 倍率・回復量・発動率・ゲージ量・シールド量・毒%が **Lv ごとに約6%ずつ**上がる(1.06倍、1.12倍、1.18倍)
- Lv5: **クールタイム -1**、強化・弱体・シールドなどの**持続 +1**
  (スタン・暗闇・火傷・クールタイム延長・保護・クールタイム短縮は伸ばさない)。CT0 のスキル(S1)は Lv5 でさらに +6%
- `maxLevelOverride` を持つスキルは、Lv5 だけ書いた中身に差し替わる

**端数が出る**(0.8倍が 0.85・0.90…ではなく 0.848・0.896…)、**どれが伸びるかを選べない**、
という理由で、2026年10月の調整でほとんどのスキルを次の `levelOverrides` へ移した。
いま一律成長のまま残っているのは19スキル(`npm run skills:report` の「成長: 一律成長」)。

## 3. levelOverrides の使い方

**Lv1〜5 の完成形を5つ並べる。書いたままが起きる。**

```ts
{
  id: "slime_s1",
  name: "たたく",
  description: "ダメージ倍率 1.00倍。【対象】敵単体",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 1 }],          // ← Lv1 と同じ中身(敵はこれを使う)
  levelOverrides: [
    // Lv1
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1 }] },
    // Lv2 ダメージ倍率 1.00倍→1.10倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }] },
    ...                                                    // Lv5 まで
  ],
}
```

- `effects` と `cooldownTurns` は **Lv1 と一致させる**(図鑑の説明文と、敵として出た時の中身がここ)
- `levelOverrides` が上書きするのは `effects` と `cooldownTurns` だけ。対象・追加ターンなどはスキル本体に書く
- **説明文は `describeSkillLines` の出力で始める。**`tests/monsterDescription.test.ts` が突き合わせている。
  後ろに「【対象】敵全体」などの一言を足すのは自由(`described(skill, "一言")` を使うと自動で作れる)
- 各段の上のコメント(`// Lv2 ダメージ倍率 1.00倍→1.10倍`)は `describeSkillGrowth` と同じ書き方にしてある。
  図鑑の「スキルLvで何が変わるか」もこの関数が作る
- **1段につき1つだけ動かす**のが基本。**CT短縮は Lv5 に置く**(`CLAUDE.md`)
- `levelOverrides` を持つ**全体攻撃**の、味方向けの効果(`applyTo` 付き)は、敵を全部殴り終えてから1回だけ配られる

## 4. パッシブのレベル成長

パッシブは `passive: { trigger, levels: [Lv1, Lv2, Lv3, Lv4, Lv5] }` で、**5段の値をそれぞれ書く**
(`passive("ALWAYS", [...])` という書き方もある)。`computeLeveledSkill` はレベルを焼くだけで値には触れない。

- 種類ごとの型と説明文は `src/core/passive.ts`(`PassiveLevelEffect` と `describePassiveLevel`)
- 新しい欄を足したら、`src/core/skill.ts` の `PASSIVE_GROWTH_FIELDS` に名前を付ける
  (付けないと成長表示が「強くなる」としか出ず、`tests/skillGrowthSummary.test.ts` が落ちる)
- 継承(クリエイト)の移し元には出ない

## 5. 実行時の差し替え(legacy override)

**数字を変える時に、ここへ足してはいけない。**

`createMonsterVariant` は、定義ファイルのスキルを図鑑へ入れる直前に、IDを見て中身を差し替える関数を2つ通す。

- `applyLegacySkillBalance`(`src/core/monster.ts`)
- `applySeptemberSkillBalance`(`src/core/skillRebalance.ts`)

昔、属性ごとのスキル割り当てが配列の並び順で決まっていたため、定義を並べ替えずに数字だけ変える手段として使われていた。
**定義ファイルを読んだ人が本番の数字を読み違える**原因なので、2026年10月に整理した。

| 分類 | 件数 | スキル |
|---|---:|---|
| 定義へ統合した(差し替えを撤去) | 24 | slime_s3_a, slime_s3_c, wolf_s3_a, wolf_s3_b, imp_s3_a, imp_s3_b, wisp_s2_b, fairy_s3_c, knight_s3_b, chronos_s3_b(以上 monster.ts)/ golem_s2_c, kobold_s2_b, mushroon_s2_a, mimic_s2_a, behemoth_s2_a, kobold_s3_a, valkyria_s3_b, fairy_s1, mimic_s3_b, golem_s3_c, griffon_s3_c, treant_s2_c, mushroon_s3_dark, kobold_s3_c(以上 skillRebalance.ts) |
| 互換のため残す(統合可能) | 2 | `abyssreaper_s2_c`(S2の多段化が保留のため今回は数字を動かしていない)、`wisp_s3_c`(調整の指定が差し替え前の姿を前提にしていて保留) |
| 現在も必要(統合できない) | 0 | — |

統合した24件は、**差し替え後の値(=それまでのゲーム内の値)を起点に**調整値を決めて定義へ書いたので、
差し替えを外してもゲーム内の数字は下がっていない(`tests/skillTuning.test.ts` が変更前の実効値と照合)。

残る2件を統合する手順:

1. `npm run skills:report -- --overrides` で、差し替え前(定義ファイル)と差し替え後(ゲーム内)を見る
2. 差し替え後の Lv1〜5 を、定義ファイルの `levelOverrides` として書く
3. `skillRebalance.ts` の `case` を消す
4. `npm run skills:report` をやり直し、そのスキルの行が**1文字も変わっていない**ことを確かめる

レポートの各スキルには `実行時の差し替え(legacyOverride): あり/なし` が出る。
「あり」なら、差し替え前(定義ファイルのまま)の Lv1〜5 も折りたたみで並ぶ。

## 6. 光・闇の固有スキル

`lightSkill3` / `darkSkill3` を持つ種族は、光・闇の個体だけ S3 がそれに置き換わる(候補からの抽選より優先)。
レポートでは「(光専用S3)」「(闇専用S3)」と出る。調整する時は候補の S3 とは別のスキルとして扱う。

## 7. 属性ごとのスキル割り当て(skillAssignment)

`skillAssignment: { FIRE: { skill2: 0, skill3: 1 }, ... }` の番号は、`skill2Variants` / `skill3Variants` の**並び順**。
**並びを入れ替えると、既存の個体の S2/S3 が別のスキルに変わる。**候補の並び替え・削除はしない。
`skillAssignment` の無い種族は、属性の並びから決定的に選ばれる(`pickSkillVariant`)。
コラボ4種の並び(`COLLAB_MONSTER_TEMPLATES`)も同じ理由で変えない(潜在覚醒IDがずれる)。

## 8. 多段攻撃と perHitEffects

`DAMAGE` の `hits` が2以上なら多段。`perHitEffects` は**1撃ごとに判定する**効果(バジリスク闇の「1撃ごとに30%ゲージ減・25%スタン」など)。
同じ効果を `effects` 側に書くと**スキル全体で1回**の判定になる。**両者は別物で、書き換えると強さが変わる。**
`levelOverrides` で倍率を変える時も、`perHitEffects` の中身は段ごとに書く。

多段でも1回しか起きないもの(依頼主の指定): ゲージ吸収系のパッシブ(時の管理者・雷の本能)、偽りの財宝(敵1行動につき1回)、
深淵の主のスタック。**死神の収穫だけは例外で、主対象に当たった回数だけ判定する**(2026年10月の指定)。

## 9. 効果の処理順

`effects` は**書いた順に**解決される。順番に意味があるスキルがある:

- 「解除してから殴る」(`STRIP` → `DAMAGE`)と「殴ってから解除」は、シールドへの当たり方が違う
- 「奪ってから殴る」(`STEAL_BUFF` → `DAMAGE` の `stolenBuffBonus`)は、奪った数を見て火力が決まる
- 死の宣告の `buffCountBonus` は**この DAMAGE の直前**に強化を数える。後ろの `STRIP` より前の数
- ウンディーネ光の「解除 → ゲージ減」は順番を保つ(指定)

新しい効果を足す時は末尾へ足す(`levelOverrides` の各段も同じ位置)。途中へ差し込むと処理順が変わる。

## 10. 条件つき防御無視(conditionalIgnoreDefense ほか)

防御無視には書き方が4つある。**条件の外で掛からないこと**を必ず確かめる(`tests/skillTuningBattle.test.ts` のコボルト)。

| 書き方 | 意味 |
|---|---|
| `ignoreDefense: true` | 常に防御100%無視 |
| `ignoreDefenseRatio: 0.25` | 常に防御25%無視 |
| `conditionalIgnoreDefense: { when, ratio }` | 条件(`EFFECT_CONDITION_JA`)を満たす時だけ |
| `targetHpIgnoreDefense: [{ hpRatio: 0.5, ratio: 1 }]` | **攻撃前の**相手HPが50%以下の時だけ(倒した後のHPでは判定しない) |

## 11. ゲージ吸収(gauge drain)

`{ kind: "GAUGE", amount: 0.3, drain: true }` は、相手から減らした分を**そのまま自分へ移す**(相手が0%なら何も得ない)。
普通の `amount: -0.3` は相手を減らすだけ。ゲージは0〜100%で止まるので、-100%を超える指定は -100% と同じ。

## 12. 追加ターン(extraTurn)

| 書き方 | 意味 |
|---|---|
| `extraTurn: true` | 使った直後に必ず追加ターン(サンダービースト「雷獣覚醒」) |
| `extraTurnOnKill: true` | この技で1体でも倒したら追加ターン(何体倒しても1回) |
| `resetCooldownOnKill: true` | 倒したらこの技のCTを戻す |

**追加ターン付きの技には必ずCTを付ける。**CT0だと追加ターンで同じ技を撃ち続け、無限行動になる
(エンジンには連鎖の止め金があるが、それに頼らない)。`tests/skillTuningBattle.test.ts` が雷獣覚醒で確かめている。

## 13. 固定持続(fixedDuration)

`fixedDuration: true` の効果は、一律成長の Lv5 でも持続が伸びない。無敵1ターン・強化阻害1ターンなど、
**短さそのものが強さの釣り合いになっている効果**に付ける。`levelOverrides` で書く時は、そもそも各段に同じターン数を書く。
無敵は1ターンが2ターンになると別物なので、伸ばさない(`CLAUDE.md`)。

## 14. 新しいスキルを追加する手順

1. 種族の定義ファイルへ、Lv1〜5 を `levelOverrides` で書く(手本は `src/data/newMonsters/crim.ts`)
2. 説明文は `describeSkillLines` の出力 + 一言(`described()` を使う)
3. 新しい効果の種類が要るなら、`src/core/skill.ts` の型・説明文・`GROWTH_FIELDS` と、`src/battle/engine.ts` の処理を足す
4. `npm run skills:report` で Lv1〜5 を確かめる
5. `npx tsx tools/monsterDoctor.mts` と、下の「16」を全部通す

## 15. 既存スキルを調整する手順

1. **`npm run skills:report -- --skill <skillId>` で、今のゲーム内の Lv1〜5 を見る**(定義ファイルではなく)
2. `実行時の差し替え: あり` なら、先に「5」の手順で定義へ統合する
3. 定義ファイルの `levelOverrides` を直す。一律成長のスキルなら、今の実効値を起点に5段を書き起こす
4. **Lv1 を変えるなら、敵としての影響を測る。**同じ種族がステージ・ダンジョン・遺跡・塔の敵として出ている
   (`npx tsx tools/towerPressure.mjs`、`npx tsx tools/ruinPressure.ts`、`tests/stageChapterBalance.test.ts`)
5. `npm run skills:report` をやり直し、`docs/skills/effective-skills.md` の差分で**意図した所だけ**変わったか見る
6. プレイヤー向けの変更なので、`src/game/compensation.ts` にお知らせを足す(確率の数値は書かない。スキルの発動%は書いてよい)

大きな調整(複数スキルをまとめて)の時は、2026年10月の調整と同じ道具が使える:

- `tools/skillsReport/tuning/spec.ts` … 指定を Lv1〜5 の列で書く
- `tools/skillsReport/tuning/resolve.ts` … 「ナーフ禁止」「端数は上へ」の規則で最終値を決める
- `tools/skillsReport/tuning/emit.ts` … 決めた値を定義ファイルの `levelOverrides` へ書き込む
- `tools/skillsReport/tuning/summary.ts` … 変更一覧(`docs/skills/tuning-2026-10.md`)を作る

## 16. 調整後に必ず実行するテスト

```
npx tsc --noEmit
npm run build:edge
npx vitest run                       # 特に下の4つ
  tests/skillTuning.test.ts          #   指定値との照合・ナーフなし・ID/属性/並び
  tests/skillTuningBattle.test.ts    #   発動回数(多段・追加ターン・条件外)
  tests/monsterDescription.test.ts   #   説明文と効果の一致
  tests/skillGrowthSummary.test.ts   #   成長表示に名前の無い欄が無いか
npx tsx tools/monsterDoctor.mts
npm run arena:catalog -- --check     # スキルの数値は照合表に入らないが、念のため
npm run skills:report -- --check     # 書き出したレポートが最新か
```

`src/battle` や `src/data` を変えた PR は、マージ時にアリーナの判定サーバが自動で作り直される。

## 17. 実効 Lv1〜5 を確認するコマンド

```
npm run skills:report                          # 全種を docs/skills/effective-skills.{md,json,csv} へ書き出す
npm run skills:report -- --monster chronos     # 1種だけ画面へ
npm run skills:report -- --skill chronos_s3_b  # 1スキルだけ画面へ
npm run skills:report -- --overrides           # 実行時に差し替えられているスキルだけ(差し替え前も並ぶ)
npm run skills:report -- --unique              # 光・闇固有のS3だけ
npm run skills:report -- --check               # 書き出したものが最新か(CI 用)
```

出力の例:

```
#### S3 時空崩壊

- skill ID: `chronos_s3_b` / 属性: 草 / 対象: 敵全体
- 成長: 専用成長(levelOverrides)
- 実行時の差し替え(legacyOverride): なし

| Lv | 実効値 | CT |
|---|---|---|
| Lv1 | ダメージ倍率 1.10倍 / 70%で行動ゲージ-100% / 20%でスタン (1ターン) | CT6 |
| Lv2 | ダメージ倍率 1.20倍 / 80%で行動ゲージ-100% / 25%でスタン (1ターン) | CT6 |
| ...
```

---

## バランスデータの一元化について(検討)

今は「スキル定義」「レベル成長」「実行時の差し替え」が3か所に分かれていた。2026年10月の調整で:

- **実行時の差し替え**は26件 → 2件(残りは理由つきで上の表)
- **レベル成長**は、287スキル中248が定義ファイルの `levelOverrides`(一律成長は19、パッシブは20)

となり、**ほぼ定義ファイル1か所で読める**ようになった。これ以上の一元化(全スキルを1つの表へ移す等)は、
次の理由で今回は行っていない。

- スキルIDは所持モンスター・継承スキル・アリーナの防衛データから参照されている。定義の置き場所を動かすだけでも、
  **参照の取り違えを証明するのに全経路の検査が要る**
- `skillAssignment` と候補の並び、コラボの並びが潜在覚醒IDやセーブデータと結びついている
- 今の形でも `npm run skills:report` が「ゲーム内の数字」を1か所に出すので、読む側の困りごとは解消している

次に進めるなら、残り2件の差し替えを定義へ統合し、`applyLegacySkillBalance` / `applySeptemberSkillBalance` ごと消すのが安全な一歩。
一律成長の19スキルを `levelOverrides` へ書き起こすのも、`tools/skillsReport/tuning/emit.ts` で機械的にできる
(値を変えずに書き起こせば `tests/skillTuning.test.ts` の「完全一致」がそのまま通る)。

---

## 保留事項(2026年10月の調整)

### A. アビスリーパーS2の多段化(依頼で「勝手に決めず候補を出す」とされたもの)

死神の収穫を「主対象に当たった回数だけ判定」にした。ところが S2 は

- 草「冥府の契約」(`abyssreaper_s2_c`): **攻撃をしない**(強化を奪う+ゲージ減+強化阻害+毒)→ 収穫が一度も出ない
- 水「魂の略奪」(`abyssreaper_s2_a`): 1ヒット(1.5倍+解除2個)→ 収穫が1回しか出ない

なので、草・水のアビスリーパーは収穫を活かせる技が S1 と S3 しか無い。候補:

| 案 | 魂の略奪(水) | 冥府の契約(草) | 良い点 | 気になる点 |
|---|---|---|---|---|
| 1 | 0.55倍×3回、解除2個はそのまま(合計1.65倍) | 0.5倍×2回の攻撃を先頭に足す | 両方で収穫が2〜3回。今の役割(奪う・剥がす)を変えない | 冥府の契約が「攻撃しない妨害技」でなくなる |
| 2 | 0.75倍×2回(合計1.5倍で据え置き) | 変えない | 数字の総量を変えずに収穫だけ増える。冥府の契約の性格を守れる | 草は S2 で収穫が出ないまま |
| 3 | 0.55倍×3回 | 1ヒット0.8倍の攻撃を足す | 草も最低1回は収穫が出る | 草の S2 のCTや他の効果との釣り合いを別に見る必要 |

多段化すると**解除の判定は1回のまま**(解除は `effects` 側)にするのが前提。
`perHitEffects` へ入れると解除の回数が増えるので、別の強化になる。

### B. 仕様の前提が今のゲームと食い違っていたもの(数字を動かしていない)

| スキル | 状況 |
|---|---|
| `golem_s3_a` | 「自身にはDEF比例の追加シールドを持たせる方向」は量・持続の指定が無く、防御比例のシールドはエンジンにまだ無い |
| `wisp_s3_c` | 指定(ゲージ35→40→45%)は差し替え前の「味方全体30%」が前提。今のゲーム内は「味方単体80〜100%」 |

`wisp_s3_dark`(ヴォイドシフト)は、会話で「闇S3を完全再設計する」と確定したので、2026-09-26 に
味方単体ゲージ100%+攻撃UP2ターン+自身ゲージ20/25/30/40/40%(Lv5 CT2)へ作り直した。

### C. PvE(敵としての同じ種族)への波及

**敵はスキルの Lv1 をそのまま使う**ので、Lv1 を上げたスキルは敵も強くなる。逆にプレイヤーは Lv5 まで上げるので、
ほとんどの PvE でプレイヤー側の伸びの方が大きい。変更前後の実測は PR の本文にまとめた。
**敵側の再調整は今回していない**(依頼の範囲外で、コンセプトに関わるため)。
