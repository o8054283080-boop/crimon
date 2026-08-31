import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { addMonster, PlayerState } from "./playerState.js";
import {
  GACHA_STAR3_TEMPLATES,
  GACHA_STAR4_TEMPLATES,
  GACHA_STAR5_TEMPLATES,
} from "../data/monsters.js";

export const RARE_ELEMENTS: Element[] = ["LIGHT", "DARK"];

/** 10連の天井で保証される最低の星。これ以上が1体も出なければ引き直す */
export const GUARANTEED_MIN_STAR = 4;
/** はじまりの10連で保証する星。通常の天井(星4)より1段上 */
export const TUTORIAL_GUARANTEED_STAR = 5;
export const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

export const SUMMON_COST_SINGLE = 100;
export const SUMMON_COST_TEN = 900;

export interface SummonResult {
  dexId: string;
  star: Star;
  isRare: boolean;
}

interface GachaTier {
  star: Star;
  isRare: boolean;
  weight: number;
}

/**
 * ガチャの排出テーブル。星3が最低保証で、火水電草(通常枠)より光闇(レア枠)の方が
 * 全体的に排出率が低い。具体的な数値はコード上でのみ管理し、UIには表示しない。
 */
const GACHA_TABLE: GachaTier[] = [
  { star: 3, isRare: false, weight: 0.57 },
  { star: 4, isRare: false, weight: 0.1365 },
  { star: 5, isRare: false, weight: 0.0435 },
  { star: 3, isRare: true, weight: 0.03 },
  { star: 4, isRare: true, weight: 0.0135 },
  { star: 5, isRare: true, weight: 0.0065 },
];

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function pickTier(table: GachaTier[], rng: () => number): GachaTier {
  const totalWeight = table.reduce((sum, tier) => sum + tier.weight, 0);
  let roll = rng() * totalWeight;
  for (const tier of table) {
    roll -= tier.weight;
    if (roll <= 0) return tier;
  }
  return table[table.length - 1];
}

/**
 * 星・レア枠に応じて、実際に抽選対象となるモンスターのdexIdを決める。
 * 属性(色)は引き続き通常枠/レア枠(火水電草 or 光闇)で決まるが、星4/5のテンプレート自体は
 * GRIFFON/DRAGON・SERAPH/NEMESISとも全属性に対応しているため、どちらが出るかは属性のレア度と
 * 切り離してランダムに決める(同じ星4でも火グリフォンと火セラフの両方が出る)。
 */
function resolveDexId(tier: GachaTier, rng: () => number): string {
  const elements = tier.isRare ? RARE_ELEMENTS : NORMAL_ELEMENTS;
  const element = pick(elements, rng);

  /*
   * **星ごとの排出比率(GACHA_TABLE)は一切触っていない。** ここで変わるのは
   * 「その星を引いた時に、どの種族が出るか」だけ。星3/4/5の合計確率は
   * 追加前と同じままで、種族の顔ぶれだけが増える。
   */
  const pool = tier.star === 3 ? GACHA_STAR3_TEMPLATES : tier.star === 4 ? GACHA_STAR4_TEMPLATES : GACHA_STAR5_TEMPLATES;
  const template = pick(pool, rng);
  return `${template.templateId}_${element}`;
}

function rollOne(rng: () => number): SummonResult {
  const tier = pickTier(GACHA_TABLE, rng);
  return { dexId: resolveDexId(tier, rng), star: tier.star, isRare: tier.isRare };
}

export type SpecialSummonScroll = "FOUR_STAR" | "LIGHT_DARK_FOUR_STAR" | "FIVE_STAR";

/**
 * 特別召喚書専用の排出テーブル。通常召喚の確率とは独立して管理する。
 * ★5召喚書は従来どおり、通常テーブルの★5枠と同じ通常/光闇比率 (87%/13%)。
 */
const SPECIAL_GACHA_TABLES: Record<SpecialSummonScroll, readonly GachaTier[]> = {
  FOUR_STAR: [
    { star: 4, isRare: false, weight: 0.7 },
    { star: 5, isRare: false, weight: 0.12 },
    { star: 4, isRare: true, weight: 0.15 },
    { star: 5, isRare: true, weight: 0.03 },
  ],
  LIGHT_DARK_FOUR_STAR: [
    { star: 4, isRare: true, weight: 0.9 },
    { star: 5, isRare: true, weight: 0.1 },
  ],
  FIVE_STAR: [
    { star: 5, isRare: false, weight: 0.0435 },
    { star: 5, isRare: true, weight: 0.0065 },
  ],
};

