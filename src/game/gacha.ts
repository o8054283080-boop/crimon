import { Element } from "../core/element.js";
import { Star } from "../core/rarity.js";
import { MONSTER_TEMPLATES } from "../data/monsters.js";

export const RARE_ELEMENTS: Element[] = ["LIGHT", "DARK"];
export const NORMAL_ELEMENTS: Element[] = ["FIRE", "WATER", "ELECTRIC", "GRASS"];

/** 光/闇はレア枠。全体の8%の確率でレア枠から排出される */
export const RARE_RATE = 0.08;

export const SUMMON_COST_SINGLE = 100;
export const SUMMON_COST_TEN = 900;

export interface SummonResult {
  dexId: string;
  star: Star;
  isRare: boolean;
}

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function rollOne(rng: () => number): SummonResult {
  const isRare = rng() < RARE_RATE;
  const template = pick(MONSTER_TEMPLATES, rng);

  if (isRare) {
    const element = pick(RARE_ELEMENTS, rng);
    const star: Star = rng() < 0.85 ? 3 : 4;
    return { dexId: `${template.templateId}_${element}`, star, isRare };
  }

  const element = pick(NORMAL_ELEMENTS, rng);
  const star: Star = rng() < 0.75 ? 1 : 2;
  return { dexId: `${template.templateId}_${element}`, star, isRare };
}

/**
 * count体まとめて召喚する。10連以上のときは天井として、レアが1体も出なければ
 * 末尾の1体を強制的にレア枠に差し替える。
 */
export function summonMany(count: number, rng: () => number = Math.random): SummonResult[] {
  const results = Array.from({ length: count }, () => rollOne(rng));

  if (count >= 10 && !results.some((r) => r.isRare)) {
    const template = pick(MONSTER_TEMPLATES, rng);
    const element = pick(RARE_ELEMENTS, rng);
    const star: Star = rng() < 0.85 ? 3 : 4;
    results[results.length - 1] = { dexId: `${template.templateId}_${element}`, star, isRare: true };
  }

  return results;
}
