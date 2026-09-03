/**
 * アリーナショップ。
 *
 * 買うのは `buyArenaShopItem` だけ。**画面は残高も所持数も触らない。**
 * 上限を数えて弾くのも向こうの仕事で、ここは
 * 「押せないこと」と「なぜ押せないか」を出すところまで。
 *
 * 押せない理由を伏せると、上限なのかコイン不足なのかが分からず、
 * 次にやること(来週まで待つ / 戦って貯める)が決められない。
 */
import { el } from "../../dom.js";
import { arenaShopRowView } from "./model.js";
import { PvpArenaProps } from "./props.js";

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

export function renderArenaShop(props: PvpArenaProps): HTMLElement {
  const coins = Math.max(0, props.player.arenaCoins ?? 0);
  const rows = props.shopRows.map((row) => arenaShopRowView(row, coins));

  return el("div", { className: "screen ar-screen" }, nodes([
    el("header", { className: "app-header app-header--row" }, [
      el("h1", {}, ["アリーナショップ"]),
      el("span", { className: "head-note" }, [`🎫 ${coins.toLocaleString("ja-JP")}`]),
    ]),
    props.notice ? el("p", { className: "panel ar-notice" }, [props.notice]) : null,
    el("p", { className: "panel ar-note" }, [
      "アリーナコインは対戦と防衛で貯まります。上限は週・月・シーズンごとに数え直されます",
    ]),
    ...rows.map((row) =>
      el("section", { className: "panel ar-shop" }, nodes([
        el("div", { className: "ar-shop__head" }, [
          el("span", { className: "ar-shop__name" }, [row.item.name]),
          el("span", { className: "ar-shop__price" }, [row.priceText]),
        ]),
        el("p", { className: "ar-shop__note" }, [row.item.note]),
        el("div", { className: "ar-shop__limits" }, [
          el("span", { className: "ar-chip" }, [row.periodText]),
          el("span", { className: `ar-chip${row.remaining <= 0 ? " ar-chip--out" : ""}` }, [row.remainingText]),
        ]),
        el(
          "button",
          {
            type: "button",
            className: "btn btn--primary ar-shop__buy",
            disabled: row.disabled,
            onclick: () => props.onBuy(row.item.id),
          },
          ["交換する"],
        ),
        row.disabledReason ? el("p", { className: "ar-card__blocked" }, [row.disabledReason]) : null,
      ])),
    ),
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onGo("TOP") }, ["◀ アリーナに戻る"]),
  ]));
}
