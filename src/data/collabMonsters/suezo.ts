import { MonsterTemplate } from "../../core/monster.js";
import { Skill } from "../../core/skill.js";
import { ATK_DOWN, CRI_RATE_UP, DEF_DOWN, SPD_DOWN } from "../../core/statusValues.js";
import { passive } from "../newMonsters/shared.js";
import { described, fromStar6Lv60 } from "./shared.js";

/**
 * ★4 スエゾー。**デバッファー / 妨害型のコラボモンスター。**
 *
 * この種族の仕事は削ることではなく、**相手の手番を遅らせ続けること**。
 * 全スキルが行動ゲージへ触り、命中が全モンスター中でも高い(32%)。
 * 妨害は当たらなければ何も起きないので、素の命中がそのまま働きになる。
 *
 * ## ★6 Lv60 の到達値(属性補正前)
 *
 *   HP 13,900 / 攻撃 1,980 / 防御 1,180 / 速度 102
 *   クリ率 20% / クリダメ +58% / 命中 32% / 抵抗 18%
 *
 * 防御が低く、HPも★4としては薄い。**前に立つ種族ではない。**
 */

/**
 * S1「つばはき」。**当てるたびに攻撃を削り、手番を遠ざける。**
 *
 * CTの無いスキル1に妨害を2つ載せてある。倍率は低いが、
 * **毎ターン撃てる**ことがこの種族の妨害量を作っている。
 */
const SUEZO_S1: Skill = described({
  id: "suezo_s1",
  name: "つばはき",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    { kind: "DAMAGE", multiplier: 0.75 },
    { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 },
    { kind: "GAUGE", amount: -0.2, chance: 0.7 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.75 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }, { kind: "GAUGE", amount: -0.2, chance: 0.7 }] },
    // Lv2 ダメージ倍率 0.75倍→0.85倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.6 }, { kind: "GAUGE", amount: -0.2, chance: 0.7 }] },
    // Lv3 弱体の発動率 60%→70%
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }, { kind: "GAUGE", amount: -0.2, chance: 0.7 }] },
    // Lv4 行動ゲージの発動率 70%→80%
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.85 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }, { kind: "GAUGE", amount: -0.2, chance: 0.8 }] },
    // Lv5 ダメージ倍率 0.85倍→1.10倍
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.7 }, { kind: "GAUGE", amount: -0.2, chance: 0.8 }] },
  ],
}, "【対象】敵単体。クールタイムが無いので毎ターン撃てる。妨害の量はこのスキルで稼ぐ。");

/**
 * S2候補A「キッス」。**手番を大きく奪い、その相手を狙い撃ちやすくする。**
 *
 * 被クリ率UPは「相手が受ける会心率が上がる」デバフ。
 * 自分の火力は低いので、**味方のアタッカーに撃たせるための下拵え**になる。
 */
const SUEZO_S2_KISS: Skill = described({
  id: "suezo_s2_kiss",
  name: "キッス",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 4,
  effects: [
    { kind: "DAMAGE", multiplier: 1.7 },
    { kind: "GAUGE", amount: -0.35, chance: 0.9 },
    { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2 },
    { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.7 }, { kind: "GAUGE", amount: -0.35, chance: 0.9 }, { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true }] },
    // Lv2 ダメージ倍率 1.70倍→1.90倍
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.9 }, { kind: "GAUGE", amount: -0.35, chance: 0.9 }, { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true }] },
    // Lv3 ダメージ倍率 1.90倍→1.85倍 / 行動ゲージの発動率 90%→100%
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.85 }, { kind: "GAUGE", amount: -0.35, chance: 1 }, { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true }] },
    // Lv4 持続 2→3ターン
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 1.85 }, { kind: "GAUGE", amount: -0.35, chance: 1 }, { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true }] },
    // Lv5 クールタイム -1(4→3ターン)
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.85 }, { kind: "GAUGE", amount: -0.35, chance: 1 }, { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 3 }, { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, fixedDuration: true }] },
  ],
}, "【対象】敵単体。防御低下は2ターン固定。狙った1体を味方のアタッカーが落としやすい状態にする。");

/**
 * S2候補B「テレパシー」。**味方の会心を上げ、相手を会心されやすくする。**
 *
 * 上げる側と下げる側の両方を1手で作る。
 * S2の中では唯一の**味方支援**で、アタッカーと組ませる時に選ぶ。
 */
