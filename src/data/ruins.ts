/**
 * 力の遺跡・守護の遺跡。**アクセサリーと、その周りの素材を集める常設の5階建て。**
 *
 * ## 2つの遺跡の違い
 *
 *   力の遺跡(火) … 指揮兵器を倒せば勝ち。取り巻きの塔は**倒すと本体を強くする。**
 *                   4階からは、号令塔が生きている間は指揮兵器を護り続ける(攻撃力UP・速さUP・被ダメ軽減)。
 *                   残せば護られた本体と戦い、倒せば護りが外れる代わりに本体が化ける——どちらを選ぶかの場所。
 *                   解除で護りに穴を開けられる編成は本体を、持たない編成は号令塔を先に、が答えになる。
 *                   落ちるアクセは 攻撃 / 妨害 が半々。
 *   守護の遺跡(水) … 霊獣を倒せば勝ち。身代わり像が**霊獣が受けるダメージを肩代わりする。**
 *                   身代わりは強化扱いなので、解除で剥がせる。像を先に倒してもよい。
 *                   落ちるアクセは 耐久 / サポート が半々。
 *
 * どちらも1ウェーブで、曜日の縛りは無い。
 *
 * ## 数値は実効値で置く
 *
 * 敵は `fixedStats` に実数を書く(魔人・魔獣ダンジョンの上位階と同じ)。
 * **倍率は掛からない**ので、ここの数字がそのまま戦闘の値になる。
 * 姿は装備ダンジョンの古代系を借り、名前と技と特性だけを差し替える
 * (新しい図鑑を足すとアリーナの照合表まで動くため)。
 */
import { Element } from "../core/element.js";
import type { AccessoryFamily, AccessoryRarity, AccessoryStar } from "../core/accessory.js";
import type { BossTraits } from "../core/monster.js";
import type { Skill } from "../core/skill.js";
import { ATK_UP, SPD_UP } from "../core/statusValues.js";
import type { DungeonEnemy } from "./equipmentDungeon.js";
import {
  ANCIENT_BEAST, ANCIENT_CRYSTAL, ANCIENT_CRYSTAL_CURSE, ANCIENT_DEMON, ANCIENT_GUARD_BEAST, ANCIENT_FANG_BEAST,
} from "./monsters.js";

export type RuinKind = "POWER" | "GUARDIAN";
export const RUIN_KINDS: readonly RuinKind[] = ["POWER", "GUARDIAN"];
export const RUIN_FLOOR_COUNT = 5;

export const RUIN_NAME: Record<RuinKind, string> = { POWER: "力の遺跡", GUARDIAN: "守護の遺跡" };
export const RUIN_ELEMENT: Record<RuinKind, Element> = { POWER: "FIRE", GUARDIAN: "WATER" };
/** その遺跡で落ちるアクセの系統。**半々** */
export const RUIN_FAMILIES: Record<RuinKind, readonly [AccessoryFamily, AccessoryFamily]> = {
  POWER: ["ATTACK", "DISRUPT"],
  GUARDIAN: ["DURABILITY", "SUPPORT"],
};

export interface RuinFloor {
  kind: RuinKind;
  floor: number;
  name: string;
  enemies: DungeonEnemy[];
  /** 共通の階の形(`DungeonLikeFloor`)のため。実数で置くので常に1 */
  powerScale: 1;
  speedScale: 1;
  stamina: number;
  /** アクセのレア度の重み(ヒーロー/レジェンド/エピック)。★とは別に引く */
  rarityWeights: readonly (readonly [AccessoryRarity, number])[];
  /** アクセの★の重み */
  starWeights: readonly (readonly [AccessoryStar, number])[];
  /** 進化核(確定)。範囲のどこか、両端を含む */
  cores: readonly [number, number];
  /** 古代のカケラ(確定) */
  shards: readonly [number, number];
  /** 副ドロップ。**それぞれ独立に引く** */
  bonus: { summonScroll: number; reincarnationPig3: number; skillPig1: number };
  /** 勝つたびに入るゴールド */
  goldReward: number;
  /** 勝つたびにダンジョン編成の1体ずつへ入るモンスターEXP */
  expReward: number;
  /** 勝つたびに入るファイターEXP */
  fighterExp: number;
  note: string;
}

