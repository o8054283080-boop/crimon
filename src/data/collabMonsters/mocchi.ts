import { MonsterTemplate } from "../../core/monster.js";
import { Skill } from "../../core/skill.js";
import { ATK_UP, DEF_DOWN } from "../../core/statusValues.js";
import { HEAL_BLOCK_HALF, passive } from "../newMonsters/shared.js";
import { described, fromStar6Lv60 } from "./shared.js";

/**
 * ★4 モッチー。**桜餅のコラボモンスターで、役割はバランス型。**
 *
 * 「カッパ」ではない。攻撃・防御・HPのどれもが中庸で、
 * **そのどれもをダメージに変える**のがこの種族の形になっている
 * (S1「もんた」がATK・最大HP・DEFの3つを足し合わせる)。
 * 1つの能力を極めるより、装備で全体を持ち上げた方が強くなる。
 *
 * ## ★6 Lv60 の到達値(属性補正前)
 *
 *   HP 17,000 / 攻撃 1,680 / 防御 1,740 / 速度 106
 *   クリ率 15% / クリダメ +55% / 命中 17% / 抵抗 20%
 *
 * **防御が攻撃より高い。**S1・S2・S3のすべてに防御係数が乗るので、
 * 攻撃力だけを積んでも伸びない。防御を積むと攻撃も伸びる、という
 * 育て方がこの種族の軸。
 */

/**
 * S1「もんた」。**ATK・最大HP・DEFの3つを足してから殴る。**
 *
 * Lvで伸びるのは 倍率 → HP係数 → DEF係数 → 倍率 の順。
 * **1段につき1つだけ動かす。**3つの係数を同時に上げると、
 * どの育て方が効いたのか本人にも分からなくなる。
 */
const MOCCHI_S1: Skill = described({
  id: "mocchi_s1",
  name: "もんた",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [{ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.05, defCoefficient: 0.5 }],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.6, hpCoefficient: 0.05, defCoefficient: 0.5 }] },
    // Lv2 倍率 0.60 → 0.65
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, hpCoefficient: 0.05, defCoefficient: 0.5 }] },
    // Lv3 HP係数 0.05 → 0.055
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, hpCoefficient: 0.055, defCoefficient: 0.5 }] },
    // Lv4 DEF係数 0.50 → 0.55
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.65, hpCoefficient: 0.055, defCoefficient: 0.55 }] },
    // Lv5 倍率 0.65 → 0.70
    { cooldownTurns: 0, effects: [{ kind: "DAMAGE", multiplier: 0.70, hpCoefficient: 0.055, defCoefficient: 0.55 }] },
  ],
}, "【対象】敵単体。攻撃力・最大HP・防御力の3つを足してから殴るので、どこを育てても手応えが増える。");

/**
 * S2候補A「さくらふぶき」。**封じて動きを止める。**
 *
 * スキル封印は1ターンで据え置く(`fixedDuration`)。
 * 1ターンが2ターンになると「1手止める」が「戦況を決める」に変わる。
 */
const MOCCHI_S2_FUBUKI: Skill = described({
  id: "mocchi_s2_fubuki",
  name: "さくらふぶき",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 3,
  effects: [
    { kind: "DAMAGE", multiplier: 1.4, hpCoefficient: 0.12 },
    { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.7, fixedDuration: true },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.4, hpCoefficient: 0.12 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.7, fixedDuration: true },
      ],
    },
    // Lv2 倍率 1.40 → 1.50
    {
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.12 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.7, fixedDuration: true },
      ],
    },
    // Lv3 封印 70% → 80%
    {
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.12 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.8, fixedDuration: true },
      ],
    },
    // Lv4 HP係数 0.12 → 0.135
    {
      cooldownTurns: 3,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.135 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.8, fixedDuration: true },
      ],
    },
    // Lv5 CT3 → CT2
    {
      cooldownTurns: 2,
      effects: [
        { kind: "DAMAGE", multiplier: 1.5, hpCoefficient: 0.135 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.8, fixedDuration: true },
      ],
    },
  ],
}, "【対象】敵単体。当たればスキルを封じ、相手の一番痛い技を1手ぶん遅らせる。");

