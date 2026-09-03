/**
 * アリーナNPCの「育ち具合」を決める表。
 *
 * ## なぜ設定を1か所に集めるのか
 *
 * NPCは**プレイヤーと同じ育成ルールだけ**で作る。星・レベル・タイプ・能力ポイント・
 * 潜在覚醒・スキルレベル・装備、この7つ以外に強さの出どころを作らない。
 * だから「NPCが強い/弱い」を直したい時に触る場所は、原理的にこの表しかない。
 *
 * 逆に言うと、生成側(`src/game/arena/npc.ts`)に数字を書き始めた時点で、
 * バランス調整は「コードを読んで数字を探す作業」に変わる。
 * この案件では既に、装備の生成側を変えても控えに焼いた値が変わらない事故を
 * 出している(CLAUDE.md)。**調整点を散らさないことがそのまま安全になる。**
 *
 * ## 上の帯ほど「数値が高い」ではなく「完成度が高い」
 *
 * 帯を上げる時に倍率を掛けてはいけない。上げるのは
 *
 *   星 → レベルの詰め具合 → 装備の星と強化 → サブOPの本数 →
 *   メインOPが役割に合う確率 → 能力ポイントの投入率 → 潜在覚醒の所持率 →
 *   タイプ転生の済み具合 → 編成テンプレの噛み合い
 *
 * の9つだけ。**どれもプレイヤーが自分の手で到達できる**ものに限る。
 * 最上位でも `EQUIP_MAX_LEVEL`(15)・`ABILITY_POINT_BUDGETS`(星6で100)・
 * `STAR_MAX_LEVEL`(星6で60)を1も超えない。超えた瞬間、
 * 「どう育てても届かない相手」が並ぶ場所になる。
 */
import { EquipStar, SetType, StatType } from "../../core/equipment.js";
import { MonsterType } from "../../core/monsterDevelopment.js";
import { Star } from "../../core/rarity.js";

/* ==========================================================================
 * 役割
 * ========================================================================== */

/**
 * NPCの1体が担う役割。**`MonsterType` の実在する値をそのまま使う**
 * (BALANCE だけは「役割なし」なので除く)。
 * 独自の役割名を作ると、タイプ転生の補正と役割がずれる。
 */
export type ArenaNpcRole = Exclude<MonsterType, "BALANCE">;

/** 可変メインOPを持つスロット。1/3/5は固定なので狙う余地がない */
export type VariableSlot = 2 | 4 | 6;
export const VARIABLE_SLOTS: readonly VariableSlot[] = [2, 4, 6];

export interface ArenaNpcRolePlan {
  label: string;
  /**
   * 可変スロットで狙うメインOP。**すべて `SLOT_MAIN_STAT_OPTIONS` に実在するもの**に限る。
   * ここに存在しない組み合わせを書くと、いくら振り直しても当たらず、
   * 「役割に合った装備」を名乗れないNPCが黙って出来上がる。
   */
  mainStats: Record<VariableSlot, readonly StatType[]>;
  /** 4個セットに寄せるシリーズと、残り2枠のシリーズ */
  sets: { primary: SetType; secondary: SetType };
  /** 能力ポイントの配り方。合計1になるようにしておく(端数は最大の枠へ寄せる) */
  abilityWeights: { hp: number; atk: number; def: number; spd: number };
  /**
   * 潜在覚醒を選ぶ時に優先する分類。
   * 候補は個体ごとに違うので、**この順で見つかった最初のものを取る**。
   * 1つも無ければ候補の先頭から決定的に選ぶ(存在しないIDは絶対に作らない)。
   */
  latentCategories: readonly string[];
}

/**
 * 役割ごとの装備・能力ポイントの方針。
 *
 * 依頼どおりの割り振り(攻撃=攻撃/クリ率/クリダメ/速度、体力=HP/速度/防御/抵抗、
 * 防御=防御/HP/速度、補助=速度/HP/防御/抵抗、妨害=速度/的中/HP/防御)を、
 * **スロットごとに実際に出うるOPへ落として**書いてある。
 * 例えばクリ率・クリダメはスロット4にしか出ないので、攻撃型でもそこにしか置けない。
 */