type Quad = readonly [number, number, number, number];
const fixed = ([hp, atk, def, spd]: Quad) => ({ hp, atk, def, spd });

/* ==========================================================================
 * 能力値(HP / ATK / DEF / SPD)
 * ========================================================================== */

/** 1〜3階は両遺跡で共通 */
const SHARED_STATS: Record<1 | 2 | 3, { boss: Quad; a: Quad; b: Quad }> = {
  1: { boss: [26_000, 450, 350, 130], a: [6_000, 140, 250, 105], b: [5_000, 200, 190, 100] },
  2: { boss: [85_000, 1_650, 1_250, 150], a: [32_000, 400, 900, 125], b: [26_000, 700, 700, 120] },
  3: { boss: [245_000, 4_100, 2_450, 175], a: [105_000, 850, 2_050, 155], b: [80_000, 1_500, 1_350, 150] },
};

/*
 * 力の遺跡の4・5階。**「塔を倒すか残すか」が本物の選択になるように組んである。**
 *
 * 元の形では、塔が生きていても本体はほとんど得をせず、倒すと本体が強くなるだけだった。
 * **本体だけを狙うのが常に正解**で、5階STRONGの汎用は 既定の狙い(放置周回と同じ)19% / 本体を狙い撃ち94%。
 * 1回目の直し(号令塔を脆く・護りを常時)では逆に**「号令塔から倒す」が常に正解**になり、
 * 号令塔は全体攻撃の巻き添えで勝手に倒れて「残す」を選べなかった。
 * 2回目の直しでは、汎用が本体を得とする理由が解除ではなく属性の差だった。回復阻害は膠着を負けに変えただけで、
 * 4階も重くなりすぎた。いまの形:
 *
 *   - 号令塔は生きている間、指揮兵器へ護り(攻撃力UP・速さUP・被ダメ軽減)を張る。**CT5(5階は3)・持続6**
 *     (`heraldGuardSkills`)。張り直しが遅いので、**解除で剥がすと次に張られるまで穴が開く。**
 *     剥がれる順は 攻撃力UP → 速さUP → 軽減(`stripBuffs` の順)。本体狙いを重くしているのは攻撃力UPと速さUPで、
 *     軽減だけの護りでは本体狙いがまた最善に戻った(5階STRONGで汎用80%)
 *   - 軽減の量は階ごとに決める(`HERALD_GUARD_MITIGATE`。4階65%・5階80%)
 *   - 号令塔は巻き添えで倒れない硬さ。妨害塔は硬く(HP・防御とも)、既定の狙い(HP割合の低い順)が先に削りに行かない
 *   - 撃破時強化は小さく残す(POWER_DEATH_BUFF)。倒すと護りは外れるが、指揮兵器は強くなる
 *   - 指揮兵器は会心率80%。火→水は会心率-15ptで、かすった攻撃は会心しないので、**水で揃えるほど痛手が小さい**
 *   - **長引いたら決着を早める**(`POWER_RUIN_DAMAGE_RAMP`)。180手を過ぎると両陣営の与えるダメージが増える。
 *     回復役と支援役だけが残って300手の時間切れになる戦いを、どちらかへ決着させる。
 *     回復阻害で膠着を崩す形は、回復を選んだ編成だけへの税になった(回復+毒の本体狙いが 94→73%)ので取りやめた
 *
 * 数字は `tests/ruinPowerRoles.test.ts` の頭と、報告の表を参照。
 * 測り方: `npx tsx tools/ruinPressure.ts --teams 力・ --floors 4,5 --gear TYPICAL,STRONG,FINISHED --aim 既定,本体,号令塔,妨害塔 --seeds 700,424242`
 */
