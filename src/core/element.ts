/**
 * 属性システム
 *
 * 火・水・電気・草の4属性は三すくみならぬ「四すくみ」で一周する相性関係を持つ。
 *   火 → 草 → 電気 → 水 → 火 …
 * (矢印の先の属性に対して攻撃側が有利=ダメージ増加)
 *
 * 光と闇は他の4属性とは相性を持たず、光と闇の間でのみ互いに弱点となる。
 */
export const CYCLE_ELEMENTS = ["FIRE", "GRASS", "ELECTRIC", "WATER"] as const;
export type CycleElement = (typeof CYCLE_ELEMENTS)[number];

export const DUAL_ELEMENTS = ["LIGHT", "DARK"] as const;
export type DualElement = (typeof DUAL_ELEMENTS)[number];

export const ELEMENTS = [...CYCLE_ELEMENTS, ...DUAL_ELEMENTS] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_JA: Record<Element, string> = {
  FIRE: "火",
  GRASS: "草",
  ELECTRIC: "電気",
  WATER: "水",
  LIGHT: "光",
  DARK: "闇",
};

/** UI表示用の属性カラー(色違いモンスター表現に使用) */
export const ELEMENT_COLOR: Record<Element, string> = {
  FIRE: "#e74c3c",
  GRASS: "#2ecc71",
  ELECTRIC: "#f1c40f",
  WATER: "#3498db",
  LIGHT: "#f5e6a8",
  DARK: "#6c3483",
};

export type ElementAffinity = "ADVANTAGE" | "DISADVANTAGE" | "NEUTRAL";

const ADVANTAGE_MULTIPLIER = 1.5;
const DISADVANTAGE_MULTIPLIER = 0.5;
const NEUTRAL_MULTIPLIER = 1.0;

function isCycleElement(el: Element): el is CycleElement {
  return (CYCLE_ELEMENTS as readonly string[]).includes(el);
}

/** attacker が defender に対して持つ相性を返す */
export function getElementAffinity(attacker: Element, defender: Element): ElementAffinity {
  if (isCycleElement(attacker) && isCycleElement(defender)) {
    const idx = CYCLE_ELEMENTS.indexOf(attacker);
    const beats = CYCLE_ELEMENTS[(idx + 1) % CYCLE_ELEMENTS.length];
    const beatenBy = CYCLE_ELEMENTS[(idx + CYCLE_ELEMENTS.length - 1) % CYCLE_ELEMENTS.length];
    if (defender === beats) return "ADVANTAGE";
    if (defender === beatenBy) return "DISADVANTAGE";
    return "NEUTRAL";
  }

  if (attacker === "LIGHT" && defender === "DARK") return "ADVANTAGE";
  if (attacker === "DARK" && defender === "LIGHT") return "ADVANTAGE";

  return "NEUTRAL";
}

export function getElementMultiplier(attacker: Element, defender: Element): number {
  switch (getElementAffinity(attacker, defender)) {
    case "ADVANTAGE":
      return ADVANTAGE_MULTIPLIER;
    case "DISADVANTAGE":
      return DISADVANTAGE_MULTIPLIER;
    default:
      return NEUTRAL_MULTIPLIER;
  }
}
