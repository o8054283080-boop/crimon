import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import {
  GACHA_SR_COMMON_TEMPLATE,
  GACHA_SR_RARE_TEMPLATE,
  GACHA_SSR_COMMON_TEMPLATE,
  GACHA_SSR_RARE_TEMPLATE,
  MONSTER_TEMPLATES,
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

  if (tier.star === 3) {
    const template = pick(MONSTER_TEMPLATES, rng);
    return `${template.templateId}_${element}`;
  }
  if (tier.star === 4) {
    const template = pick([GACHA_SR_COMMON_TEMPLATE, GACHA_SR_RARE_TEMPLATE], rng);
    return `${template.templateId}_${element}`;
  }
  const template = pick([GACHA_SSR_COMMON_TEMPLATE, GACHA_SSR_RARE_TEMPLATE], rng);
  return `${template.templateId}_${element}`;
}

function rollOne(rng: () => number): SummonResult {
  const tier = pickTier(GACHA_TABLE, rng);
  return { dexId: resolveDexId(tier, rng), star: tier.star, isRare: tier.isRare };
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