const POWER_STATS: Record<number, { boss: Quad; a: Quad; b: Quad }> = {
  ...SHARED_STATS,
  4: { boss: [191_250, 28_445, 3_150, 216], a: [42_000, 4_650, 2_730, 195], b: [48_000, 7_050, 5_100, 188] },
  /*
   * 5階は2026-10のスキル調整の後に測り直した。味方が強くなり、汎用が 既定77% まで上がって
   * 「号令塔を倒すか残すか」の差も消えていた。旧値(指揮兵器 216,750/31,573、号令塔 47,250/5,400、
   * 妨害塔 57,600/7,800)から HP を 1.8 / 1.15 / 1.3倍、攻撃を一律1.33倍にし、護りの張り直しを CT3 にした
   * (`HERALD_GUARD_COOLDOWN`)。`tests/ruinPowerRoles.test.ts` の比がすべて戻る組を格子で探して決めた。
   * ふいうちの牙(水ウルフ)のLv5をCT2にした時(2026-09-26)、号令塔の生き残りが3割を切ったので、
   * 号令塔のHPを 54,338→57,055、撃破時強化の攻撃を 1,000→500 にした
   */
  5: { boss: [390_150, 41_992, 3_150, 225], a: [57_055, 7_182, 2_860, 205], b: [74_880, 10_374, 5_400, 200] },
};
/** 力の遺跡4・5階の号令塔が指揮兵器へ張る被ダメ軽減。4階は放置で汎用が半分勝てるよう軽くしてある */
export const HERALD_GUARD_MITIGATE: Record<4 | 5, number> = { 4: 0.65, 5: 0.8 };
/**
 * 号令塔の護りの張り直し(クールタイム)。5階は3。
 * 味方の解除が強くなって5階で本体狙いが得すぎた(放置が最善から10pt以上離れた)ので、剥がされても早く張り直す
 */
export const HERALD_GUARD_COOLDOWN: Record<4 | 5, number> = { 4: 5, 5: 3 };
/**
 * 力の遺跡4・5階の長期戦の決着。180手を過ぎると、10手ごとに両陣営の与えるダメージが1.35倍ずつ増える
 * (アリーナの `ARENA_DAMAGE_RAMP` と同じ仕組み。指揮兵器の特性 `battleDamageRamp` としてエンジンへ渡る)。
 * 180手より前に決着する戦いには一切効かない
 */
export const POWER_RUIN_DAMAGE_RAMP = { afterTurns: 180, everyTurns: 10, factorPerStep: 1.35 } as const;
/** 力の遺跡4・5階の指揮兵器の会心率。1〜3階は図鑑(古代の魔人)のまま */
const POWER_COMMANDER_CRI_RATE = 0.8;

const GUARDIAN_STATS: Record<number, { boss: Quad; a: Quad; b: Quad }> = {
  ...SHARED_STATS,
  4: { boss: [650_000, 8_000, 3_250, 193], a: [850_000, 1_550, 2_800, 202], b: [135_000, 1_500, 2_200, 194] },
  5: { boss: [830_000, 9_000, 3_400, 198], a: [1_250_000, 1_900, 3_000, 210], b: [165_000, 1_700, 2_400, 204] },
};

/** 力の遺跡: 塔が倒れた時、生きている指揮兵器へ足す攻撃力(号令塔)と速さ(妨害塔) */
export const POWER_DEATH_BUFF: Record<number, { atk: number; spd: number }> = {
  1: { atk: 200, spd: 5 },
  2: { atk: 850, spd: 15 },
  3: { atk: 2_000, spd: 30 },
  // 4・5階は号令塔が生きている間の護り(heraldGuardSkills)と対で決めてある。
  // 元の 3000/50・4500/75 では、塔を倒すことが常に損だった
  4: { atk: 700, spd: 7 },
  5: { atk: 500, spd: 10 },
};

/** 守護の遺跡: 身代わり像が肩代わりする割合 */
export const GUARDIAN_PROTECT_SHARE: Record<number, number> = { 1: 0.40, 2: 0.50, 3: 0.55, 4: 0.65, 5: 0.75 };
/** 守護の遺跡: 霊獣S3の、対象の最大HPに対する追加ダメージ */
export const GUARDIAN_S3_MAX_HP: Record<number, number> = { 1: 0.02, 2: 0.025, 3: 0.035, 4: 0.045, 5: 0.055 };

/* ==========================================================================
 * 技
 * ========================================================================== */

