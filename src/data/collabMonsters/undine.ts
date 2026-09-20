import { MonsterTemplate } from "../../core/monster.js";
import { Skill } from "../../core/skill.js";
import { ATK_UP, DEF_UP, SPD_DOWN, SPD_UP } from "../../core/statusValues.js";
import { passive } from "../newMonsters/shared.js";
import { described, fromStar6Lv60 } from "./shared.js";

/**
 * ★5 ウンディーネ。**ヒーラーのコラボモンスター。**
 *
 * 回復だけの種族にしていない。免疫・継続回復・シールド・強化解除まで
 * 属性ごとに散らしてあり、**どの属性を引いたかで守り方が変わる**。
 * 火のウンディーネは全体攻撃とデバフを持つ、という具合に
 * 「水だから硬い」を意図的に崩してある。
 *
 * ## ★6 Lv60 の到達値(属性補正前)
 *
 *   HP 16,200 / 攻撃 1,520 / 防御 1,380 / 速度 118
 *   クリ率 15% / クリダメ +50% / 命中 20% / 抵抗 24%
 *
 * **速度118は4種で最速。**回復は先に動けてこそ間に合う。
 */

/**
 * S1「アクアウェイブ」。**当てて遅らせる。**
 *
 * ヒーラーのスキル1に妨害を置いてある。
 * 回復が要らないターンに手が空くと、支援役は何もできない時間が生まれる。
 */
const UNDINE_S1: Skill = described({
  id: "undine_s1",
  name: "アクアウェイブ",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 0,
  effects: [
    { kind: "DAMAGE", multiplier: 0.8 },
    { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 0.8 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.8 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 0.8 },
      ],
    },
    // Lv2 倍率 0.80 → 0.90
    {
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 0.8 },
      ],
    },
    // Lv3 速度DOWN 80% → 90%
    {
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 0.9 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 0.9 },
      ],
    },
    // Lv4 倍率 0.90 → 1.00
    {
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 0.9 },
      ],
    },
    // Lv5 速度DOWN 90% → 100%
    {
      cooldownTurns: 0,
      effects: [
        { kind: "DAMAGE", multiplier: 1.0 },
        { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 1, chance: 1.0 },
      ],
    },
  ],
}, "【対象】敵単体。回復が要らないターンでも仕事がある。");

/**
 * S2候補A「アクアヴェール」。**1体を立て直して、次の一撃を防ぐ。**
 *
 * 回復は**対象の最大HP**が基準。フェニックスの「自身の最大HP基準」とは別物で、
 * 硬い味方を戻す時にこちらの方が効く。
 * 弱化を全部落としてから免疫を張るので、**順番が意味を持つ**
 * (先に免疫を張っても、既にかかっている弱化は消えない)。
 */
const UNDINE_S2_VEIL: Skill = described({
  id: "undine_s2_aqua_veil",
  name: "アクアヴェール",
  description: "",
  target: "SINGLE_ALLY",
  cooldownTurns: 3,
  effects: [
    { kind: "HEAL", healRate: 0.4 },
    { kind: "CLEANSE" },
    { kind: "IMMUNITY", durationTurns: 2 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.4 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }],
    },
    // Lv2 回復 40% → 43%
    {
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.43 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }],
    },
    // Lv3 回復 43% → 46%
    {
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.46 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 2 }],
    },
    // Lv4 免疫 2ターン → 3ターン
    {
      cooldownTurns: 3,
      effects: [{ kind: "HEAL", healRate: 0.46 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }],
    },
    // Lv5 CT3 → CT2
    {
      cooldownTurns: 2,
      effects: [{ kind: "HEAL", healRate: 0.46 }, { kind: "CLEANSE" }, { kind: "IMMUNITY", durationTurns: 3 }],
    },
  ],
}, "【対象】味方単体。回復量は受け手の最大HPが基準。弱化を落としてから免疫を張るので、今かかっている不利も一緒に消える。");