/**
 * S2候補B「ガッチャー」。**2回掴み、そのたびに手番を引き剥がす。**
 *
 * ゲージ低下の判定は**1撃ごと**(`perHitEffects`)。
 * 2回とも通れば60%ぶん遅らせられるので、
 * 表に出ている確率よりは通りやすい。
 */
const MOCCHI_S2_GATCHER: Skill = described({
  id: "mocchi_s2_gatcher",
  name: "ガッチャー",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 3,
  effects: [{
    kind: "DAMAGE", multiplier: 0.7, defCoefficient: 0.6, hits: 2,
    perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.4 }],
  }],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 0.7, defCoefficient: 0.6, hits: 2,
        perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.4 }],
      }],
    },
    // Lv2 倍率 0.70 → 0.75
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 0.75, defCoefficient: 0.6, hits: 2,
        perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.4 }],
      }],
    },
    // Lv3 ゲージ低下 40% → 45%
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 0.75, defCoefficient: 0.6, hits: 2,
        perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.45 }],
      }],
    },
    // Lv4 DEF係数 0.60 → 0.65
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 0.75, defCoefficient: 0.65, hits: 2,
        perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.45 }],
      }],
    },
    // Lv5 CT3 → CT2
    {
      cooldownTurns: 2,
      effects: [{
        kind: "DAMAGE", multiplier: 0.75, defCoefficient: 0.65, hits: 2,
        perHitEffects: [{ kind: "GAUGE", amount: -0.3, chance: 0.45 }],
      }],
    },
  ],
}, "【対象】敵単体・2回攻撃。ゲージを削る判定は当たるたびに行うので、2回とも通れば相手の手番が大きく遠のく。");

/**
 * S2候補C「モッチ砲」。**自分の方が硬ければ、相手の守りを抜く。**
 *
 * 防御無視は条件付き(`conditionalIgnoreDefense`)。
 * 条件を満たさなくても攻撃そのものは当たる——
 * 「硬い相手ほど通らない」ではなく「硬さで競り勝つと通る」。
 */
const MOCCHI_S2_CANNON: Skill = described({
  id: "mocchi_s2_cannon",
  name: "モッチ砲",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 4,
  effects: [{
    kind: "DAMAGE", multiplier: 1.6, defCoefficient: 1.2,
    conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.3 },
  }],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 1.6, defCoefficient: 1.2,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.3 },
      }],
    },
    // Lv2 倍率 1.60 → 1.75
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 1.75, defCoefficient: 1.2,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.3 },
      }],
    },
    // Lv3 防御無視 30% → 35%
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 1.75, defCoefficient: 1.2,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.35 },
      }],
    },
    // Lv4 DEF係数 1.20 → 1.35
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 1.75, defCoefficient: 1.35,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.35 },
      }],
    },
    // Lv5 CT4 → CT3
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 1.75, defCoefficient: 1.35,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.35 },
      }],
    },
  ],
}, "【対象】敵単体。防御力を積むほど威力が上がり、相手より硬ければ守りの一部を抜ける。");

/**
 * S3候補A「超モッチ砲」。**手番を奪い、動きも止める一撃。**
 *
 * Lv4だけは2つ動かす(DEF係数と気絶率)。**依頼主の指定。**
 * ここは「Lv4で持続+1」の型が使えない技なので、
 * 代わりに数値を2つ足す形になっている。
 */