const SUEZO_S2_TELEPATHY: Skill = described({
  id: "suezo_s2_telepathy",
  name: "テレパシー",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 4,
  effects: [
    { kind: "DAMAGE", multiplier: 2.0 },
    { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2, applyTo: "ALLIES" },
    { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.75 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.75 },
      ],
    },
    // Lv2 倍率 2.00 → 2.20
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.75 },
      ],
    },
    // Lv3 被クリ率UP 75% → 85%
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.85 },
      ],
    },
    // Lv4 味方のクリ率UP 2ターン → 3ターン
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "ALLIES" },
        { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.85 },
      ],
    },
    // Lv5 CT4 → CT3
    {
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 2.2 },
        { kind: "BUFF", stat: "criRate", amount: CRI_RATE_UP, durationTurns: 3, applyTo: "ALLIES" },
        { kind: "STATUS", status: "CRIT_RATE_UP", durationTurns: 2, chance: 0.85 },
      ],
    },
  ],
}, "【対象】敵単体＋味方全体。味方の会心率を上げつつ、狙った相手を会心されやすくする。");

/**
 * S2候補C「サイコキネシス」。**全体を遅らせる。**
 *
 * 単体を止める2つと違い、こちらは**全員の手番を後ろへずらす**。
 * 1体あたりの効き目は小さいが、次のターンが自分に回りやすくなる。
 */
const SUEZO_S2_PSYCHO: Skill = described({
  id: "suezo_s2_psychokinesis",
  name: "サイコキネシス",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.35 },
    { kind: "GAUGE", amount: -0.3, chance: 0.6 },
    { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.75 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.35 }, { kind: "GAUGE", amount: -0.3, chance: 0.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.75 }] },
    // Lv2 ダメージ倍率 1.35倍→1.50倍
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.5 }, { kind: "GAUGE", amount: -0.3, chance: 0.6 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.75 }] },
    // Lv3 ダメージ倍率 1.50倍→1.45倍 / 行動ゲージの発動率 60%→70%
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.45 }, { kind: "GAUGE", amount: -0.3, chance: 0.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 1, chance: 0.75 }] },
    // Lv4 弱体の持続 1→2ターン
    { cooldownTurns: 3, effects: [{ kind: "DAMAGE", multiplier: 1.45 }, { kind: "GAUGE", amount: -0.3, chance: 0.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }] },
    // Lv5 クールタイム -1(3→2ターン)
    { cooldownTurns: 2, effects: [{ kind: "DAMAGE", multiplier: 1.45 }, { kind: "GAUGE", amount: -0.3, chance: 0.7 }, { kind: "DEBUFF", stat: "atk", amount: ATK_DOWN, durationTurns: 2, chance: 0.75 }] },
  ],
}, "【対象】敵全体。全員の手番を後ろへずらすので、自分の次の番が回りやすくなる。");

/**
 * S3候補A「歌う」。**3つの妨害を、それぞれ別に判定する。**
 *
 * 防御DOWN・ゲージ低下・クールタイム延長は**独立して**判定する
 * (どれか1つが通れば他も通る、という作りにしない)。
 * 3つまとめて通ると相手の1ターンが丸ごと消えるので、
 * 「全部通る」を確率の掛け算にしてある。
 */
const SUEZO_S3_SING: Skill = described({
  id: "suezo_s3_sing",
  name: "歌う",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 6,
  effects: [
    { kind: "DAMAGE", multiplier: 1.8 },
    { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 1, chance: 0.8 },
    { kind: "GAUGE", amount: -0.6, chance: 0.8 },
    { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 1.8 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.6, chance: 0.8 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
      ],
    },
    // Lv2 倍率 1.80 → 2.00
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 1, chance: 0.8 },
        { kind: "GAUGE", amount: -0.6, chance: 0.8 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.8 },
      ],
    },
    // Lv3 3つの発動率 80% → 85%
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 1, chance: 0.85 },
        { kind: "GAUGE", amount: -0.6, chance: 0.85 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 },
      ],
    },
    // Lv4 防御DOWN 1ターン → 2ターン
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 },
        { kind: "GAUGE", amount: -0.6, chance: 0.85 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 },
      ],
    },
    // Lv5 CT6 → CT5
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 2.0 },
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85 },
        { kind: "GAUGE", amount: -0.6, chance: 0.85 },
        { kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.85 },
      ],
    },
  ],
}, "【対象】敵全体。3つの妨害はそれぞれ別に判定するので、全部通るとは限らない。");

/**
 * S3候補B「食う」。**手番を奪って自分のものにし、削ったぶんだけ回復する。**
 *
 * ゲージは**吸収**(`drain`)。減らした分がそのまま自分へ移るので、
 * 単に遅らせるより一手ぶん得をする。
 */