/**
 * S2候補B「アクアヒーリング」。**全体を戻し、そのあとも戻し続ける。**
 *
 * 即時回復と継続回復の2段構え。継続回復は塔のように
 * **HPを次の階へ持ち越す**場所で効く。
 */
const UNDINE_S2_HEALING: Skill = described({
  id: "undine_s2_aqua_healing",
  name: "アクアヒーリング",
  description: "",
  target: "ALL_ALLIES",
  cooldownTurns: 4,
  effects: [
    { kind: "HEAL", healRate: 0.25 },
    { kind: "REGEN", healRate: 0.1, durationTurns: 2 },
  ],
  levelOverrides: [
    // Lv1
    { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.25 }, { kind: "REGEN", healRate: 0.1, durationTurns: 2 }] },
    // Lv2 即時回復 25% → 28%
    { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.1, durationTurns: 2 }] },
    // Lv3 継続回復 10% → 12%
    { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.12, durationTurns: 2 }] },
    // Lv4 継続回復 2ターン → 3ターン
    { cooldownTurns: 4, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }] },
    // Lv5 CT4 → CT3
    { cooldownTurns: 3, effects: [{ kind: "HEAL", healRate: 0.28 }, { kind: "REGEN", healRate: 0.12, durationTurns: 3 }] },
  ],
}, "【対象】味方全体。回復量は受け手それぞれの最大HPが基準。HPを次の階へ持ち越す試練の塔で効く。");

/**
 * S2候補C「クリスタルレイン」。**3回降らせ、そのたびに判定する。**
 *
 * 速度DOWNも気絶も**1撃ごと**(`perHitEffects`)。
 * 3回とも通ることは滅多にないが、全体へ3回試せる。
 * 気絶は1ターン固定——全体へ配れるものを伸ばすと戦況が固まる。
 */
const UNDINE_S2_RAIN: Skill = described({
  id: "undine_s2_crystal_rain",
  name: "クリスタルレイン",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 4,
  effects: [{
    kind: "DAMAGE", multiplier: 0.4, hits: 3,
    perHitEffects: [
      { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 },
      { kind: "STUN", durationTurns: 1, chance: 0.2 },
    ],
  }],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 0.4, hits: 3,
        perHitEffects: [
          { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 },
          { kind: "STUN", durationTurns: 1, chance: 0.2 },
        ],
      }],
    },
    // Lv2 倍率 0.40 → 0.45
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 0.45, hits: 3,
        perHitEffects: [
          { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.4 },
          { kind: "STUN", durationTurns: 1, chance: 0.2 },
        ],
      }],
    },
    // Lv3 速度DOWN 40% → 45%
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 0.45, hits: 3,
        perHitEffects: [
          { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 2, chance: 0.45 },
          { kind: "STUN", durationTurns: 1, chance: 0.2 },
        ],
      }],
    },
    // Lv4 速度DOWN 2ターン → 3ターン
    {
      cooldownTurns: 4,
      effects: [{
        kind: "DAMAGE", multiplier: 0.45, hits: 3,
        perHitEffects: [
          { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.45 },
          { kind: "STUN", durationTurns: 1, chance: 0.2 },
        ],
      }],
    },
    // Lv5 CT4 → CT3
    {
      cooldownTurns: 3,
      effects: [{
        kind: "DAMAGE", multiplier: 0.45, hits: 3,
        perHitEffects: [
          { kind: "DEBUFF", stat: "spd", amount: SPD_DOWN, durationTurns: 3, chance: 0.45 },
          { kind: "STUN", durationTurns: 1, chance: 0.2 },
        ],
      }],
    },
  ],
}, "【対象】敵全体・3回攻撃。追加効果は当たるたびに判定する。気絶は1ターン固定。");

/**
 * S3候補A「水の祝福」。**居るだけで、仲間が硬くなる。**
 *
 * **守るのは自分以外の味方だけ。**張り主が同時にいちばん硬くなると
 * 狙う場所が無くなり、戦いが止まる。
 * 回復と攻撃UPは自分も受け取る(そこまで外すと、行動そのものが損になる)。
 *
 * 行動時の回復は**ウンディーネ自身の最大HP**が基準。
 * 受け手の最大HPで計算すると、硬い味方ほど厚く戻って
 * 「守る側を育てる」意味が消える。
 */