const MOCCHI_S3_SUPER_CANNON: Skill = described({
  id: "mocchi_s3_super_cannon",
  name: "超モッチ砲",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 6,
  effects: [
    { kind: "DAMAGE", multiplier: 2.8, defCoefficient: 2.0 },
    { kind: "GAUGE", amount: -0.4, chance: 0.75 },
    { kind: "STUN", durationTurns: 1, chance: 0.5 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 2.8, defCoefficient: 2.0 },
        { kind: "GAUGE", amount: -0.4, chance: 0.75 },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
    },
    // Lv2 倍率 2.80 → 3.00
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 3.0, defCoefficient: 2.0 },
        { kind: "GAUGE", amount: -0.4, chance: 0.75 },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
    },
    // Lv3 ゲージ低下 75% → 85%
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 3.0, defCoefficient: 2.0 },
        { kind: "GAUGE", amount: -0.4, chance: 0.85 },
        { kind: "STUN", durationTurns: 1, chance: 0.5 },
      ],
    },
    // Lv4 DEF係数 2.0 → 2.2、気絶 50% → 60%
    {
      cooldownTurns: 6,
      effects: [
        { kind: "DAMAGE", multiplier: 3.0, defCoefficient: 2.2 },
        { kind: "GAUGE", amount: -0.4, chance: 0.85 },
        { kind: "STUN", durationTurns: 1, chance: 0.6 },
      ],
    },
    // Lv5 CT6 → CT5
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.0, defCoefficient: 2.2 },
        { kind: "GAUGE", amount: -0.4, chance: 0.85 },
        { kind: "STUN", durationTurns: 1, chance: 0.6 },
      ],
    },
  ],
}, "【対象】敵単体。気絶は1ターン固定。手番を奪う技なので、相手が動く直前に合わせると効き目が大きい。");

/**
 * S3候補B「宵闇ざくら」。**全体を薙ぎ、回復を封じる。**
 *
 * 回復阻害は塔の「癒やしの階」への答え。
 * 全体へ配れる回復阻害はプレイヤー側では数が少ない。
 */
const MOCCHI_S3_YOIYAMI: Skill = described({
  id: "mocchi_s3_yoiyami",
  name: "宵闇ざくら",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.10 },
    { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.7 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.6, hpCoefficient: 0.10 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.7 },
      ],
    },
    // Lv2 倍率 1.60 → 1.75
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.75, hpCoefficient: 0.10 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.7 },
      ],
    },
    // Lv3 回復阻害 70% → 80%
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.75, hpCoefficient: 0.10 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 2, chance: 0.8 },
      ],
    },
    // Lv4 回復阻害 2ターン → 3ターン
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 1.75, hpCoefficient: 0.10 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 3, chance: 0.8 },
      ],
    },
    // Lv5 CT5 → CT4
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 1.75, hpCoefficient: 0.10 },
        { kind: "HEAL_BLOCK", healMultiplier: HEAL_BLOCK_HALF, durationTurns: 3, chance: 0.8 },
      ],
    },
  ],
}, "【対象】敵全体。回復で粘る相手を削り切るための技で、試練の塔の回復する階に効く。");

/**
 * S3候補C「ガッツチャージ」。**順番が回るたびに気合が溜まる。**
 *
 * 溜まるのは**通常のターンだけ**。追加ターンで溜めると、
 * 追加ターンを生む技と組み合わせた瞬間に1手で2つ3つと増える。
 * 速度は全Lv +15/stack で据え置き(最大+60)——
 * ここまで伸ばすと行動順そのものが変わるので、Lvで動かさない。
 */
