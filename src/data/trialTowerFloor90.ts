import { Skill } from "../core/skill.js";
import { DungeonEnemy } from "./equipmentDungeon.js";
import { ANCIENT_CRYSTAL, ANCIENT_FANG_BEAST } from "./monsters.js";

/**
 * 試練の塔90階「狂化」。Battle Lab V7 で確定した本編用データ。
 *
 * ## この階が問いかけること
 *
 * **お供を倒すとボスが強くなる。かといって放っておくとお供に押し切られる。**
 * どちらを選ぶかを決めさせるのがこの階の芯で、
 * 「とりあえず全部倒す」も「ボスだけ殴る」も最適解にしない。
 *
 * ## 基準値(TYPICAL装備・各1000戦・安全処理型)
 *
 * | 攻略順 | Battle Lab V7 | 本編(この実装) |
 * |---|---:|---:|
 * | 狂牙獣→戦鼓晶→ボス | 25.3% | **27.8%** (+2.5pt) |
 * | 戦鼓晶→狂牙獣→ボス | 32.0% | **34.9%** (+2.9pt) |
 * | 狂牙獣→ボス | 25.3% | **28.9%** (+3.6pt) |
 *
 * **本編の方が2〜4ポイント高いのは、狙ってそうしたところがある。**
 * V7の盤面は戦鼓晶S3のCT-1を敵5体全員へ配っていたが、正式仕様は
 * **ボスだけCT-1**(代わりにボスへ追加ゲージ+15%)。お供4体のS2・S3が
 * 回らなくなったぶんが、ボスの手番が少し早く来るぶんを上回っている。
 * ここは本編の方が正しい仕様なので、**以後はこの表の右側が基準。**
 *
 * 数値を触ったら測り直すこと(`npx tsx tools/battleLab/tower90/measureLive.ts`)。
 * ±3〜5ポイント以上ずれたら、engine の90階処理のどこかが落ちている。
 *
 * ## 3スキル枠に収まらないものは engine が持つ
 *
 * ボスのHP帯狂化・お供死亡による永久狂化・序盤の火力抑制、
 * 戦鼓晶S3のボス限定加速、戦鼓晶死亡後の狂牙獣強化は
 * スキルの効果として書けないので、`BattleEngine` の90階処理で解決する。
 * **90階以外には一切効かない。**
 */

/* ========================================================================
 * ボス「古代ネメシス」
 * ===================================================================== */

export const TOWER90_BOSS_HP = 350_000;
export const TOWER90_BOSS_ATK = 9_000;
export const TOWER90_BOSS_DEF = 4_200;
export const TOWER90_BOSS_SPD = 200;

/** 90階の敵は全員この的中・抵抗で揃える */
export const TOWER90_ACCURACY = 0.65;
export const TOWER90_RESISTANCE = 0.50;

/**
 * ボスのHP帯狂化。**加算で積み上がる**(70階の置き換え式とは違う)。
 *
 * HP40%以下のATKが+2,000なのは、V6の+1,500にV7で+500を足したもの。
 * 70%以下の+1,000と合わせて、HP40%以下では**合計+3,000**になる。
 */
export const TOWER90_RAGE_HP70_ATK = 1_000;
export const TOWER90_RAGE_HP70_SPD = 20;
export const TOWER90_RAGE_HP40_ATK = 2_000;
export const TOWER90_RAGE_HP40_SPD = 30;
export const TOWER90_RAGE_HP20_ATK = 2_000;
export const TOWER90_RAGE_HP20_SPD = 50;

/**
 * 与ダメージの倍率。**段階式で、累積の掛け算にはしない。**
 * HP40%以下は×1.25、20%以下は×1.5(1.25×1.5=1.875 にはしない)。
 *
 * HP40%より上は×0.90。V6で入れた序盤の抑制で、
 * ここが1.0だと開幕から押し切られて「判断する前に終わる」階になる。
 */
export const TOWER90_EARLY_DAMAGE_FACTOR = 0.90;
export const TOWER90_RAGE_HP40_DAMAGE_FACTOR = 1.25;
export const TOWER90_RAGE_HP20_DAMAGE_FACTOR = 1.5;

