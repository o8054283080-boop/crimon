import { SET_LABEL, SLOT_LABEL, formatStatValue } from "../../core/equipment.js";
import { findMonsterById } from "../../data/monsters.js";
import { PlayerState, ShopView } from "../../game/playerState.js";
import { SHOP_MAX_SLOTS, ShopEntry, msUntilRotation } from "../../game/shop.js";
import { CRYSTAL_SHOP_CATEGORY_LABEL, CrystalShopCategory } from "../../data/crystalShop.js";
import { CrystalShopRow } from "../../game/crystalShop.js";
import { el } from "../dom.js";
import { icon, slotIcon } from "../icons.js";
import { withPortrait } from "../three/portrait.js";

/** null を落として並べる。この画面だけの小道具(他の画面も同じ形で持っている) */
function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((item): item is HTMLElement => item !== null);
}

export interface ShopProps {
  player: PlayerState;
  shop: ShopView;
  /** 直前の購入結果。買った直後だけ出す */
  notice: string | null;
  onBuy: (slotIndex: number) => void;
  onUnlockSlot: () => void;
  /** ダイヤショップの1行ぶん。値段も残り回数も `game/crystalShop.ts` が決める */
  crystalRows: CrystalShopRow[];
  onBuyCrystalItem: (itemId: string) => void;
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
  // 前はどの装備も「⚔」の1文字だった。スロット1もスロット4も同じ絵で、
  // 棚に何が並んでいるのか**買う前には分からなかった**。
  // 装備画面と同じ枠の紋章を出す。画面をまたいで同じ物が同じ印で呼ばれる
  return [
    el("div", { className: "shop-card__icon shop-card__icon--equip" }, [icon(slotIcon(eq.slot))]),
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
    // 「石を使わずに召喚できます」は札の幅で「できま/す」と割れていた
    el("div", { className: "shop-card__sub" }, ["ダイヤ不要で召喚"]),
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
        purchased ? [icon("check"), el("strong", {}, [buyLabel])] : [icon("coin"), el("strong", {}, [buyLabel])],
      ),
      // 売り切れは札を薄くするだけだった。棚に「売れた」と貼る
      purchased ? el("span", { className: "shop-card__sold-seal" }, ["売切"]) : null,
    ].filter((n): n is HTMLElement => n !== null),
  );
}

