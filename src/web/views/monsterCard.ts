import { ELEMENT_JA } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { Star } from "../../core/rarity.js";
import { el } from "../dom.js";

/**
 * モンスターを表す共通のカード。
 *
 * 一覧・図鑑・編成のどこでも同じ見た目になるよう、組み立てをここに集約する。
 * 作りはガチャRPGの定番に寄せてあり、外側から順に
 *   レア度の額縁 → 属性色の肖像 → 星の帯 → 名前の帯
 * という層になっている。額縁の色はレア度で変わるので、
 * 並べた時に強いモンスターが一目で分かる。
 */
export interface MonsterCardOptions {
  /** 選択中(編成済みなど)。額縁が光る */
  selected?: boolean;
  /** 押せない状態 */
  disabled?: boolean;
  /** 特別扱いの目印(ボーナス対象など) */
  bonus?: boolean;
  /** 星の数。省略すると星の帯を出さない(図鑑など) */
  star?: Star;
  /** 現在レベル。省略すると出さない */
  level?: number;
  /** そのレベル上限。levelと併せて出す */
  maxLevel?: number;
  /** 星とレベルの代わりに出す補足(図鑑での役割名など) */
  caption?: string;
  /** 選択中に重ねるラベル */
  badge?: string;
}

/** 星の数に応じた額縁の等級。並べた時にレア度が色で伝わるようにする */
function rarityClass(star: Star | undefined): string {
  if (!star) return "mcard--rarity-none";
  if (star >= 6) return "mcard--rarity-6";
  if (star === 5) return "mcard--rarity-5";
  if (star === 4) return "mcard--rarity-4";
  if (star === 3) return "mcard--rarity-3";
  return "mcard--rarity-low";
}

export function buildMonsterCard(
  dex: MonsterDefinition | undefined,
  fallbackName: string,
  onClick: () => void,
  options: MonsterCardOptions = {},
): HTMLElement {
  const { selected, disabled, bonus, star, level, maxLevel, caption, badge } = options;

  const classes = ["mcard", rarityClass(star)];
  if (selected) classes.push("mcard--selected");
  if (disabled) classes.push("mcard--disabled");
  if (bonus) classes.push("mcard--bonus");

  const portraitChildren: (HTMLElement | null)[] = [
    el("span", { className: "mcard__emoji" }, [dex ? dex.emoji : "❓"]),
    dex ? el("span", { className: "mcard__element", title: `${ELEMENT_JA[dex.element]}属性` }, [ELEMENT_JA[dex.element]]) : null,
    level !== undefined ? el("span", { className: "mcard__level" }, [`Lv${level}${maxLevel ? `/${maxLevel}` : ""}`]) : null,
    bonus ? el("span", { className: "mcard__bonus" }, ["★"]) : null,
  ];

  const children: (HTMLElement | null)[] = [
    el("span", { className: "mcard__portrait", style: dex ? `--elem:${dex.color}` : undefined }, portraitChildren.filter(isElement)),
    star ? el("span", { className: "mcard__stars" }, [starRow(star)]) : null,
    el("span", { className: "mcard__name" }, [dex ? dex.name : fallbackName]),
    caption ? el("span", { className: "mcard__caption" }, [caption]) : null,
    badge ? el("span", { className: "mcard__badge" }, [badge]) : null,
  ];

  return el(
    "button",
    { type: "button", className: classes.join(" "), disabled, onclick: onClick },
    children.filter(isElement),
  );
}

/** 星を1つずつ要素にして、光沢を個別にかけられるようにする */
function starRow(star: Star): HTMLElement {
  return el(
    "span",
    { className: "mcard__star-row" },
    Array.from({ length: star }, () => el("span", { className: "mcard__star" }, ["★"])),
  );
}

function isElement(node: HTMLElement | null): node is HTMLElement {
  return node !== null;
}