/**
 * お供1体が倒れるごとにボスへ**永久に**乗る狂化。
 * 4体すべてなら ATK+4,800 / SPD+60 / クリ率+40% / クリダメ+80%。
 *
 * HP帯の狂化とは別枠で、同時に効く。
 */
export const TOWER90_ESCORT_DEATH_ATK = 1_200;
export const TOWER90_ESCORT_DEATH_SPD = 15;
export const TOWER90_ESCORT_DEATH_CRI_RATE = 0.10;
export const TOWER90_ESCORT_DEATH_CRI_DMG = 0.20;

/** 戦鼓晶S3がボスにだけ渡す上乗せ。**お供には配らない** */
export const TOWER90_WAR_DRUM_BOSS_GAUGE = 0.15;
export const TOWER90_WAR_DRUM_BOSS_COOLDOWN = 1;
/** 戦鼓晶S3が味方全体へ配る行動ゲージ */
export const TOWER90_WAR_DRUM_TEAM_GAUGE = 0.30;

/**
 * 戦鼓晶が倒れた後、狂牙獣が生きている間だけ乗る強化。
 * 処刑突撃だけが2.6→2.9倍になる(S1・S2は据え置き)。
 */
export const TOWER90_FANG_RAGE_ATK = 1_500;
export const TOWER90_FANG_RAGE_SPD = 15;
export const TOWER90_FANG_EXECUTE_MULTIPLIER = 2.6;
export const TOWER90_FANG_EXECUTE_RAGE_MULTIPLIER = 2.9;

export const TOWER90_BOSS_TEMPLATE_ID = "nemesis";
export const TOWER90_CRYSTAL_TEMPLATE_ID = ANCIENT_CRYSTAL.templateId;
export const TOWER90_FANG_TEMPLATE_ID = ANCIENT_FANG_BEAST.templateId;

/** engine が階固有の処理を引っ掛けるための目印 */
export const TOWER90_WAR_DRUM_TEMPO_SKILL_ID = "tower90_wardrum_s3";
export const TOWER90_FANG_EXECUTE_SKILL_ID = "tower90_fang_s3";

const NEMESIS_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower90_boss_s1",
    name: "断罪の刃",
    description: "敵単体に攻撃力1.2倍のダメージを与え、70%で2ターン防御力を50%低下させ、行動ゲージを15%減少させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.2 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.7 },
      { kind: "GAUGE", amount: -0.15 },
    ],
  },
  {
    id: "tower90_boss_s2",
    name: "狂刃連斬",
    description: "敵単体へ攻撃力0.7倍の3連撃。対象が弱体効果を受けていればダメージが35%増加し、2ターン攻撃力を50%低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.7, hits: 3, conditionalBonus: [{ when: "TARGET_HAS_DEBUFF", bonus: 0.35 }] },
      { kind: "DEBUFF", stat: "atk", amount: 0.5, durationTurns: 2, chance: 1 },
    ],
  },
  {
    /*
     * **効果の並びが処理の順番。**
     * ダメージ → 強化を全解除 → ゲージ減 → 防御ダウン、の順に書く。
     * 解除を後ろへ回すと、直前に付けた防御ダウンごと巻き込む形にはならないが、
     * 「解除してから弱らせる」という読み合いが崩れる。
     *
     * `STRIP` に `count` を書かないのが**全解除**の意味
     * (engine は `count ?? Number.POSITIVE_INFINITY` で解く)。
     */
    id: "tower90_boss_s3",
    name: "絶・終焉の波動",
    description: "敵全体に攻撃力1.35倍のダメージを与え、強化効果をすべて解除し、行動ゲージを50%減少させ、3ターン防御力を50%低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "DAMAGE", multiplier: 1.35 },
      { kind: "STRIP", chance: 1 },
      { kind: "GAUGE", amount: -0.5 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 3, chance: 1, fixedDuration: true },
    ],
  },
];