const COMMANDER_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "ruin_commander_s1", name: "弱点狙撃",
    description: "HPの割合が最も低い敵単体に攻撃力2.0倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0, targetPriority: "LOWEST_HP",
    effects: [{ kind: "DAMAGE", multiplier: 2.0 }],
  },
  {
    id: "ruin_commander_s2", name: "追討命令",
    description: "HPの割合が最も低い敵単体に攻撃力2.15倍のダメージを与え、75%で行動ゲージを18%減らす。",
    target: "SINGLE_ENEMY", cooldownTurns: 3, targetPriority: "LOWEST_HP",
    effects: [{ kind: "DAMAGE", multiplier: 2.15 }, { kind: "GAUGE", amount: -0.18, chance: 0.75 }],
  },
  {
    id: "ruin_commander_s3", name: "戦線圧迫",
    description: "敵全体に攻撃力1.8倍のダメージを与え、行動ゲージを18%減らす。",
    target: "ALL_ENEMIES", cooldownTurns: 5,
    effects: [{ kind: "DAMAGE", multiplier: 1.8 }, { kind: "GAUGE", amount: -0.18 }],
  },
];

const HERALD_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "ruin_herald_s1", name: "号令弾",
    description: "敵単体に攻撃力0.75倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.75 }],
  },
  {
    id: "ruin_herald_s2", name: "行軍号令",
    description: "味方全体の行動ゲージを22%進める。",
    target: "ALL_ALLIES", cooldownTurns: 3,
    effects: [{ kind: "GAUGE", amount: 0.22 }],
  },
  {
    id: "ruin_herald_s3", name: "戦意集中",
    description: "味方単体の攻撃力を2ターン上昇させる。",
    target: "SINGLE_ALLY", cooldownTurns: 4,
    effects: [{ kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 2 }],
  },
];

/**
 * 4・5階の号令塔。**生きている間は指揮兵器を護る。**
 *
 * 3番目の技を、指揮兵器へ攻撃力UP・速さUP・被ダメ軽減を張る技に替えた。
 * 持続6・CT5。解除されなければ途切れないが、**解除されると次に張られるまで穴が開く**(開幕すぐに張る)。
 * 攻撃力UPを含むので、狙い先は支援AIの主要対象(`primaryTarget` の指揮兵器)になる。
 *
 * **解除で剥がれる順は 攻撃力UP → 速さUP → 軽減。**
 */
function heraldGuardSkills(mitigate: number, cooldownTurns: number): [Skill, Skill, Skill] {
  const pct = Math.round(mitigate * 100);
  return [
    HERALD_SKILLS[0],
    HERALD_SKILLS[1],
    {
      id: "ruin_herald_s3_guard", name: "指揮の護り",
      description: `指揮兵器の攻撃力と速さを6ターン上昇させ、受けるダメージを6ターン${pct}%軽減する(強化。解除1個で攻撃力UP、2個で速さUP、3個で軽減が外れる。張り直しはクールタイム${cooldownTurns})。`,
      target: "SINGLE_ALLY", cooldownTurns,
      effects: [
        { kind: "BUFF", stat: "atk", amount: ATK_UP, durationTurns: 6 },
        { kind: "MITIGATE", amount: mitigate, durationTurns: 6 },
        { kind: "BUFF", stat: "spd", amount: SPD_UP, durationTurns: 6 },
      ],
    },
  ];
}

const JAMMER_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "ruin_jammer_s1", name: "縛り弾",
    description: "敵単体に攻撃力0.85倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.85 }],
  },
  {
    id: "ruin_jammer_s2", name: "連携妨害",
    description: "敵全体に攻撃力0.6倍のダメージを与え、22%で1ターンスタンさせる。",
    target: "ALL_ENEMIES", cooldownTurns: 4,
    effects: [{ kind: "DAMAGE", multiplier: 0.6 }, { kind: "STUN", chance: 0.22, durationTurns: 1 }],
  },
  {
    id: "ruin_jammer_s3", name: "術式遮断",
    description: "敵全体に50%でスキルのクールタイムを1ターン延ばす。",
    target: "ALL_ENEMIES", cooldownTurns: 5,
    effects: [{ kind: "COOLDOWN_EXTEND", turns: 1, chance: 0.5 }],
  },
];