export const ARENA_NPC_ROLE_PLANS: Readonly<Record<ArenaNpcRole, ArenaNpcRolePlan>> = {
  ATTACK: {
    label: "攻撃",
    mainStats: { 2: ["ATK_PERCENT", "SPD"], 4: ["CRIT_RATE", "CRIT_DMG"], 6: ["ATK_PERCENT"] },
    sets: { primary: "CRIT", secondary: "POWER" },
    abilityWeights: { hp: 0.1, atk: 0.6, def: 0.05, spd: 0.25 },
    latentCategories: ["OFFENSE", "DISRUPT", "SPECIAL"],
  },
  HP: {
    label: "体力",
    mainStats: { 2: ["HP_PERCENT", "SPD"], 4: ["HP_PERCENT"], 6: ["HP_PERCENT", "RESISTANCE"] },
    sets: { primary: "VITALITY", secondary: "RESIST_SET" },
    abilityWeights: { hp: 0.55, atk: 0, def: 0.2, spd: 0.25 },
    latentCategories: ["DURABILITY", "SUPPORT", "SPECIAL"],
  },
  DEFENSE: {
    label: "防御",
    mainStats: { 2: ["DEF_PERCENT", "SPD"], 4: ["DEF_PERCENT", "HP_PERCENT"], 6: ["DEF_PERCENT", "HP_PERCENT"] },
    sets: { primary: "GUARD", secondary: "VITALITY" },
    abilityWeights: { hp: 0.25, atk: 0, def: 0.55, spd: 0.2 },
    latentCategories: ["DURABILITY", "SUPPORT", "SPECIAL"],
  },
  SUPPORT: {
    label: "補助",
    mainStats: { 2: ["SPD"], 4: ["HP_PERCENT", "DEF_PERCENT"], 6: ["RESISTANCE", "HP_PERCENT"] },
    sets: { primary: "SWIFT", secondary: "RESIST_SET" },
    abilityWeights: { hp: 0.3, atk: 0, def: 0.2, spd: 0.5 },
    latentCategories: ["SUPPORT", "DURABILITY", "SPECIAL"],
  },
  DISRUPT: {
    label: "妨害",
    mainStats: { 2: ["SPD"], 4: ["HP_PERCENT", "DEF_PERCENT"], 6: ["ACCURACY", "HP_PERCENT"] },
    sets: { primary: "ACCURACY_SET", secondary: "SWIFT" },
    abilityWeights: { hp: 0.3, atk: 0, def: 0.2, spd: 0.5 },
    latentCategories: ["DISRUPT", "SUPPORT", "SPECIAL"],
  },
};

/* ==========================================================================
 * レート帯
 * ========================================================================== */

export type ArenaNpcBandId =
  | "NOVICE" | "LEARNER" | "REGULAR" | "VETERAN" | "EXPERT" | "MASTER" | "APEX";

export interface WeightedStar {
  star: Star;
  weight: number;
}

export interface ArenaNpcBand {
  id: ArenaNpcBandId;
  /** 調整の議論に使う名前。画面へ出す必要はない */
  name: string;
  /** この帯に入る最低レート。**昇順に並べること** */
  minRating: number;
  /** 星の分布。上の帯ほど高い星へ寄る */
  starWeights: readonly WeightedStar[];
  /**
   * その星の最大レベルに対する到達率の範囲。
   * 「Lv44〜50」のような絶対値で書くと、星が変わるたびに意味が変わる。
   */
  levelRatio: readonly [number, number];
  skillLevel: readonly [number, number];
  /** 装備の星の範囲(この中から一様に選ぶ) */
  equipStar: readonly [EquipStar, EquipStar];
  /** 強化レベルの範囲。上限は `EQUIP_MAX_LEVEL` を超えない */
  equipEnhance: readonly [number, number];
  /** 生成時のサブOP本数。強化の節目でさらに増えることがある */
  equipSubStats: readonly [number, number];
  /**
   * 狙ったメインOPを引くための振り直し回数。
   * 0だと完全に運任せになり、下の帯の「役割に合っていない装備」を再現できる。
   */
  mainStatRerolls: number;
  /** シリーズを4+2でそろえる確率。低い帯はバラバラの装備を着ている */
  setCoherence: number;
  /** 星別上限(`ABILITY_POINT_BUDGETS`)のうち、実際に振ってある割合 */
  abilityPointRatio: readonly [number, number];
  /** 潜在覚醒を持っている確率 */
  latentChance: number;
  /** タイプ転生を済ませている確率 */
  typeChance: number;
  /** この帯で使う編成テンプレの段(`npcTeams.ts` の `tier`) */
  teamTiers: readonly number[];
}

/**
 * レート帯の表。**昇順**に並べること(`arenaNpcBandForRating` が後ろから探す)。
 *
 * 依頼の区切りは 〜1199 / 1200-1499 / 1500-1799 / 1800-2099 / 2100-2399 / 2400〜。
 * 最上段だけ 2400-2699 と 2700〜 に割って7段にしてある。
 * レジェンド(`ARENA_TIERS` では2500から)に届いた相手と、
 * そこからさらに積み上げた相手が同じ完成度で並ぶと、
 * **一番上まで来た人にだけ、伸びしろの見えない壁**が残ってしまうため。
 */