const RIFT_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower90_rift_s1",
    name: "裂傷弾",
    description: "敵単体に攻撃力0.9倍のダメージを与え、75%で2ターン防御力を50%低下させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.9 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.75 },
    ],
  },
  {
    id: "tower90_rift_s2",
    name: "破砕波",
    description: "敵全体に攻撃力0.6倍のダメージを与え、85%で2ターン防御力を50%低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.6 },
      { kind: "DEBUFF", stat: "def", amount: 0.5, durationTurns: 2, chance: 0.85 },
    ],
  },
  {
    /*
     * **負の `MITIGATE` は「脆弱」**(被ダメージ+40%)。
     * `damageTakenMultiplier` は `1 - reduction` なので、
     * -0.4 が入れば 1.4倍 = 4割増しになる。
     *
     * engine 側の `MITIGATE` は正負で向きを分けてある。分けないと
     * `Math.max(0, -0.4)` で**何も起きないまま素通り**する
     * (図鑑に負の MITIGATE は1件も無いので、既存の軽減の挙動は変わらない)。
     */
    id: "tower90_rift_s3",
    name: "脆弱刻印",
    description: "敵単体が受けるダメージを2ターン40%増加させ、行動ゲージを40%減少させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 5,
    effects: [
      { kind: "MITIGATE", amount: -0.4, durationTurns: 2 },
      { kind: "GAUGE", amount: -0.4 },
    ],
  },
];

const WAR_DRUM_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower90_wardrum_s1",
    name: "鼓舞弾",
    description: "敵単体に攻撃力0.85倍のダメージを与え、自身の行動ゲージを10%増加させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.85 },
      { kind: "GAUGE", amount: 0.1, applyTo: "SELF" },
    ],
  },
  {
    id: "tower90_wardrum_s2",
    name: "狂戦の鼓動",
    description: "味方全体の攻撃力を2ターン50%、速度を2ターン40%上昇させる。",
    target: "ALL_ALLIES",
    cooldownTurns: 4,
    effects: [
      { kind: "BUFF", stat: "atk", amount: 0.5, durationTurns: 2 },
      { kind: "BUFF", stat: "spd", amount: 0.4, durationTurns: 2 },
    ],
  },
  {
    /*
     * **ゲージだけが味方全体。CT短縮はボスだけ。**
     *
     * ここに `COOLDOWN_REDUCE` を書くとお供4体にも配られてしまい、
     * 妨害役の縛晶まで回転が上がって別物の階になる。
     * ボスへの追加ゲージ15%とCT-1は engine の90階処理が渡す。
     */
    id: TOWER90_WAR_DRUM_TEMPO_SKILL_ID,
    name: "血戦共鳴",
    description: "味方全体の行動ゲージを30%増加させ、古代ネメシスにはさらに行動ゲージ15%とスキルクールタイム1ターン短縮を与える。",
    target: "ALL_ALLIES",
    cooldownTurns: 5,
    effects: [
      { kind: "GAUGE", amount: TOWER90_WAR_DRUM_TEAM_GAUGE },
    ],
  },
];

const FANG_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower90_fang_s1",
    name: "狂牙",
    description: "敵単体に攻撃力1.1倍のダメージを与える。対象のHPが50%以下ならダメージが20%増加する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 1.1, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.2 }] },
    ],
  },
  {
    id: "tower90_fang_s2",
    name: "血裂連撃",
    description: "敵単体へ攻撃力0.8倍の2連撃を行い、40%で2ターンの毒を与える。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8, hits: 2 },
      { kind: "POISON", damageRatePerStack: 0.05, durationTurns: 2, chance: 0.4 },
    ],
  },
  {
    /*
     * 戦鼓晶が倒れた後、狂牙獣が生きている間だけ**この技だけ**2.9倍になる。
     * S1・S2は据え置き——全部を底上げすると、
     * 「処刑突撃で瀕死を刈る」という役割ではなく、ただの高火力役になる。
     */
    id: TOWER90_FANG_EXECUTE_SKILL_ID,
    name: "処刑突撃",
    description: "敵単体に攻撃力2.6倍のダメージを与える。対象のHPが50%以下ならダメージが40%増加し、倒した場合は自身の行動ゲージが50%増加する。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 4,
    effects: [
      { kind: "DAMAGE", multiplier: TOWER90_FANG_EXECUTE_MULTIPLIER, targetHpBonus: [{ hpRatio: 0.5, bonus: 0.4 }] },
      { kind: "GAUGE", amount: 0.5, applyTo: "SELF", requires: "KILLED_TARGET" },
    ],
  },
];

