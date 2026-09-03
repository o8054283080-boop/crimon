# Battle Lab

バランス調整のための、**開発専用**の戦闘実験台。

ゲーム本編の画面には一切出ない。管理画面にも出ない。ターミナルからだけ動く道具で、
遊んでいる人のデータには1バイトも触らない。

```
npm run battle:lab -- --scenario tower-60 --runs 1000
```

---

## この道具にダメージ計算は無い

ダメージ式も、会心判定も、命中/抵抗も、行動ゲージも、AIも、**1行も持っていない。**
全部 `src/battle/engine.ts` の仕事で、ここがやるのは

1. シナリオから盤面を組み立てて
2. `BattleEngine` を走らせて
3. 出てきたログと結果を数える

の3つだけ。

**ここへ「Battle Lab専用の簡易計算」を書き始めた瞬間、この道具で測った数字は
本編の数字ではなくなる。** そうなっても誰も気づけないので、
`tests/battleLab.test.ts` が道具側のソースに判定の式が現れていないかを見張っている。

味方は `createMonsterInstance` → 装備 → `toBattleDefinition` という、
**本編がプレイヤーの手持ちを戦闘へ送り出すのと同じ道**を通る。
成長曲線もタイプ補正も能力ポイントもセット効果も潜在覚醒も、ここでは計算していない。

---

## 実行

```bash
# 一覧
npm run battle:lab -- --list

# 1戦だけ、詳しいログつき
npm run battle:lab -- --scenario tower-60 --runs 1 --seed 12345 --verbose

# 1000戦
npm run battle:lab -- --scenario tower-60 --runs 1000 --seed 20260903

# JSONで出して保存
npm run battle:lab -- --scenario tower-60 --runs 500 --json --out

# ボスのスキル3の倍率を並べて見比べる
npm run battle:lab -- --scenario tower-60 --runs 300 --compare boss-s3=3.0,2.8,2.5,2.3

# 狙う順を変えて比べる
npm run battle:lab -- --scenario tower-60 --runs 300 --focus 豪魔人集中
```

### 引数

| 引数 | 意味 |
|---|---|
| `--scenario <id>` | 走らせるシナリオ。既定 `tower-60` |
| `--runs <n>` | 試行回数。既定 1 |
| `--seed <n>` | 乱数の種。**書けば必ず同じ戦いが再現できる。** 書かなければ毎回変わる |
| `--focus <名前>` | 味方AIが狙う順。シナリオの `focusPatterns` から選ぶ |
| `--verbose` | 先頭1戦ぶんの詳しいログを出す |
| `--log-battle <n>` | 先頭 n 戦ぶんの詳しいログを出す |
| `--json` | 集計をJSONで出す |
| `--markdown` | 表で出す(既定) |
| `--out` | `tools/battleLab/results/` へも保存する |
| `--compare <key>=<v1>,<v2>,…` | 1か所だけ変えた盤面を並べて比べる。いまは `boss-s3` のみ |
| `--strict` | 期待範囲を外れたら終了コードを非0にする |
| `--list` | シナリオの一覧 |

**再現性**: 1000戦を `--seed S` で走らせた時の137戦目は、`--seed S+137 --runs 1 --verbose`
でそのまま取り出して眺められる(1戦ごとに `seed + 番号` を使っている)。

---

## シナリオを足す

`tools/battleLab/scenarios/<名前>.ts` を作り、`scenarios/index.ts` へ並べるだけ。

```ts
export const MY_SCENARIO: Scenario = {
  id: "my-fight",
  title: "確かめたいこと",
  note: "何を見るためのシナリオか。読む人のために必ず書く",
  allies: [
    { label: "ドラゴン[火]", templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER" },
  ],
  enemies: [
    {
      label: "検査ボス",
      templateId: "ancient_demon",
      element: "DARK",
      // 最終ステータスを直接置ける。まだ本編に無い階を試すための口
      stats: { hp: 300_000, atk: 6_200, def: 3_800, spd: 165 },
      skills: [/* 本編と同じ Skill 型で書く。解決はエンジンがやる */],
      victoryTarget: true,
    },
  ],
  expect: { minWinRate: 0.6, maxWinRate: 0.85 },
};
```

### 味方に書けるもの

`templateId` / `element` / `preset` / `star` / `level` / `type` / `abilityPoints` /
`skillLevels` / `gear` / `latentIndex` / `statOverrides`

`preset` を書けば下の型紙が入り、**そこへ書いた項目だけが上書きされる。**

### 敵に書けるもの

`templateId` / `element` / `stats`(最終値を直接) / `skills` / `bossTraits` /
`victoryTarget` / `initialCooldowns` / `useDexSkills`

図鑑の敵をそのまま出したい時は `useDexSkills: true` を立てて `stats` を書かない。

---

## 最大強化プリセット

毎回装備6個を手で書くのは現実的でないので、型紙を用意してある。

| 名前 | 中身 |
|---|---|
| `MAX_ATTACKER` | 会心4セット・速度メイン。倒しきる役 |
| `MAX_SUPPORT` | 疾風4セット・速度最優先。開幕に間に合う支え |
| `MAX_HEALER` | 体力4セット。落ちずに回し続ける |
| `MAX_DEBUFFER` | 的中4セット・6枠メインも効果命中。**入れてこその役** |
| `MAX_TANK` | 守護4セット。抵抗を積んで崩されない |
| `MAX_SPEED` | 疾風4セット・速度に全振り。行動順の検証用 |

どれも **★6 / Lv60 / スキル最大 / 能力ポイント100 / タイプ転生済み /
潜在覚醒済み / ★6装備6個を+15まで強化** が入る。

### 理論値ではない

全項目を最大の目で埋めた個体で測ると、**誰も辿り着けない盤面の難易度**を測ることになる。
逆に素の★6で測ると、上級者が来る階が見えない。ここで作るのは
「装備を真面目に集めた人の、良い方の個体」で、サブは役割に合う4項目を素直に選び、
**目そのものは引き直していない。**

### 一部だけ変える

```ts
{ templateId: "dragon", element: "FIRE", preset: "MAX_ATTACKER", statOverrides: { spd: 180 } }
```

---

## 崩れの見張り(回帰基準)

シナリオに `expect: { minWinRate, maxWinRate }` を書いておくと、外れた時に警告が出る。

```
WARN: tower-60 win rate 97.8% is outside expected range 60%-85%
```

**既定では終了コードを落とさない。** 数字を動かしている最中に毎回赤くなると、
警告そのものを見なくなる。CIへ載せる時だけ `--strict` を付ける。

---

## 何に触らないか

`localStorage` / Supabase / プレイヤーの持ち物 / スタミナ / ゴールド / ダイヤ /
ミッション / 試練の塔の進行 / アリーナ —— **どれも読まないし書かない。**

書き込む先は `--out` を付けた時の `tools/battleLab/results/` だけ。
何千回走らせても、遊んでいる人のデータは変わらない
(`tests/battleLab.test.ts` が、道具側のソースにそれらの言葉が出ていないことも見張っている)。

## 速さ

1戦あたりおよそ2.5ms。**1000戦で2.6秒**(実測)。
描画もアニメーションも `setTimeout` も通らず、ロジックだけが回る。
戦闘は必ずターン上限(既定300)で止まるので、無限には走らない。