const SUEZO_S3_EAT: Skill = described({
  id: "suezo_s3_eat",
  name: "食う",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 3.8 },
    { kind: "GAUGE", amount: 0.5, chance: 0.8, drain: true },
    { kind: "LIFESTEAL", healRate: 0.3 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.8 }, { kind: "GAUGE", amount: 0.5, chance: 0.8, drain: true }, { kind: "LIFESTEAL", healRate: 0.3 }] },
    // Lv2 ダメージ倍率 3.80倍→4.10倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.1 }, { kind: "GAUGE", amount: 0.5, chance: 0.8, drain: true }, { kind: "LIFESTEAL", healRate: 0.3 }] },
    // Lv3 行動ゲージの発動率 80%→90%
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.1 }, { kind: "GAUGE", amount: 0.5, chance: 0.9, drain: true }, { kind: "LIFESTEAL", healRate: 0.3 }] },
    // Lv4 回復量 30%→35%
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.1 }, { kind: "GAUGE", amount: 0.5, chance: 0.9, drain: true }, { kind: "LIFESTEAL", healRate: 0.35 }] },
    // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 4.10倍→4.20倍
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.2 }, { kind: "GAUGE", amount: 0.5, chance: 0.9, drain: true }, { kind: "LIFESTEAL", healRate: 0.35 }] },
  ],
}, "【対象】敵単体。奪ったゲージはそのまま自分のものになるので、遅らせるだけの技より一手ぶん得をする。");

/**
 * S3候補C「超熱視線」。**必ず会心する。**
 *
 * この種族で唯一の、まっすぐな火力。
 * クリ率を積まなくても会心が出るので、**会心ダメージだけを積む**
 * という装備の組み方ができる。
 */
const SUEZO_S3_BEAM: Skill = described({
  id: "suezo_s3_beam",
  name: "超熱視線",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 3.5, alwaysCrit: true },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.5, alwaysCrit: true }] },
    // Lv2 ダメージ倍率 3.50倍→3.80倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 3.8, alwaysCrit: true }] },
    // Lv3 ダメージ倍率 3.80倍→4.10倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.1, alwaysCrit: true }] },
    // Lv4 ダメージ倍率 4.10倍→4.50倍
    { cooldownTurns: 5, effects: [{ kind: "DAMAGE", multiplier: 4.5, alwaysCrit: true }] },
    // Lv5 クールタイム -1(5→4ターン) / ダメージ倍率 4.50倍→4.60倍
    { cooldownTurns: 4, effects: [{ kind: "DAMAGE", multiplier: 4.6, alwaysCrit: true }] },
  ],
}, "【対象】敵単体。クリティカル率を積まなくても必ず会心するので、装備は会心ダメージだけを伸ばせばよい。");

/**
 * 光S3「魅惑のまなこ」。**見つめるだけで強化を剥がし、動きを止める。**
 *
 * 追撃は**1スキルにつき1回まで**。多段攻撃で4回起こしてはいけない
 * (`sourcePassiveUsed` が保証する)。追撃からさらに追撃も起きない。
 *
 * **解除と気絶は追撃で撃った敵にも乗る**(依頼主の指定)。
 * 追撃自体が1回しか起きないので、1体が2回受けることはない。
 *
 * 命中+30ptとクリ率+30ptは全Lv固定。この2つは
 * **妨害役が仕事をするための土台**で、Lvで伸びる部分ではない。
 */
const SUEZO_S3_LIGHT: Skill = described({
  id: "suezo_s3_charm_eye",
  name: "魅惑のまなこ",
  description: "",
  target: "SELF",
  cooldownTurns: 0,
  effects: [],
  passive: passive("ALWAYS", [
    { kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3, stripChance: 0.85, stunChance: 0.25, followUpMultiplier: 1.0 },
    // Lv2 強化解除 85% → 90%
    { kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3, stripChance: 0.9, stunChance: 0.25, followUpMultiplier: 1.0 },
    // Lv3 気絶 25% → 30%
    { kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3, stripChance: 0.9, stunChance: 0.3, followUpMultiplier: 1.0 },
    // Lv4 追撃 1.00倍 → 1.15倍
    { kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3, stripChance: 0.9, stunChance: 0.3, followUpMultiplier: 1.15 },
    // Lv5 気絶 30% → 35%
    { kind: "CHARM_EYE", accuracy: 0.3, critRate: 0.3, stripChance: 0.9, stunChance: 0.35, followUpMultiplier: 1.15 },
  ]),
}, "【対象】自身(パッシブ)。追撃で撃った敵にも解除と気絶が乗るので、会心が出た時は敵全体が対象になる。解除と気絶は1体につき1回まで、追撃は1スキルにつき1回まで。多段攻撃でも回数は増えない。");