const BIND_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "tower90_bind_s1",
    name: "遅滞弾",
    description: "敵単体に攻撃力0.8倍のダメージを与え、行動ゲージを15%減少させる。",
    target: "SINGLE_ENEMY",
    cooldownTurns: 0,
    effects: [
      { kind: "DAMAGE", multiplier: 0.8 },
      { kind: "GAUGE", amount: -0.15 },
    ],
  },
  {
    id: "tower90_bind_s2",
    name: "停滞領域",
    description: "敵全体に攻撃力0.55倍のダメージを与え、行動ゲージを20%減少させ、60%で2ターン速度を30%低下させる。",
    target: "ALL_ENEMIES",
    cooldownTurns: 3,
    effects: [
      { kind: "DAMAGE", multiplier: 0.55 },
      { kind: "GAUGE", amount: -0.2 },
      { kind: "DEBUFF", stat: "spd", amount: 0.3, durationTurns: 2, chance: 0.6 },
    ],
  },
  {
    id: "tower90_bind_s3",
    name: "行動封鎖",
    description: "敵全体の行動ゲージを30%減少させ、50%で1ターンスキルを使用不可にする。",
    target: "ALL_ENEMIES",
    cooldownTurns: 5,
    effects: [
      { kind: "GAUGE", amount: -0.3 },
      { kind: "STATUS", status: "SKILL_LOCK", durationTurns: 1, chance: 0.5, fixedDuration: true },
    ],
  },
];

/**
 * 90階の5体。**並び順が engine の判定と対応する**ので入れ替えないこと
 * (`victoryTarget` で本体を、スキルIDでお供を見分けている)。
 */
export const TOWER90_ENEMIES: DungeonEnemy[] = [
  {
    templateId: TOWER90_BOSS_TEMPLATE_ID,
    element: "DARK",
    star: 6,
    level: 60,
    isBoss: true,
    victoryTarget: true,
    displayName: "古代ネメシス",
    fixedStats: {
      hp: TOWER90_BOSS_HP,
      atk: TOWER90_BOSS_ATK,
      def: TOWER90_BOSS_DEF,
      spd: TOWER90_BOSS_SPD,
      criRate: 0.2,
      criDmg: 1.6,
      accuracy: TOWER90_ACCURACY,
      resistance: TOWER90_RESISTANCE,
    },
    skills: NEMESIS_SKILLS,
  },
  {
    templateId: TOWER90_CRYSTAL_TEMPLATE_ID,
    element: "FIRE",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の裂晶",
    fixedStats: {
      hp: 210_000,
      atk: 7_000,
      def: 3_200,
      spd: 175,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: TOWER90_ACCURACY,
      resistance: TOWER90_RESISTANCE,
    },
    skills: RIFT_SKILLS,
  },
  {
    templateId: TOWER90_CRYSTAL_TEMPLATE_ID,
    element: "ELECTRIC",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の戦鼓晶",
    fixedStats: {
      hp: 250_000,
      atk: 7_500,
      def: 4_000,
      spd: 205,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: TOWER90_ACCURACY,
      resistance: TOWER90_RESISTANCE,
    },
    skills: WAR_DRUM_SKILLS,
  },
  {
    templateId: TOWER90_FANG_TEMPLATE_ID,
    element: "FIRE",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の狂牙獣",
    fixedStats: {
      hp: 190_000,
      atk: 9_500,
      def: 2_600,
      spd: 205,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: TOWER90_ACCURACY,
      resistance: TOWER90_RESISTANCE,
    },
    skills: FANG_SKILLS,
  },
  {
    templateId: TOWER90_CRYSTAL_TEMPLATE_ID,
    element: "WATER",
    star: 6,
    level: 60,
    victoryTarget: false,
    displayName: "古代の縛晶",
    fixedStats: {
      hp: 220_000,
      atk: 6_500,
      def: 3_800,
      spd: 165,
      criRate: 0.15,
      criDmg: 1.5,
      accuracy: TOWER90_ACCURACY,
      resistance: TOWER90_RESISTANCE,
    },
    skills: BIND_SKILLS,
  },
];
