import { Element } from "../core/element.js";
import { MonsterTemplate } from "../core/monster.js";
import { PlayerState, addMonster } from "./playerState.js";
import { Star } from "../core/rarity.js";
import {
  GACHA_STAR3_TEMPLATES, GACHA_STAR4_TEMPLATES, GACHA_STAR5_TEMPLATES,
} from "../data/monsters.js";
import { COLLAB_STAR4_TEMPLATES, COLLAB_STAR5_TEMPLATES } from "../data/collabEvent.js";
import {
  GUARANTEED_MIN_STAR, NORMAL_ELEMENTS, RARE_ELEMENTS, SummonResult,
} from "./gacha.js";

/**
 * コラボピックアップ召喚と、コラボ限定の召喚書3種。
 *
 * ## 通常召喚には一切触っていない
 *
 * **`gacha.ts` は1行も変えていない。**あちらの排出テーブルは
 * ステージのドロップ・ショップ・初心者向けの導線まで巻き込んでいて、
 * 「コラボの間だけ」の都合で触ると戻せなくなる。
 *
 * ここで足すのは**引いた後の振り分けだけ**。星と属性枠を決めるところまでは
 * 通常召喚とまったく同じ手順を踏み、★4・★5だった時にだけ
 * 「通常の顔ぶれか、コラボの顔ぶれか」を決める。
 * 星ごとの確率(★3 75% / ★4 18.75% / ★5 6.25%)も、
 * 通常属性と光闇の比率も、通常召喚と同じまま動かない。
 */

/**
 * ★4・★5を引いた時に、コラボの顔ぶれから出る割合。
 *
 * **光・闇でも同じ割合。**「光闇はコラボが出にくい」にすると、
 * いちばん引きたい枠だけコラボが遠いという歪んだ形になる。
 */
export const COLLAB_PICKUP_RATE = 0.33;

/** ★3にはコラボを入れない。コラボは★4以上だけの企画 */
const COLLAB_MIN_STAR = 4;

interface GachaTier {
  star: Star;
  isRare: boolean;
  weight: number;
}

/**
 * 通常召喚と同じ排出テーブル。**`gacha.ts` の値をそのまま写してある。**
 *
 * import して共有しないのは、あちらが export していないため。
 * 数字が動いた時にここだけ古くなるのを防ぐため、
 * `tests/collabGacha.test.ts` が**両者の星ごとの確率が一致すること**を見張る。
 */
const COLLAB_GACHA_TABLE: readonly GachaTier[] = [
  { star: 3, isRare: false, weight: 0.57 },
  { star: 4, isRare: false, weight: 0.1365 },
  { star: 5, isRare: false, weight: 0.0435 },
  { star: 3, isRare: true, weight: 0.03 },
  { star: 4, isRare: true, weight: 0.0135 },
  { star: 5, isRare: true, weight: 0.0065 },
];

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function pickTier(table: readonly GachaTier[], rng: () => number): GachaTier {
  const totalWeight = table.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = rng() * totalWeight;
  for (const tier of table) {
    roll -= tier.weight;
    if (roll <= 0) return tier;
  }
  return table[table.length - 1];
}

/** その星・その枠のコラボ種族。★3には1体も居ない */
function collabTemplatesFor(star: Star): readonly MonsterTemplate[] {
  if (star === 4) return COLLAB_STAR4_TEMPLATES;
  if (star === 5) return COLLAB_STAR5_TEMPLATES;
  return [];
}

/**
 * 星と枠から1体を決める。`useCollab` が真ならコラボの顔ぶれから引く。
 *
 * **属性を先に決め、その後で種族を引く。**通常召喚と同じ順番にしてあるので、
 * 同じ条件のコラボモンスターは完全に均等になる
 * (どの種族も6属性すべてを持つため、属性×種族の格子が埋まっている)。
 */
function resolveDexId(tier: GachaTier, rng: () => number, useCollab: boolean): string {
  const elements: readonly Element[] = tier.isRare ? RARE_ELEMENTS : NORMAL_ELEMENTS;
  const element = pick(elements, rng);
  const collab = useCollab ? collabTemplatesFor(tier.star) : [];
  const pool: readonly MonsterTemplate[] = collab.length > 0
    ? collab
    : tier.star === 3 ? GACHA_STAR3_TEMPLATES : tier.star === 4 ? GACHA_STAR4_TEMPLATES : GACHA_STAR5_TEMPLATES;
  return `${pick(pool, rng).templateId}_${element}`;
}

/** コラボ枠を引くかどうか。★3では必ず偽 */
function rollCollab(star: Star, rng: () => number): boolean {
  if (star < COLLAB_MIN_STAR) return false;
  return rng() < COLLAB_PICKUP_RATE;
}

export interface CollabSummonResult extends SummonResult {
  /** コラボの顔ぶれから出たか。演出と結果画面が「コラボ」の印を出すのに使う */
  isCollab: boolean;
}

function rollOne(rng: () => number): CollabSummonResult {
  const tier = pickTier(COLLAB_GACHA_TABLE, rng);
  const isCollab = rollCollab(tier.star, rng);
  return { dexId: resolveDexId(tier, rng, isCollab), star: tier.star, isRare: tier.isRare, isCollab };
}