const UNDINE_S3_BLESSING: Skill = described({
  id: "undine_s3_water_blessing",
  name: "水の祝福",
  description: "",
  target: "SELF",
  cooldownTurns: 0,
  effects: [],
  passive: passive("ALWAYS", [
    { kind: "WATER_BLESSING", damageTaken: 0.2, critTaken: 0.25, healOnAct: 0.05, atkUpTurns: 1 },
    // Lv2 行動時回復 5% → 6%
    { kind: "WATER_BLESSING", damageTaken: 0.2, critTaken: 0.25, healOnAct: 0.06, atkUpTurns: 1 },
    // Lv3 被ダメージ軽減 20% → 22%
    { kind: "WATER_BLESSING", damageTaken: 0.22, critTaken: 0.25, healOnAct: 0.06, atkUpTurns: 1 },
    // Lv4 行動時回復 6% → 7%
    { kind: "WATER_BLESSING", damageTaken: 0.22, critTaken: 0.25, healOnAct: 0.07, atkUpTurns: 1 },
    // Lv5 被ダメージ軽減 22% → 25%
    { kind: "WATER_BLESSING", damageTaken: 0.25, critTaken: 0.25, healOnAct: 0.07, atkUpTurns: 1 },
  ]),
}, "【対象】自身(パッシブ)。軽減と会心されにくさは自分以外の味方だけが受け取る。行動時の回復と攻撃上昇は自分にも入る。");

/**
 * S3候補B「クリスタルアロー」。**1体を黙らせる。**
 *
 * スキル封印と回復阻害を同時に入れる。相手の支援役へ撃つと
 * **回復も蘇生も止まる**ので、ヒーラーの中では珍しく攻めの技。
 * 封印は2ターン固定。
 */
const UNDINE_S3_ARROW: Skill = described({
  id: "undine_s3_crystal_arrow",
  name: "クリスタルアロー",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 5,
  effects: [
    { kind: "DAMAGE", multiplier: 3.4 },
    { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 0.9, fixedDuration: true },
    { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.4 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 0.9, fixedDuration: true },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 },
      ],
    },
    // Lv2 倍率 3.40 → 3.70
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.7 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 0.9, fixedDuration: true },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 0.9 },
      ],
    },
    // Lv3 付与率 90% → 100%
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.7 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 1.0, fixedDuration: true },
        { kind: "HEAL_BLOCK", durationTurns: 2, chance: 1.0 },
      ],
    },
    // Lv4 回復阻害 2ターン → 3ターン
    {
      cooldownTurns: 5,
      effects: [
        { kind: "DAMAGE", multiplier: 3.7 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 1.0, fixedDuration: true },
        { kind: "HEAL_BLOCK", durationTurns: 3, chance: 1.0 },
      ],
    },
    // Lv5 CT5 → CT4
    {
      cooldownTurns: 4,
      effects: [
        { kind: "DAMAGE", multiplier: 3.7 },
        { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 2, chance: 1.0, fixedDuration: true },
        { kind: "HEAL_BLOCK", durationTurns: 3, chance: 1.0 },
      ],
    },
  ],
}, "【対象】敵単体。スキル封印は2ターン固定。相手の支援役へ撃つと、回復も蘇生も止められる。");

/**
 * S3候補C「水神の祝福」。**味方全員の次の一手を早める。**
 *
 * クールタイム-1は数字に出にくいが**非常に強い**。
 * 味方4体の全スキルが1ターン早く回るので、CT7という長さと釣り合わせてある。
 * 短縮量は-1固定(ここを2にすると、必殺技を毎ターン撃てる編成が生まれる)。
 */