function spiritSkills(maxHpRatio: number): [Skill, Skill, Skill] {
  const pct = Math.round(maxHpRatio * 1000) / 10;
  return [
    {
      id: "ruin_spirit_s1", name: "守護の爪",
      description: "敵単体に攻撃力1.6倍のダメージを与える。",
      target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.6 }],
    },
    {
      id: "ruin_spirit_s2", name: "押し返し",
      description: "敵単体に攻撃力1.75倍のダメージを与え、行動ゲージを25%減らす。",
      target: "SINGLE_ENEMY", cooldownTurns: 3,
      effects: [{ kind: "DAMAGE", multiplier: 1.75 }, { kind: "GAUGE", amount: -0.25 }],
    },
    {
      id: "ruin_spirit_s3", name: "生命の波紋",
      description: `敵全体に攻撃力1.1倍のダメージを与え、さらに対象の最大HPの${pct}%のダメージを与える。`,
      target: "ALL_ENEMIES", cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 1.1 }, { kind: "MAX_HP_DAMAGE", ratio: maxHpRatio }],
    },
  ];
}

function statueSkills(share: number): [Skill, Skill, Skill] {
  const pct = Math.round(share * 100);
  return [
    {
      id: "ruin_statue_s1", name: "迎撃",
      description: "敵単体に攻撃力1.05倍のダメージを与える。",
      target: "SINGLE_ENEMY", cooldownTurns: 0,
      effects: [{ kind: "DAMAGE", multiplier: 1.05 }],
    },
    {
      id: "ruin_statue_s2", name: "身代わりの誓い",
      description: `3ターン、味方単体が受けるダメージの${pct}%を肩代わりする(強化効果。解除で剥がせる。継続ダメージは肩代わりしない)。`,
      target: "SINGLE_ALLY", cooldownTurns: 3,
      effects: [{ kind: "PROTECT", share, durationTurns: 3 }],
    },
    {
      id: "ruin_statue_s3", name: "足止め",
      description: "敵全体に攻撃力0.6倍のダメージを与え、行動ゲージを12%減らす。",
      target: "ALL_ENEMIES", cooldownTurns: 5,
      effects: [{ kind: "DAMAGE", multiplier: 0.6 }, { kind: "GAUGE", amount: -0.12 }],
    },
  ];
}

const MIST_SKILLS: [Skill, Skill, Skill] = [
  {
    id: "ruin_mist_s1", name: "霧弾",
    description: "敵単体に攻撃力0.8倍のダメージを与える。",
    target: "SINGLE_ENEMY", cooldownTurns: 0,
    effects: [{ kind: "DAMAGE", multiplier: 0.8 }],
  },
  {
    id: "ruin_mist_s2", name: "覚醒の合図",
    description: "味方全体の行動ゲージを20%進める。",
    target: "ALL_ALLIES", cooldownTurns: 4,
    effects: [{ kind: "GAUGE", amount: 0.20 }],
  },
  {
    id: "ruin_mist_s3", name: "視界遮断",
    description: "敵全体に55%で2ターン暗闇を付与する。",
    target: "ALL_ENEMIES", cooldownTurns: 5,
    effects: [{ kind: "BLIND", chance: 0.55, durationTurns: 2 }],
  },
];

/** 図鑑テンプレートの特性(魔人の反撃・魔獣の再行動や一度きりの回復)は**持たせない** */
const NO_TRAITS: BossTraits = {};

/* ==========================================================================
 * 報酬
 * ========================================================================== */

const RARITY_WEIGHTS: Record<number, RuinFloor["rarityWeights"]> = {
  1: [["HERO", 90], ["LEGEND", 9], ["EPIC", 1]],
  2: [["HERO", 80], ["LEGEND", 17], ["EPIC", 3]],
  3: [["HERO", 70], ["LEGEND", 24], ["EPIC", 6]],
  4: [["HERO", 60], ["LEGEND", 30], ["EPIC", 10]],
  5: [["HERO", 50], ["LEGEND", 35], ["EPIC", 15]],
};

const STAR_WEIGHTS: Record<number, RuinFloor["starWeights"]> = {
  1: [[4, 90], [5, 10], [6, 0]],
  2: [[4, 70], [5, 28], [6, 2]],
  3: [[4, 45], [5, 50], [6, 5]],
  4: [[4, 20], [5, 70], [6, 10]],
  5: [[4, 0], [5, 65], [6, 35]],
};

