import { SET_LABEL, SLOT_LABEL, formatStatValue } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState, ShopView } from "../../game/playerState.js";
import { SHOP_MAX_SLOTS, ShopEntry, msUntilRotation } from "../../game/shop.js";
import { el } from "../dom.js";
import { icon } from "../icons.js";
import { withPortrait } from "../three/portrait.js";

export interface ShopProps {
  player: PlayerState;
  shop: ShopView;
  /** 直前の購入結果。買った直後だけ出す */
  notice: string | null;
  onBuy: (slotIndex: number) => void;
  onUnlockSlot: () => void;
}

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

/** 商品の見た目。星の数だけは共通の見せ方にして、価値がひと目で分かるようにする */
function starRow(star: number): HTMLElement {
  return el("div", { className: "shop-card__stars", "data-star": String(star) }, ["★".repeat(star)]);
}

function renderEquipmentBody(entry: Extract<ShopEntry, { kind: "EQUIPMENT" }>): HTMLElement[] {
  const eq = entry.equipment;
  return [
    el("div", { className: "shop-card__icon shop-card__icon--equip" }, ["⚔"]),
    starRow(eq.star),
    el("div", { className: "shop-card__title" }, [SLOT_LABEL[eq.slot]]),
    el("div", { className: "shop-card__sub" }, [`${SET_LABEL[eq.set]}シリーズ`]),
    el("div", { className: "shop-card__stat" }, [formatStatValue(eq.mainStat)]),
    el("div", { className: "shop-card__sub" }, [eq.subStats.length > 0 ? `サブ${eq.subStats.length}個` : "サブなし"]),
  ];
}

function renderMonsterBody(entry: Extract<ShopEntry, { kind: "MONSTER" }>): HTMLElement[] {
  const dex = findMonsterById(entry.dexId);
  // 「fill」は絵を**親いっぱい**に広げるので、枠そのものに掛けるとカード全体を覆ってしまう。
  // 56pxの枠を1枚かませて、その中だけを埋めさせる
  return [
    el("div", { className: "shop-card__icon shop-card__icon--monster" }, [
      withPortrait(el("span", { className: "shop-card__portrait" }, [dex ? dex.emoji : "❓"]), dex, "fill"),
    ]),
    starRow(entry.star),
    el("div", { className: "shop-card__title" }, [dex ? dex.name : entry.dexId]),
    el("div", { className: "shop-card__sub" }, [dex ? dex.role : ""]),
  ];
}

function renderScrollBody(entry: Extract<ShopEntry, { kind: "SCROLL" }>): HTMLElement[] {
  return [
    el("div", { className: "shop-card__icon shop-card__icon--scroll" }, [icon("scroll")]),
    el("div", { className: "shop-card__title" }, [`召喚の書 ×${entry.count}`]),
    el("div", { className: "shop-card__sub" }, ["石を使わずに召喚できます"]),
  ];
}

function renderCard(props: ShopProps, entry: ShopEntry, index: number): HTMLElement {
  const purchased = props.shop.purchasedSlots.includes(index);
  const affordable = props.player.gold >= entry.price;

  const body =
    entry.kind === "EQUIPMENT" ? renderEquipmentBody(entry) : entry.kind === "MONSTER" ? renderMonsterBody(entry) : renderScrollBody(entry);

  const buyLabel = purchased ? "購入済み" : entry.price.toLocaleString("ja-JP");

  return el(
    "div",
    { className: `shop-card${purchased ? " shop-card--sold" : ""}`, "data-kind": entry.kind },
    [
      el("div", { className: "shop-card__body" }, body),
      el(
        "button",
        {
          type: "button",
          className: `shop-card__buy${!affordable && !purchased ? " shop-card__buy--short" : ""}`,
          disabled: purchased || !affordable,
          onclick: () => props.onBuy(index),
        },
        purchased ? [buyLabel] : [icon("coin"), el("strong", {}, [buyLabel])],
      ),
    ],
  );
}

/** まだ開いていない枠。何をすれば開くのかがその場で分かるようにする */
function renderLockedSlot(props: ShopProps, cost: number | null, isNext: boolean): HTMLElement {
  if (!isNext || cost === null) {
    return el("div", { className: "shop-card shop-card--locked" }, [
      el("div", { className: "shop-card__icon shop-card__icon--lock" }, ["🔒"]),
      el("div", { className: "shop-card__sub" }, ["前の枠を開くと解放できます"]),
    ]);
  }
  const affordable = props.player.crystal >= cost;
  return el("div", { className: "shop-card shop-card--locked" }, [
    el("div", { className: "shop-card__icon shop-card__icon--lock" }, ["🔒"]),
    el("div", { className: "shop-card__title" }, ["枠を増やす"]),
    el(
      "button",
      {
        type: "button",
        className: `shop-card__buy shop-card__buy--crystal${!affordable ? " shop-card__buy--short" : ""}`,
        disabled: !affordable,
        onclick: () => props.onUnlockSlot(),
      },
      [`💎 ${cost.toLocaleString()}`],
    ),
  ]);
}

export function renderShop(props: ShopProps): HTMLElement {
  const { shop } = props;
  const remaining = formatRemaining(msUntilRotation(Date.now()));

  const cards: HTMLElement[] = shop.entries.map((entry, index) => renderCard(props, entry, index));
  for (let i = shop.slots; i < SHOP_MAX_SLOTS; i++) {
    cards.push(renderLockedSlot(props, shop.nextSlotCost, i === shop.slots));
  }

  return el("div", { className: "screen shop-screen" }, [
    el("header", { className: "app-header" }, [
      el("h1", {}, ["ショップ"]),
      el("p", { className: "app-subtitle" }, [
        "品揃えは1時間ごとに入れ替わります。ファイターレベルが上がるほど、質の高い装備が並びやすくなります。",
      ]),
      el("p", { className: "shop-timer" }, [`次の入れ替えまで ${remaining}`]),
    ]),
    props.notice ? el("p", { className: "shop-notice" }, [props.notice]) : el("span", { className: "shop-notice--none" }),
    el("section", { className: "panel" }, [
      el("div", { className: "shop-grid" }, cards),
      el("p", { className: "shop-footnote" }, [
        `枠は ${shop.slots}/${SHOP_MAX_SLOTS} 個`,
        shop.nextSlotCost === null ? "(すべて解放済み)" : "(ダイヤで増やせます)",
      ]),
    ]),
  ]);
}