const UNDINE_S3_GOD_BLESSING: Skill = described({
  id: "undine_s3_water_god_blessing",
  name: "水神の祝福",
  description: "",
  target: "ALL_ALLIES",
  cooldownTurns: 7,
  effects: [
    { kind: "COOLDOWN_REDUCE", turns: 1 },
    { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2 },
    { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
    { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 7,
      effects: [
        { kind: "COOLDOWN_REDUCE", turns: 1 },
        { kind: "SHIELD", shieldRate: 0.25, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
    },
    // Lv2 シールド 25% → 27%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "COOLDOWN_REDUCE", turns: 1 },
        { kind: "SHIELD", shieldRate: 0.27, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
    },
    // Lv3 シールド 27% → 30%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "COOLDOWN_REDUCE", turns: 1 },
        { kind: "SHIELD", shieldRate: 0.3, durationTurns: 2 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 2 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 2 },
      ],
    },
    // Lv4 シールド・防御UP・速度UP 2ターン → 3ターン
    {
      cooldownTurns: 7,
      effects: [
        { kind: "COOLDOWN_REDUCE", turns: 1 },
        { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 },
      ],
    },
    // Lv5 CT7 → CT6
    {
      cooldownTurns: 6,
      effects: [
        { kind: "COOLDOWN_REDUCE", turns: 1 },
        { kind: "SHIELD", shieldRate: 0.3, durationTurns: 3 },
        { kind: "BUFF", stat: "def", amount: DEF_UP, durationTurns: 3 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 3 },
      ],
    },
  ],
}, "【対象】味方全体。シールド量は受け手それぞれの最大HPが基準。クールタイムの短縮量は伸びない。");

/**
 * 光S3「水神の息吹」。**相手の準備をすべて洗い流してから、味方を立て直す。**
 *
 * **強化解除 → ゲージ低下の順番を守る。**逆にすると、
 * 解除される前に相手が動いてしまう場面が出る。
 * 効果は配列順に処理されるので、並びがそのまま順番になる。
 */
const UNDINE_S3_LIGHT: Skill = described({
  id: "undine_s3_water_god_breath",
  name: "水神の息吹",
  description: "",
  target: "ALL_ENEMIES",
  cooldownTurns: 7,
  effects: [
    { kind: "STRIP" },
    { kind: "GAUGE", amount: -0.3 },
    { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" },
    { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 7,
      effects: [
        { kind: "STRIP" },
        { kind: "GAUGE", amount: -0.3 },
        { kind: "HEAL", healRate: 0.2, applyTo: "ALLIES" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
      ],
    },
    // Lv2 回復 20% → 23%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "STRIP" },
        { kind: "GAUGE", amount: -0.3 },
        { kind: "HEAL", healRate: 0.23, applyTo: "ALLIES" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
      ],
    },
    // Lv3 ゲージ低下 30% → 35%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "STRIP" },
        { kind: "GAUGE", amount: -0.35 },
        { kind: "HEAL", healRate: 0.23, applyTo: "ALLIES" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
      ],
    },
    // Lv4 回復 23% → 25%
    {
      cooldownTurns: 7,
      effects: [
        { kind: "STRIP" },
        { kind: "GAUGE", amount: -0.35 },
        { kind: "HEAL", healRate: 0.25, applyTo: "ALLIES" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
      ],
    },
    // Lv5 CT7 → CT6
    {
      cooldownTurns: 6,
      effects: [
        { kind: "STRIP" },
        { kind: "GAUGE", amount: -0.35 },
        { kind: "HEAL", healRate: 0.25, applyTo: "ALLIES" },
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 3, applyTo: "ALLIES" },
      ],
    },
  ],
}, "【対象】敵全体＋味方全体。ダメージは出さない。強化を剥がしてからゲージを削るので、剥がす前に動かれることがない。");

/**
 * 闇S3「アクアドーム」。**相手のHPそのものを削り、そのあと防御で殴る。**
 *
 * 最大HP30%の部分は**防御の影響を受けない**(`MAX_HP_DAMAGE`)。
 * 硬い相手ほど効くので、ヒーラーが単体で硬い壁を崩せる唯一の手になる。
 * この30%は全Lv固定。
 */
const UNDINE_S3_DARK: Skill = described({
  id: "undine_s3_aqua_dome",
  name: "アクアドーム",
  description: "",
  target: "SINGLE_ENEMY",
  cooldownTurns: 4,
  effects: [
    { kind: "MAX_HP_DAMAGE", ratio: 0.3 },
    { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.1 },
  ],
  levelOverrides: [
    // Lv1
    {
      cooldownTurns: 4,
      effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }, { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.1 }],
    },
    // Lv2 DEF係数 2.10 → 2.25
    {
      cooldownTurns: 4,
      effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }, { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.25 }],
    },
    // Lv3 DEF係数 2.25 → 2.40
    {
      cooldownTurns: 4,
      effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }, { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.4 }],
    },
    // Lv4 DEF係数 2.40 → 2.60
    {
      cooldownTurns: 4,
      effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }, { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.6 }],
    },
    // Lv5 CT4 → CT3
    {
      cooldownTurns: 3,
      effects: [{ kind: "MAX_HP_DAMAGE", ratio: 0.3 }, { kind: "DAMAGE", multiplier: 0, defCoefficient: 2.6 }],
    },
  ],
}, "【対象】敵単体。最大HPを削る部分には相手の防御が効かないので、硬い相手ほどよく通る。");