/** 0以上1未満の乱数を、上端を含まない明示的な確率区間へ割り当てる。 */
function pickSpecialTier(table: readonly GachaTier[], rng: () => number): GachaTier {
  const totalWeight = table.reduce((sum, tier) => sum + tier.weight, 0);
  const roll = rng() * totalWeight;
  let upperBound = 0;
  for (const tier of table) {
    upperBound += tier.weight;
    if (roll < upperBound) return tier;
  }
  return table[table.length - 1];
}

const SPECIAL_SCROLL_FIELD: Record<SpecialSummonScroll, "fourStarSummonScrolls" | "lightDarkFourStarSummonScrolls" | "fiveStarSummonScrolls"> = {
  FOUR_STAR: "fourStarSummonScrolls",
  LIGHT_DARK_FOUR_STAR: "lightDarkFourStarSummonScrolls",
  FIVE_STAR: "fiveStarSummonScrolls",
};

/** 専用テーブルから排出カテゴリを決め、そのカテゴリ内を均等抽選する。 */
export function summonWithSpecialScroll(type: SpecialSummonScroll, rng: () => number = Math.random): SummonResult {
  const tier = pickSpecialTier(SPECIAL_GACHA_TABLES[type], rng);
  return { dexId: resolveDexId(tier, rng), star: tier.star, isRare: tier.isRare };
}

/** 所持確認・追加・消費を一操作にまとめ、0枚や連打で残数が負にならないようにする。 */
export function useSpecialSummonScroll(state: PlayerState, type: SpecialSummonScroll, rng: () => number = Math.random): SummonResult | null {
  const field = SPECIAL_SCROLL_FIELD[type];
  if (state[field] <= 0) return null;
  const result = summonWithSpecialScroll(type, rng);
  addMonster(state, result.dexId, result.star);
  state[field] -= 1;
  return result;
}

/** 天井で引き直す対象。星4以上であれば、通常枠(火水電草)もレア枠(光闇)も含む */
const GUARANTEED_TIERS = GACHA_TABLE.filter((tier) => tier.star >= GUARANTEED_MIN_STAR);

/**
 * count体まとめて召喚する。
 *
 * 10連以上のときは天井として、星4以上が1体も出なければ末尾の1体を
 * 星4以上に差し替える(星4/5・通常枠/レア枠のいずれになるかは、
 * 該当する枠どうしの比率で抽選する)。
 *
 * 天井の条件を「レア枠(光闇)確定」ではなく「星4以上確定」にしてあるのは、
 * 光闇を保証してしまうと引けば必ず手に入る枠になり、レア枠であることの
 * 価値が薄れてしまうため。天井では星の高さだけを保証し、光闇はあくまで
 * 運で引き当てるものとして残している。
 */
/**
 * はじまりの10連。1度きり、ダイヤも書も要らない。
 *
 * 始めたばかりの手持ちは星1が4体で、そこから毎日200ずつ貯めて
 * 900の10連に届くまで4日かかる。**最初の日に「引く」体験がまったく無い**のは
 * このゲームの見せ場を1つ丸ごと後回しにすることになる。
 *
 * 通常の10連は「星4以上を1体」保証だが、こちらは**星5を1体**保証する。
 * 最初の1体が編成の軸になるので、そこだけは運に任せない。
 * 残り9体は通常と同じ抽選なので、引きの楽しみは残る。
 */
export function summonTutorial(rng: () => number = Math.random): SummonResult[] {
  const results = Array.from({ length: 10 }, () => rollOne(rng));
  if (!results.some((r) => r.star >= TUTORIAL_GUARANTEED_STAR)) {
    const tier = pickTier(
      GUARANTEED_TIERS.filter((t) => t.star >= TUTORIAL_GUARANTEED_STAR),
      rng,
    );
    results[results.length - 1] = { dexId: resolveDexId(tier, rng), star: tier.star, isRare: tier.isRare };
  }
  return results;
}

export function summonMany(count: number, rng: () => number = Math.random): SummonResult[] {
  const results = Array.from({ length: count }, () => rollOne(rng));

  if (count >= 10 && !results.some((r) => r.star >= GUARANTEED_MIN_STAR)) {
    const tier = pickTier(GUARANTEED_TIERS, rng);
    results[results.length - 1] = { dexId: resolveDexId(tier, rng), star: tier.star, isRare: tier.isRare };
  }

  return results;
}