/**
 * 闇S3「クロノキネシス」。**全員の時間を奪う。**
 *
 * 全体からゲージを吸収し、速度も落とし、動きも止める。
 * 手番に触る妨害としてはこの種族の到達点で、CTも最長の7。
 */
const SUEZO_S3_DARK: Skill = described({
  id: "suezo_s3_chronokinesis",
  name: "クロノキネシス",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 7,
  effects: [
    { kind: "DAMAGE", multiplier: 1.9 },
    { kind: "GAUGE", amount: 0.3, chance: 0.8, drain: true },
    { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2 },
    { kind: "STUN", durationTurns: 1 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 7,
      effects: [
        { kind: "DAMAGE", multiplier: 1.9 },
        { kind: "GAUGE", amount: 0.3, chance: 0.8, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2 },
        { kind: "STUN", durationTurns: 1 },
      ],
    },
    // Lv2 倍率 1.90 → 2.10
    {
      cooldownTurns: 7,
      effects: [
        { kind: "DAMAGE", multiplier: 2.1 },
        { kind: "GAUGE", amount: 0.3, chance: 0.8, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2 },
        { kind: "STUN", durationTurns: 1 },
      ],
    },
    // Lv3 ゲージ吸収 80% → 90%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "DAMAGE", multiplier: 2.1 },
        { kind: "GAUGE", amount: 0.3, chance: 0.9, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2 },
        { kind: "STUN", durationTurns: 1 },
      ],
    },
    // Lv4 速度DOWN 2ターン → 3ターン
    {
      cooldownTurns: 7,
      effects: [
        { kind: "DAMAGE", multiplier: 2.1 },
        { kind: "GAUGE", amount: 0.3, chance: 0.9, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3 },
        { kind: "STUN", durationTurns: 1 },
      ],
    },
    // Lv5 CT7 → CT6
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.1 },
        { kind: "GAUGE", amount: 0.3, chance: 0.9, drain: true },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3 },
        { kind: "STUN", durationTurns: 1 },
      ],
    },
  ],
}, "【対象】敵全体。気絶は1ターン固定。奪ったゲージは自分へ移り、上限を超えた分は切り捨てられる。");

/** スエゾーの種族ID */
export const SUEZO_TEMPLATE_ID = "suezo";

export const SUEZO: MonsterTemplate = {
  templateId: SUEZO_TEMPLATE_ID,
  baseName: "スエゾー",
  role: "デバッファー",
  emoji: "👁️",
  gachaStar: 4,
  baseStats: {
    hp: fromStar6Lv60(13_900),
    atk: fromStar6Lv60(1_980),
    def: fromStar6Lv60(1_180),
    spd: 102,
    criRate: 0.20,
    criDmg: 1.58,
    // 命中が全モンスター中でも高い。妨害は当たらなければ何も起きない
    accuracy: 0.32,
    resistance: 0.18,
  },
  skill1: SUEZO_S1,
  skill2Variants: [SUEZO_S2_KISS, SUEZO_S2_TELEPATHY, SUEZO_S2_PSYCHO],
  skill3Variants: [SUEZO_S3_SING, SUEZO_S3_EAT, SUEZO_S3_BEAM],
  lightSkill3: SUEZO_S3_LIGHT,
  darkSkill3: SUEZO_S3_DARK,
  skillAssignment: {
    FIRE: { skill2: 1, skill3: 2 },      // テレパシー / 超熱視線 — 会心で押す
    WATER: { skill2: 2, skill3: 0 },     // サイコキネシス / 歌う — 全体を止める
    ELECTRIC: { skill2: 0, skill3: 1 },  // キッス / 食う — 単体の手番を奪う
    GRASS: { skill2: 1, skill3: 1 },     // テレパシー / 食う — 支えながら食う
    LIGHT: { skill2: 0 },                // キッス / 魅惑のまなこ(固有)
    DARK: { skill2: 2 },                 // サイコキネシス / クロノキネシス(固有)
  },
  elementFlavorAssignment: {
    FIRE: 1,      // クリダメ+5% / 防御-6%
    WATER: 3,     // 命中+7% / HP-6%
    ELECTRIC: 2,  // 攻撃+10% / HP-8%
    GRASS: 3,     // 速度+4% / 防御-7%
    LIGHT: 0,     // クリ率+3% / 防御-6%
    DARK: 3,      // HP+9% / 速度-3%
  },
  dexNote: "相手の手番を遅らせ続けることを仕事にするコラボモンスター。全スキルが行動ゲージへ触ります。"
    + "命中が高く、妨害が当たりやすいのが取り柄です。防御とHPが薄いので前に立たせる種族ではありません。",
};

export const SUEZO_TEMPLATES: MonsterTemplate[] = [SUEZO];
