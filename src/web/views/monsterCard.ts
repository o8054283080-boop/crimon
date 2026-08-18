import { ELEMENT_JA } from "../../core/element.js";
import { MonsterDefinition } from "../../core/monster.js";
import { Star } from "../../core/rarity.js";
import { el } from "../dom.js";
import { withPortrait } from "../three/portrait.js";

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
  /**
   * 長押しした時の動作。押している間に指が動いたら取り消す。
   * 発火した場合は、指を離した時のクリックを打ち消す
   * (「詳細を見ようとしただけなのに編成が変わる」のを防ぐ)。
   */
  onLongPress?: () => void;
}

/** 長押しと判定するまでの時間(ミリ秒)。短すぎると普通のタップで暴発する */
const LONG_PRESS_MS = 420;
/** この距離(ピクセル)を超えて指が動いたら、スクロールとみなして取り消す */
const LONG_PRESS_MOVE_TOLERANCE = 12;

/**
 * 長押しを仕込む。
 *
 * `contextmenu` を止めないと、端末によっては長押しで「画像を保存」などの
 * メニューが出て操作を奪われる。
 */
function attachLongPress(node: HTMLElement, onLongPress: () => void): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let fired = false;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  node.addEventListener("pointerdown", (event) => {
    fired = false;
    startX = event.clientX;
    startY = event.clientY;
    cancel();
    timer = setTimeout(() => {
      fired = true;
      timer = null;
      onLongPress();
    }, LONG_PRESS_MS);
  });

  node.addEventListener("pointermove", (event) => {
    if (timer === null) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > LONG_PRESS_MOVE_TOLERANCE) cancel();
  });

  for (const type of ["pointerup", "pointercancel", "pointerleave"] as const) {
    node.addEventListener(type, cancel);
  }

  // 長押しが成立した後のクリックは無かったことにする
  node.addEventListener(
    "click",
    (event) => {
      if (!fired) return;
      fired = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );

  node.addEventListener("contextmenu", (event) => event.preventDefault());
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
  const { selected, disabled, bonus, star, level, maxLevel, caption, badge, onLongPress } = options;

  const classes = ["mcard", rarityClass(star)];
  if (selected) classes.push("mcard--selected");
  if (disabled) classes.push("mcard--disabled");
  if (bonus) classes.push("mcard--bonus");

  const portraitChildren: (HTMLElement | null)[] = [
    withPortrait(el("span", { className: "mcard__emoji" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
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

  const node = el(
    "button",
    { type: "button", className: classes.join(" "), disabled, onclick: onClick },
    children.filter(isElement),
  );
  if (onLongPress && !disabled) attachLongPress(node, onLongPress);
  return node;
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