const CORES: Record<number, readonly [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 4], 5: [2, 5] };
const SHARDS: Record<number, readonly [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 4], 5: [3, 5] };
const BONUS: Record<number, RuinFloor["bonus"]> = {
  1: { summonScroll: 0.02, reincarnationPig3: 0, skillPig1: 0 },
  2: { summonScroll: 0.04, reincarnationPig3: 0.01, skillPig1: 0 },
  3: { summonScroll: 0.06, reincarnationPig3: 0.02, skillPig1: 0.002 },
  4: { summonScroll: 0.08, reincarnationPig3: 0.03, skillPig1: 0.005 },
  5: { summonScroll: 0.10, reincarnationPig3: 0.05, skillPig1: 0.01 },
};
const STAMINA: Record<number, number> = { 1: 8, 2: 9, 3: 10, 4: 11, 5: 12 };
/*
 * ゴールドと経験値。**アクセと素材が主役の場所なので、ステージほどは出さない。**
 * 5階建てで1階ぶんの重みが目覚の深域の2階ぶんにあたるので、1階あたりの伸びも深域の倍。
 * 5階(10,000G・EXP10,000・ファイターEXP750)は深域10階と揃う。
 */
export const RUIN_GOLD_PER_FLOOR = 2_000;
export const RUIN_EXP_PER_FLOOR = 2_000;
export const RUIN_FIGHTER_EXP_PER_FLOOR = 150;

function goldAndExp(floor: number): Pick<RuinFloor, "goldReward" | "expReward" | "fighterExp"> {
  return {
    goldReward: RUIN_GOLD_PER_FLOOR * floor,
    expReward: RUIN_EXP_PER_FLOOR * floor,
    fighterExp: RUIN_FIGHTER_EXP_PER_FLOOR * floor,
  };
}

/* ==========================================================================
 * 階の組み立て
 * ========================================================================== */

function buildPowerFloor(floor: number): RuinFloor {
  const element = RUIN_ELEMENT.POWER;
  const stats = POWER_STATS[floor];
  const buff = POWER_DEATH_BUFF[floor];
  // 号令塔の護り・会心寄りで長期戦を決着させる指揮兵器は4・5階だけ。1〜3階は両遺跡で共通の作りのまま
  const guarded = floor >= 4;
  return {
    kind: "POWER", floor, name: `${RUIN_NAME.POWER} ${floor}階`,
    powerScale: 1, speedScale: 1,
    stamina: STAMINA[floor],
    rarityWeights: RARITY_WEIGHTS[floor], starWeights: STAR_WEIGHTS[floor],
    cores: CORES[floor], shards: SHARDS[floor], bonus: BONUS[floor],
    ...goldAndExp(floor),
    note: guarded
      ? "指揮兵器を倒せば勝ち。号令塔は生きている間、指揮兵器へ攻撃力UP・速さUP・被ダメ軽減を張る(解除1個で攻撃力UPが外れ、張り直すまで穴が開く)。塔を倒すと護りは外れるが、指揮兵器が強くなる(号令塔は攻撃力、妨害塔は速さ)。長引くと両陣営のダメージが増える。"
      : "指揮兵器を倒せば勝ち。塔を倒すと指揮兵器が強くなる(号令塔は攻撃力、妨害塔は速さ)。",
    enemies: [
      {
        templateId: ANCIENT_DEMON.templateId, element, star: 6, level: 60,
        displayName: "指揮兵器", isBoss: true, victoryTarget: true, primaryTarget: true,
        fixedStats: guarded ? { ...fixed(stats.boss), criRate: POWER_COMMANDER_CRI_RATE } : fixed(stats.boss),
        skills: COMMANDER_SKILLS, bossTraits: guarded ? { battleDamageRamp: POWER_RUIN_DAMAGE_RAMP } : NO_TRAITS,
        initialCooldowns: [0, 2, 3],
        // 戦い方は古代の魔人を借り、姿だけ専用の絵(ruin_commander-FIRE.webp)
        artTemplateId: "ruin_commander",
      },
      {
        templateId: ANCIENT_CRYSTAL.templateId, element, star: 6, level: 60,
        displayName: "号令塔", fixedStats: fixed(stats.a), skills: guarded ? heraldGuardSkills(HERALD_GUARD_MITIGATE[floor as 4 | 5], HERALD_GUARD_COOLDOWN[floor as 4 | 5]) : HERALD_SKILLS,
        // 護りは開幕すぐに張る(3番目のCTを0で始める)
        bossTraits: { empowerBossOnDeath: { atk: buff.atk } }, initialCooldowns: guarded ? [0, 1, 0] : [0, 1, 2],
      },
      {
        templateId: ANCIENT_CRYSTAL_CURSE.templateId, element, star: 6, level: 60,
        displayName: "妨害塔", fixedStats: fixed(stats.b), skills: JAMMER_SKILLS,
        bossTraits: { empowerBossOnDeath: { spd: buff.spd } }, initialCooldowns: [0, 2, 3],
      },
    ],
  };
}