const MOCCHI_S3_GUTS: Skill = described({
  id: "mocchi_s3_guts",
  name: "ガッツチャージ",
  description: "",
  target: "SELF",
  cooldownTurns: 0,
  effects: [],
  passive: passive("ALWAYS", [
    { kind: "GUTS_CHARGE", damageUp: 0.25, spd: 15, maxStacks: 4 },
    // Lv2 与ダメージ +25% → +27%
    { kind: "GUTS_CHARGE", damageUp: 0.27, spd: 15, maxStacks: 4 },
    // Lv3 +27% → +28%
    { kind: "GUTS_CHARGE", damageUp: 0.28, spd: 15, maxStacks: 4 },
    // Lv4 +28% → +30%
    { kind: "GUTS_CHARGE", damageUp: 0.30, spd: 15, maxStacks: 4 },
    // Lv5 上限に届いた時、自身の行動ゲージ+20%
    { kind: "GUTS_CHARGE", damageUp: 0.30, spd: 15, maxStacks: 4, gaugeAtMax: 0.2 },
  ]),
}, "【対象】自身(パッシブ)。同じ戦闘のあいだ溜まり続け、戦闘が終わるとリセットされる。追加ターンでは溜まらない。");

/**
 * 光S3「白もっさま」。**硬さがそのまま貫通力になる。**
 *
 * 光と闇は召喚でしか手に入らないので、同じ種族の他の属性より
 * 明確に強い。モッチ砲の防御無視を30%から75%へ引き上げた形で、
 * **役割は変えていない**(硬い者が硬い相手を抜く)。
 */
const MOCCHI_S3_LIGHT: Skill = described({
  id: "mocchi_s3_shiromossama",
  name: "白もっさま",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 6,
  effects: [{
    kind: "DAMAGE", multiplier: 3.4, defCoefficient: 1.8,
    conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.75 },
  }],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 6,
      effects: [{
        kind: "DAMAGE", multiplier: 3.4, defCoefficient: 1.8,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.75 },
      }],
    },
    // Lv2 倍率 3.40 → 3.60
    {
      cooldownTurns: 6,
      effects: [{
        kind: "DAMAGE", multiplier: 3.6, defCoefficient: 1.8,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.75 },
      }],
    },
    // Lv3 DEF係数 1.8 → 2.0
    {
      cooldownTurns: 6,
      effects: [{
        kind: "DAMAGE", multiplier: 3.6, defCoefficient: 2.0,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.75 },
      }],
    },
    // Lv4 防御無視 75% → 80%
    {
      cooldownTurns: 6,
      effects: [{
        kind: "DAMAGE", multiplier: 3.6, defCoefficient: 2.0,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.8 },
      }],
    },
    // Lv5 CT6 → CT5
    {
      cooldownTurns: 5,
      effects: [{
        kind: "DAMAGE", multiplier: 3.6, defCoefficient: 2.0,
        conditionalIgnoreDefense: { when: "SELF_DEF_ABOVE_TARGET", ratio: 0.8 },
      }],
    },
  ],
}, "【対象】敵単体。相手より硬ければ守りをほとんど抜けるので、装備は防御に寄せるほど刺さる。");

/**
 * 闇S3「さくらフィールド」。**ダメージを出さず、場を作る。**
 *
 * 防御DOWNは**抵抗を無視して通る**(`ignoreResistance`)。
 * ただし**免疫は貫けない**——免疫は相手が自分で用意した答えで、
 * 運で弾く抵抗とは別のもの。ここまで貫くと免疫を張る意味が消える。
 *
 * 防御DOWNは2ターン固定。全体へ抵抗無視で通るものを伸ばすと、
 * 「張り直しの間が無い」状態になる。
 */
const MOCCHI_S3_DARK: Skill = described({
  id: "mocchi_s3_sakura_field",
  name: "さくらフィールド",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 5,
  effects: [
    { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85, ignoreResistance: true, fixedDuration: true },
    { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.85, ignoreResistance: true, fixedDuration: true },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
      ],
    },
    // Lv2 防御DOWN 85% → 90%
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, ignoreResistance: true, fixedDuration: true },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
      ],
    },
    // Lv3 味方全体の行動ゲージ+10%を追加
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, ignoreResistance: true, fixedDuration: true },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2, applyTo: "ALLIES" },
        { kind: "GAUGE", amount: 0.1, applyTo: "ALLIES" },
      ],
    },
    // Lv4 攻撃UP 2ターン → 3ターン
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, ignoreResistance: true, fixedDuration: true },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
        { kind: "GAUGE", amount: 0.1, applyTo: "ALLIES" },
      ],
    },
    // Lv5 CT5 → CT4
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DEBUFF", stat: "def", amount: DEF_DOWN, durationTurns: 2, chance: 0.9, ignoreResistance: true, fixedDuration: true },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
        { kind: "GAUGE", amount: 0.1, applyTo: "ALLIES" },
      ],
    },
  ],
}, "【対象】敵全体＋味方全体。ダメージは出さない。防御低下は抵抗で弾かれないが、免疫を張った相手には入らない。");

