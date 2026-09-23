import "../ui/accessories.css";
import {
  type Accessory, ACCESSORY_FAMILY_JA, ACCESSORY_RARITY_JA, ACCESSORY_MAX_LEVEL,
  describeAccessoryMain, describeSpecial, describeWeak, weakStepIndex,
} from "../../core/accessory.js";
import { el } from "../dom.js";

/**
 * アクセサリーの見せ方。**モンスター詳細・一覧・遺跡の結果で同じ形を使う。**
 *
 * 出すものは依頼主の指定どおり: ★・レア度・系統・Lv・メイン・特殊効果・弱効果。
 * 特殊効果は**実際の値**で書く(「S3ダメージ +11%」「行動ゲージ減少量 ×1.12」)。
 */

const FAMILY_ICON: Record<Accessory["family"], string> = { ATTACK: "⚔", DURABILITY: "🛡", SUPPORT: "✚", DISRUPT: "⛓" };

export function accessoryHeadline(acc: Accessory): string {
  return `${FAMILY_ICON[acc.family]} ${ACCESSORY_FAMILY_JA[acc.family]}`;
}

function badges(acc: Accessory): HTMLElement {
  return el("div", { className: "acc-badges" }, [
    el("span", { className: "acc-badge acc-badge--star" }, [`★${acc.star}`]),
    el("span", { className: `acc-badge acc-badge--${acc.rarity.toLowerCase()}` }, [ACCESSORY_RARITY_JA[acc.rarity]]),
    el("span", { className: `acc-badge acc-badge--family acc-family--${acc.family.toLowerCase()}` }, [accessoryHeadline(acc)]),
    el("span", { className: "acc-badge acc-badge--level" }, [`Lv${acc.level}/${ACCESSORY_MAX_LEVEL}`]),
    acc.locked ? el("span", { className: "acc-badge acc-badge--lock" }, ["🔒"]) : null,
  ].filter((n): n is HTMLElement => n !== null));
}

/** 中身をすべて出す札。詳細・モンスター詳細で使う */
export function renderAccessorySummary(acc: Accessory): HTMLElement {
  const nextWeak = [5, 10, 15].find((lv) => lv > acc.level);
  return el("div", { className: `acc-summary acc-summary--${acc.rarity.toLowerCase()}` }, [
    badges(acc),
    el("div", { className: "acc-summary__main" }, [
      el("span", { className: "acc-summary__label" }, ["メイン"]),
      el("strong", {}, [describeAccessoryMain(acc)]),
    ]),
    el("ul", { className: "acc-summary__specials" }, acc.specials.map((roll) =>
      el("li", {}, [el("span", { className: "acc-summary__label" }, ["特殊"]), describeSpecial(roll)]))),
    el("div", { className: "acc-summary__weak" }, [
      el("span", { className: "acc-summary__label" }, ["弱効果"]),
      el("span", {}, [describeWeak(acc.weak, acc.level)]),
      nextWeak !== undefined && weakStepIndex(acc.level) < 3
        ? el("small", { className: "acc-summary__hint" }, [`Lv${nextWeak}で少し強化`])
        : null,
    ].filter((n): n is HTMLElement => n !== null)),
  ]);
}

/** 一覧の1行。押すと選ぶ */
export function renderAccessoryRow(acc: Accessory, options: {
  selected?: boolean;
  ownerName?: string | null;
  onClick: () => void;
}): HTMLElement {
  return el("button", {
    type: "button",
    className: `acc-row acc-row--${acc.rarity.toLowerCase()}${options.selected ? " acc-row--selected" : ""}`,
    "data-accessory-id": acc.id,
    onclick: options.onClick,
  }, [
    badges(acc),
    el("div", { className: "acc-row__main" }, [describeAccessoryMain(acc)]),
    el("div", { className: "acc-row__specials" }, [acc.specials.map(describeSpecial).join(" / ")]),
    options.ownerName ? el("div", { className: "acc-row__owner" }, [`装着中: ${options.ownerName}`]) : null,
  ].filter((n): n is HTMLElement => n !== null));
}