/** まだ開いていない枠。何をすれば開くのかがその場で分かるようにする */
function renderLockedSlot(props: ShopProps, cost: number | null, isNext: boolean): HTMLElement {
  if (!isNext || cost === null) {
    return el("div", { className: "shop-card shop-card--locked" }, [
      el("div", { className: "shop-card__icon shop-card__icon--lock" }, [icon("lock")]),
      el("div", { className: "shop-card__sub" }, ["前の枠を開くと解放できます"]),
    ]);
  }
  const affordable = props.player.crystal >= cost;
  return el("div", { className: "shop-card shop-card--locked shop-card--next" }, [
    el("div", { className: "shop-card__icon shop-card__icon--lock" }, [icon("lock")]),
    el("div", { className: "shop-card__title" }, ["枠を増やす"]),
    el(
      "button",
      {
        type: "button",
        className: `shop-card__buy shop-card__buy--crystal${!affordable ? " shop-card__buy--short" : ""}`,
        disabled: !affordable,
        onclick: () => props.onUnlockSlot(),
      },
      [icon("crystal"), el("strong", {}, [cost.toLocaleString("ja-JP")])],
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
    el("header", { className: "app-header" }, [el("h1", {}, ["ショップ"])]),

    /* 帳場。
     * 前は3行の説明文と、その下に青い字で入れ替えまでの時間が置いてあるだけで、
     * **買い物をする場所の空気が無かった**。持ち金と入れ替えまでの砂時計を
     * 1枚の帯にまとめる。買う前に見るべき2つが、押す場所の手前に揃う。 */
    el("div", { className: "shop-counter" }, [
      el("div", { className: "shop-counter__purse" }, [
        el("span", { className: "shop-purse shop-purse--gold" }, [icon("coin"), el("strong", {}, [props.player.gold.toLocaleString("ja-JP")])]),
        el("span", { className: "shop-purse shop-purse--crystal" }, [
          icon("crystal"),
          el("strong", {}, [props.player.crystal.toLocaleString("ja-JP")]),
        ]),
      ]),
      el("div", { className: "shop-counter__timer" }, [
        el("span", { className: "shop-counter__timer-label" }, ["入れ替えまで"]),
        el("strong", {}, [remaining]),
      ]),
    ]),

    props.notice ? el("p", { className: "shop-notice" }, [icon("check"), props.notice]) : el("span", { className: "shop-notice--none" }),

    el("section", { className: "panel shop-shelf" }, [
      el("div", { className: "shop-grid" }, cards),
      el("p", { className: "shop-footnote" }, [
        `棚は ${shop.slots}/${SHOP_MAX_SLOTS} 段`,
        shop.nextSlotCost === null ? "・すべて解放済み" : "・ダイヤで増やせます",
        "　ファイターレベルが上がるほど、質の高い装備が並びます",
      ]),
    ]),

    ...renderCrystalShop(props),
  ]);
}


/* ==========================================================================
 * ダイヤショップ
 *
 * **入れ替わらない棚。** 上のゴールドの棚は時間で品揃えが変わるが、
 * こちらはいつ来ても同じものが並ぶ。だから「今日はどうかな」と
 * 覗く場所ではなく、「あれを買いに来た」場所として作る。
 * ========================================================================== */

/** 残り回数の一行。**無制限に「残り∞」は出さない**(数える意味が無い) */
function remainingLabel(row: CrystalShopRow): HTMLElement | null {
  if (row.remaining === null) return null;
  const limit = row.item.limit ?? 0;
  const period = row.item.period === "WEEKLY" ? "今週" : "今月";
  return el("div", {
    className: `cshop-card__limit${row.remaining <= 0 ? " cshop-card__limit--out" : ""}`,
  }, [`${period} 残り ${row.remaining} / ${limit}`]);
}

function renderCrystalCard(props: ShopProps, row: CrystalShopRow): HTMLElement {
  const soldOut = row.remaining !== null && row.remaining <= 0;
  const blocked = soldOut || !row.affordable;
  return el("div", { className: "cshop-card" }, nodes([
    el("div", { className: "cshop-card__head" }, [
      el("div", { className: "cshop-card__title" }, [row.item.name]),
      el("div", { className: "cshop-card__price" }, [
        icon("crystal"),
        el("strong", {}, [row.item.price.toLocaleString("ja-JP")]),
      ]),
    ]),
    el("div", { className: "cshop-card__note" }, [row.item.note]),
    remainingLabel(row),
    el("button", {
      type: "button",
      className: "btn btn--primary cshop-card__buy",
      disabled: blocked,
      onclick: () => props.onBuyCrystalItem(row.item.id),
    }, [soldOut ? "購入済み" : "交換する"]),
    /*
     * 押せない時は理由を添える。**押せないボタンだけを出さない。**
     * 何を満たせば買えるのかが分からないと、待てばよいのか
     * 貯めればよいのかの区別が付かない。
     */
    blocked
      ? el("div", { className: "cshop-card__reason" }, [
        soldOut
          ? (row.item.period === "WEEKLY" ? "来週また買えます" : "来月また買えます")
          : `ダイヤがあと ${(row.item.price - props.player.crystal).toLocaleString("ja-JP")} 必要です`,
      ])
      : null,
  ]));
}

function renderCrystalShop(props: ShopProps): HTMLElement[] {
  const groups: { category: CrystalShopCategory; rows: CrystalShopRow[] }[] = [];
  for (const row of props.crystalRows) {
    const found = groups.find((g) => g.category === row.item.category);
    if (found) found.rows.push(row);
    else groups.push({ category: row.item.category, rows: [row] });
  }
  return groups.map((group) => el("section", { className: "panel cshop" }, [
    /*
     * 見出しに自前の印を足さない。**`.panel h2` が既に金色のひし形を立てている**ので、
     * ここでクリスタルの絵を並べると「◆♢ 育成」と印が2つ並ぶ(実際にそうなった)。
     * クリスタルの絵は値段の横だけに出す。
     */
    el("h2", { className: "cshop__title" }, [CRYSTAL_SHOP_CATEGORY_LABEL[group.category]]),
    el("div", { className: "cshop__list" }, group.rows.map((row) => renderCrystalCard(props, row))),
  ]));
}