/** モッチーの種族ID */
export const MOCCHI_TEMPLATE_ID = "mocchi";

export const MOCCHI: MonsterTemplate = {
  templateId: MOCCHI_TEMPLATE_ID,
  baseName: "モッチー",
  role: "バランス型",
  emoji: "🌸",
  gachaStar: 4,
  baseStats: {
    hp: fromStar6Lv60(17_000),
    atk: fromStar6Lv60(1_680),
    def: fromStar6Lv60(1_740),
    // 速度・クリ率・クリダメ・命中・抵抗は★とLvで伸びない。設計値をそのまま置く
    spd: 106,
    criRate: 0.15,
    criDmg: 1.55,
    accuracy: 0.17,
    resistance: 0.20,
  },
  skill1: MOCCHI_S1,
  skill2Variants: [MOCCHI_S2_FUBUKI, MOCCHI_S2_GATCHER, MOCCHI_S2_CANNON],
  skill3Variants: [MOCCHI_S3_SUPER_CANNON, MOCCHI_S3_YOIYAMI, MOCCHI_S3_GUTS],
  lightSkill3: MOCCHI_S3_LIGHT,
  darkSkill3: MOCCHI_S3_DARK,
  /*
   * **属性ごとの組み合わせは手で決める。**
   * 自動割り当ては候補の並び順を変えた瞬間に全属性が入れ替わるので、
   * 「この属性はこの役割」という設計が先にある種族は必ず書く。
   */
  skillAssignment: {
    FIRE: { skill2: 2, skill3: 0 },      // モッチ砲 / 超モッチ砲 — 貫いて止める
    WATER: { skill2: 1, skill3: 1 },     // ガッチャー / 宵闇ざくら — 遅らせて削る
    ELECTRIC: { skill2: 0, skill3: 2 },  // さくらふぶき / ガッツチャージ — 封じて溜める
    GRASS: { skill2: 0, skill3: 1 },     // さくらふぶき / 宵闇ざくら — 封じて回復を断つ
    LIGHT: { skill2: 2 },                // モッチ砲 / 白もっさま(固有)
    DARK: { skill2: 1 },                 // ガッチャー / さくらフィールド(固有)
  },
  /*
   * 属性補正の型も手で決める(0〜3は `ELEMENT_STAT_FLAVORS` の並び)。
   * **「雷だから速い」にしない**——電気のモッチーは防御型、
   * 水のモッチーは速度型で、同じ種族でも属性で使い方が変わる。
   */
  elementFlavorAssignment: {
    FIRE: 2,      // HP+10% / 攻撃-7%
    WATER: 2,     // 速度+5% / 防御-8%
    ELECTRIC: 3,  // 防御+10% / 速度-3%
    GRASS: 0,     // HP+14% / 攻撃-10%
    LIGHT: 2,     // HP+10% / クリダメ-4%
    DARK: 2,      // 防御+10% / 攻撃-7%
  },
  dexNote: "桜餅をイメージしたコラボモンスター。攻撃力・最大HP・防御力の3つを足してから殴るので、"
    + "どこを育てても手応えが増えます。防御が攻撃より高く、防御を積むほど攻撃も伸びるのがこの種族の軸です。",
};

export const MOCCHI_TEMPLATES: MonsterTemplate[] = [MOCCHI];