/** 天井で引き直す対象。通常召喚と同じく★4以上の枠だけ */
const GUARANTEED_TIERS = COLLAB_GACHA_TABLE.filter((tier) => tier.star >= GUARANTEED_MIN_STAR);

/**
 * コラボピックアップ召喚を count 体ぶん引く。
 *
 * 10連以上では通常召喚と同じ天井(★4以上を1体)が働く。
 * **保証で差し替えた1体にもコラボ判定を通す。**
 * ここを素通しにすると、天井を踏んだ人だけコラボが出ない回が生まれる。
 */
export function summonCollabMany(count: number, rng: () => number = Math.random): CollabSummonResult[] {
  const results = Array.from({ length: count }, () => rollOne(rng));
  if (count >= 10 && !results.some((r) => r.star >= GUARANTEED_MIN_STAR)) {
    const tier = pickTier(GUARANTEED_TIERS, rng);
    const isCollab = rollCollab(tier.star, rng);
    results[results.length - 1] = {
      dexId: resolveDexId(tier, rng, isCollab), star: tier.star, isRare: tier.isRare, isCollab,
    };
  }
  return results;
}

/** コラボ限定の召喚書3種 */
export type CollabSummonScroll = "COLLAB_FOUR_STAR" | "COLLAB_LIGHT_DARK_FOUR_STAR" | "COLLAB_FIVE_STAR";

/**
 * コラボ限定召喚書の排出テーブル。**通常モンスターは1体も出ない。**
 *
 * 星の比率はどれも★4が90% / ★5が10%(★5専用の書だけ100%)。
 * 通常の★4以上召喚書(★5が15%)より★5が出にくいが、
 * **代わりに必ずコラボが出る。**引ける顔ぶれが12体(★4)まで絞られているので、
 * 狙った1体に届く速さは通常の書より速い。
 */
const COLLAB_SCROLL_TABLES: Record<CollabSummonScroll, readonly GachaTier[]> = {
  // 属性は通常4属性・光闇の両方から出る。比率は通常召喚の★4/★5枠と同じ
  COLLAB_FOUR_STAR: [
    { star: 4, isRare: false, weight: 0.9 * 0.91 },
    { star: 4, isRare: true, weight: 0.9 * 0.09 },
    { star: 5, isRare: false, weight: 0.1 * 0.87 },
    { star: 5, isRare: true, weight: 0.1 * 0.13 },
  ],
  // 光闇だけ。通常4属性は1つも入れない
  COLLAB_LIGHT_DARK_FOUR_STAR: [
    { star: 4, isRare: true, weight: 0.9 },
    { star: 5, isRare: true, weight: 0.1 },
  ],
  // ★5コラボだけ。このコラボの最終報酬
  COLLAB_FIVE_STAR: [
    { star: 5, isRare: false, weight: 0.87 },
    { star: 5, isRare: true, weight: 0.13 },
  ],
};

/** 上端を含まない確率区間へ割り当てる。通常の特別召喚書と同じ引き方 */
function pickScrollTier(table: readonly GachaTier[], rng: () => number): GachaTier {
  const totalWeight = table.reduce((sum, tier) => sum + tier.weight, 0);
  const roll = rng() * totalWeight;
  let upperBound = 0;
  for (const tier of table) {
    upperBound += tier.weight;
    if (roll < upperBound) return tier;
  }
  return table[table.length - 1];
}

/** 書の種類 → 持ち数の置き場 */
export const COLLAB_SCROLL_FIELD: Record<CollabSummonScroll, "collabFourStarSummonScrolls" | "collabLightDarkFourStarSummonScrolls" | "collabFiveStarSummonScrolls"> = {
  COLLAB_FOUR_STAR: "collabFourStarSummonScrolls",
  COLLAB_LIGHT_DARK_FOUR_STAR: "collabLightDarkFourStarSummonScrolls",
  COLLAB_FIVE_STAR: "collabFiveStarSummonScrolls",
};

/** コラボ限定召喚書を1回ぶん引く。**必ずコラボが出る**(通常モンスターは混ざらない) */
export function summonWithCollabScroll(type: CollabSummonScroll, rng: () => number = Math.random): CollabSummonResult {
  const tier = pickScrollTier(COLLAB_SCROLL_TABLES[type], rng);
  return { dexId: resolveDexId(tier, rng, true), star: tier.star, isRare: tier.isRare, isCollab: true };
}

/**
 * 所持を確かめ、引き、消費するまでを1操作にまとめる。
 *
 * **0枚では引けず、連打しても残数が負にならない。**
 * 通常の特別召喚書(`useSpecialSummonScroll`)と同じ形にしてある。
 */
export function useCollabSummonScroll(
  state: PlayerState, type: CollabSummonScroll, rng: () => number = Math.random,
): CollabSummonResult | null {
  const field = COLLAB_SCROLL_FIELD[type];
  // 欄が無い古いセーブでも 0 として扱う。引けないだけで、壊れはしない
  const held = state[field] ?? 0;
  if (held <= 0) return null;
  const result = summonWithCollabScroll(type, rng);
  addMonster(state, result.dexId, result.star);
  state[field] = held - 1;
  return result;
}