function buildGuardianFloor(floor: number): RuinFloor {
  const element = RUIN_ELEMENT.GUARDIAN;
  const stats = GUARDIAN_STATS[floor];
  return {
    kind: "GUARDIAN", floor, name: `${RUIN_NAME.GUARDIAN} ${floor}階`,
    powerScale: 1, speedScale: 1,
    stamina: STAMINA[floor],
    rarityWeights: RARITY_WEIGHTS[floor], starWeights: STAR_WEIGHTS[floor],
    cores: CORES[floor], shards: SHARDS[floor], bonus: BONUS[floor],
    ...goldAndExp(floor),
    note: "霊獣を倒せば勝ち。身代わり像が霊獣のダメージを肩代わりする(解除で剥がせる。継続ダメージは肩代わりしない)。",
    enemies: [
      {
        templateId: ANCIENT_BEAST.templateId, element, star: 6, level: 60,
        displayName: "霊獣", isBoss: true, victoryTarget: true, primaryTarget: true,
        fixedStats: fixed(stats.boss), skills: spiritSkills(GUARDIAN_S3_MAX_HP[floor]), bossTraits: NO_TRAITS,
        initialCooldowns: [0, 2, 3],
        // 戦い方は古代のけものを借り、姿だけ専用の絵(ruin_spirit-WATER.webp)
        artTemplateId: "ruin_spirit",
      },
      {
        templateId: ANCIENT_GUARD_BEAST.templateId, element, star: 6, level: 60,
        displayName: "身代わり像", fixedStats: fixed(stats.a), skills: statueSkills(GUARDIAN_PROTECT_SHARE[floor]),
        bossTraits: NO_TRAITS, initialCooldowns: [0, 1, 2],
      },
      {
        templateId: ANCIENT_FANG_BEAST.templateId, element, star: 6, level: 60,
        displayName: "霧の巫女", fixedStats: fixed(stats.b), skills: MIST_SKILLS,
        bossTraits: NO_TRAITS, initialCooldowns: [0, 2, 3],
      },
    ],
  };
}

export const POWER_RUIN_FLOORS: RuinFloor[] = Array.from({ length: RUIN_FLOOR_COUNT }, (_, i) => buildPowerFloor(i + 1));
export const GUARDIAN_RUIN_FLOORS: RuinFloor[] = Array.from({ length: RUIN_FLOOR_COUNT }, (_, i) => buildGuardianFloor(i + 1));

export function ruinFloors(kind: RuinKind): RuinFloor[] {
  return kind === "POWER" ? POWER_RUIN_FLOORS : GUARDIAN_RUIN_FLOORS;
}

export function findRuinFloor(kind: RuinKind, floor: number): RuinFloor | undefined {
  return ruinFloors(kind).find((f) => f.floor === floor);
}

/** 周回や記録で使う場所ID。`ruins_power_1` 〜 `ruins_guardian_5` */
export function ruinLocationId(kind: RuinKind, floor: number): string {
  return `ruins_${kind === "POWER" ? "power" : "guardian"}_${floor}`;
}

export function findRuinFloorByLocationId(id: string): RuinFloor | undefined {
  const match = /^ruins_(power|guardian)_(\d+)$/.exec(id);
  if (!match) return undefined;
  return findRuinFloor(match[1] === "power" ? "POWER" : "GUARDIAN", Number(match[2]));
}
