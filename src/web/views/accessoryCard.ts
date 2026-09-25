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

/** ★・レア度・系統・Lv・鍵の札の並び。一覧・詳細・獲得のシートで同じ形を使う */
export function renderAccessoryBadges(acc: Accessory): HTMLElement {
  return badges(acc);
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

/**
 * まとめ売りの選択モードでの札の状態。
 *   PICKED  … 売却に選ばれている(✓の印)
 *   FREE    … 選べる
 *   BLOCKED … ロック中・装着中で売れない(沈めて、押しても反応しない)
 */
export type AccessoryBulkState = "PICKED" | "FREE" | "BLOCKED";

/** 一覧の1行。押すと選ぶ */
export function renderAccessoryRow(acc: Accessory, options: {
  selected?: boolean;
  ownerName?: string | null;
  /** まとめ売りの選択モード中だけ渡す */
  bulk?: AccessoryBulkState;
  onClick: () => void;
}): HTMLElement {
  const bulkClass = options.bulk === undefined ? ""
    : ` acc-row--selectable${options.bulk === "PICKED" ? " acc-row--picked" : ""}${options.bulk === "BLOCKED" ? " acc-row--blocked" : ""}`;
  return el("button", {
    type: "button",
    className: `acc-row acc-row--${acc.rarity.toLowerCase()}${options.selected ? " acc-row--selected" : ""}${bulkClass}`,
    "data-accessory-id": acc.id,
    "aria-pressed": options.bulk === undefined ? undefined : String(options.bulk === "PICKED"),
    "aria-disabled": options.bulk === "BLOCKED" ? "true" : undefined,
    onclick: options.onClick,
  }, [
    badges(acc),
    el("div", { className: "acc-row__main" }, [describeAccessoryMain(acc)]),
    el("div", { className: "acc-row__specials" }, [acc.specials.map(describeSpecial).join(" / ")]),
    options.ownerName ? el("div", { className: "acc-row__owner" }, [`装着中: ${options.ownerName}`]) : null,
    // 売れない理由は札の中で言う。沈めただけでは「なぜ押せないか」が分からない
    options.bulk === "BLOCKED"
      ? el("div", { className: "acc-row__blocked" }, [acc.locked ? "ロック中は売却できません" : "装着中は売却できません"])
      : null,
  ].filter((n): n is HTMLElement => n !== null));
}