export const ARENA_NPC_BANDS: readonly ArenaNpcBand[] = [
  {
    id: "NOVICE",
    name: "駆け出し",
    minRating: 0,
    starWeights: [{ star: 3, weight: 60 }, { star: 4, weight: 40 }],
    levelRatio: [0.55, 0.8],
    skillLevel: [1, 2],
    equipStar: [1, 2],
    equipEnhance: [0, 3],
    equipSubStats: [0, 1],
    mainStatRerolls: 0,
    setCoherence: 0,
    abilityPointRatio: [0, 0.15],
    latentChance: 0,
    typeChance: 0.1,
    teamTiers: [0],
  },
  {
    id: "LEARNER",
    name: "常連",
    minRating: 1200,
    starWeights: [{ star: 4, weight: 80 }, { star: 5, weight: 20 }],
    levelRatio: [0.8, 1],
    skillLevel: [1, 3],
    equipStar: [2, 3],
    equipEnhance: [3, 6],
    equipSubStats: [1, 2],
    mainStatRerolls: 2,
    setCoherence: 0.3,
    abilityPointRatio: [0.2, 0.5],
    latentChance: 0.1,
    typeChance: 0.35,
    teamTiers: [0, 1],
  },
  {
    id: "REGULAR",
    name: "手練れ",
    minRating: 1500,
    starWeights: [{ star: 4, weight: 25 }, { star: 5, weight: 75 }],
    levelRatio: [0.9, 1],
    skillLevel: [2, 4],
    equipStar: [3, 4],
    equipEnhance: [6, 9],
    equipSubStats: [1, 3],
    mainStatRerolls: 4,
    setCoherence: 0.55,
    abilityPointRatio: [0.4, 0.7],
    latentChance: 0.25,
    typeChance: 0.6,
    teamTiers: [1, 2],
  },
  {
    id: "VETERAN",
    name: "熟練",
    minRating: 1800,
    starWeights: [{ star: 5, weight: 85 }, { star: 6, weight: 15 }],
    levelRatio: [1, 1],
    skillLevel: [3, 4],
    equipStar: [4, 5],
    equipEnhance: [9, 12],
    equipSubStats: [2, 3],
    mainStatRerolls: 6,
    setCoherence: 0.75,
    abilityPointRatio: [0.6, 0.85],
    latentChance: 0.45,
    typeChance: 0.8,
    teamTiers: [2],
  },
  {
    id: "EXPERT",
    name: "上位",
    minRating: 2100,
    starWeights: [{ star: 5, weight: 25 }, { star: 6, weight: 75 }],
    levelRatio: [1, 1],
    skillLevel: [4, 5],
    equipStar: [5, 5],
    equipEnhance: [12, 14],
    equipSubStats: [3, 4],
    mainStatRerolls: 8,
    setCoherence: 0.9,
    abilityPointRatio: [0.8, 1],
    latentChance: 0.65,
    typeChance: 0.9,
    teamTiers: [2, 3],
  },
  {
    id: "MASTER",
    name: "頂点手前",
    minRating: 2400,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [4, 5],
    equipStar: [5, 6],
    equipEnhance: [14, 15],
    equipSubStats: [3, 4],
    mainStatRerolls: 10,
    setCoherence: 1,
    abilityPointRatio: [0.9, 1],
    latentChance: 0.85,
    typeChance: 1,
    teamTiers: [3],
  },
  {
    id: "APEX",
    name: "極み",
    minRating: 2700,
    starWeights: [{ star: 6, weight: 100 }],
    levelRatio: [1, 1],
    skillLevel: [5, 5],
    equipStar: [6, 6],
    equipEnhance: [15, 15],
    equipSubStats: [4, 4],
    mainStatRerolls: 12,
    setCoherence: 1,
    abilityPointRatio: [1, 1],
    latentChance: 1,
    typeChance: 1,
    teamTiers: [3],
  },
];

/** そのレートの帯。表の外の値でも必ず1つ返す */
export function arenaNpcBandForRating(rating: number): ArenaNpcBand {
  let found = ARENA_NPC_BANDS[0];
  for (const band of ARENA_NPC_BANDS) {
    if (rating >= band.minRating) found = band;
  }
  return found;
}

/* ==========================================================================
 * 並べ方
 * ========================================================================== */

/** 1編成の人数。プレイヤーのパーティと同じ */
export const ARENA_NPC_TEAM_SIZE = 4;

/** 一度に並べるNPCの既定人数 */
export const ARENA_NPC_DEFAULT_COUNT = 3;

/**
 * 並んだNPCのレートの置き方。
 * **勝てそうな相手・互角・格上**が必ず混ざるようにする。
 * 3人とも同じ強さなら、選ぶという操作そのものに意味が無くなる。
 */
export const ARENA_NPC_RATING_OFFSETS: readonly number[] = [-60, 5, 70];

/** 同じ帯の中でもう少し揺らす幅(±) */
export const ARENA_NPC_RATING_JITTER = 25;