/** ウンディーネの種族ID */
export const UNDINE_TEMPLATE_ID = "undine";

export const UNDINE: MonsterTemplate = {
  templateId: UNDINE_TEMPLATE_ID,
  baseName: "ウンディーネ",
  role: "ヒーラー",
  emoji: "💧",
  gachaStar: 5,
  baseStats: {
    hp: fromStar6Lv60(16_200),
    atk: fromStar6Lv60(1_520),
    def: fromStar6Lv60(1_380),
    // 4種で最速。回復は先に動けてこそ間に合う
    spd: 118,
    criRate: 0.15,
    criDmg: 1.50,
    accuracy: 0.20,
    resistance: 0.24,
  },
  skill1: UNDINE_S1,
  skill2Variants: [UNDINE_S2_VEIL, UNDINE_S2_HEALING, UNDINE_S2_RAIN],
  skill3Variants: [UNDINE_S3_BLESSING, UNDINE_S3_ARROW, UNDINE_S3_GOD_BLESSING],
  lightSkill3: UNDINE_S3_LIGHT,
  darkSkill3: UNDINE_S3_DARK,
  skillAssignment: {
    FIRE: { skill2: 2, skill3: 1 },      // クリスタルレイン / クリスタルアロー — 攻めるウンディーネ
    WATER: { skill2: 0, skill3: 0 },     // アクアヴェール / 水の祝福 — 守り切る
    ELECTRIC: { skill2: 0, skill3: 2 },  // アクアヴェール / 水神の祝福 — 回りを早める
    GRASS: { skill2: 1, skill3: 0 },     // アクアヒーリング / 水の祝福 — 削られ続けても保つ
    LIGHT: { skill2: 1 },                // アクアヒーリング / 水神の息吹(固有)
    DARK: { skill2: 2 },                 // クリスタルレイン / アクアドーム(固有)
  },
  elementFlavorAssignment: {
    FIRE: 3,      // 速度+4% / HP-7%
    WATER: 0,     // 防御+14% / 攻撃-10%
    ELECTRIC: 0,  // 速度+6% / HP-10%
    GRASS: 0,     // HP+14% / 攻撃-10%
    LIGHT: 3,     // 速度+4% / 攻撃-6%
    DARK: 2,      // 防御+10% / 攻撃-7%
  },
  dexNote: "水を操るコラボモンスター。回復だけの種族ではなく、免疫・継続回復・シールド・強化解除まで"
    + "属性ごとに散らしてあり、どの属性を引いたかで守り方が変わります。速度が4種で最も速く、回復が間に合います。",
};

export const UNDINE_TEMPLATES: MonsterTemplate[] = [UNDINE];
