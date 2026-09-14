import "../ui/giftBox.css";
import { GIFT_DEFINITIONS } from "../../data/gifts.js";
import {
  GIFT_FAILURE_MESSAGE, GIFT_REWARD_ICON, GIFT_REWARD_LABEL,
  claimedGiftHistory, describeClaimAll, describeExpiry, formatJst, openGifts,
  type GiftClaimAllResult, type GiftClaimResult, type GiftDefinition, type GiftReward,
} from "../../game/gift.js";
import type { PlayerState } from "../../game/playerState.js";
import { el } from "../dom.js";

/**
 * プレゼントボックス。**運営から届いたものを、押して受け取る場所。**
 *
 * ## 受け取った瞬間に増える
 *
 * 既存のお知らせ配布は開けば勝手に入るが、こちらは押すまで預かったまま。
 * そのぶん**何をもらったのかが履歴に残る**ので、後から確かめられる。
 *
 * ## 画面の作りで気をつけたこと
 *
 * - **浮かせない。**札も結果も画面の流れの中に置く。この案件では
 *   浮かせた部品が下のボタンを覆う事故を3回出している(CLAUDE.md)
 * - 報酬は `grid` の `auto-fit` で、4〜6種になっても狭い端末で1列に落ちる
 * - 期限は12px。小さすぎる字を作らない
 */

export type GiftTab = "OPEN" | "HISTORY";

export interface GiftBoxProps {
  player: PlayerState;
  tab: GiftTab;
  /** 直前の受け取りの結果。押した後に一度だけ出す */
  lastResult: GiftClaimResult | GiftClaimAllResult | null;
  now?: number;
  onChangeTab: (tab: GiftTab) => void;
  onClaim: (giftId: string) => void;
  onClaimAll: () => void;
}

const nodes = (list: (HTMLElement | null)[]): HTMLElement[] =>
  list.filter((node): node is HTMLElement => node !== null);

/** 「💎 ダイヤ 5,000」の1行。数は右端に揃えて、種類が増えても読み下せるように */
function rewardRow(reward: GiftReward): HTMLElement {
  return el("li", { className: "gift-card__reward" }, [
    el("span", { className: "gift-card__reward-icon", "aria-hidden": "true" }, [GIFT_REWARD_ICON[reward.kind]]),
    el("span", { className: "gift-card__reward-name" }, [GIFT_REWARD_LABEL[reward.kind]]),
    el("span", { className: "gift-card__reward-amount" }, [`×${reward.amount.toLocaleString("ja-JP")}`]),
  ]);
}

function rewardList(gift: GiftDefinition): HTMLElement {
  return el("ul", { className: "gift-card__rewards", ariaLabel: "受け取れるもの" }, gift.rewards.map(rewardRow));
}

/** 期限まで3日を切ったら色を変える。**消えてから気づくのを避ける** */
function isUrgent(gift: GiftDefinition, now: number): boolean {
  if (!gift.expiresAt) return false;
  const left = new Date(gift.expiresAt).getTime() - now;
  return left > 0 && left < 3 * 24 * 60 * 60 * 1000;
}

function openCard(gift: GiftDefinition, now: number, onClaim: (giftId: string) => void): HTMLElement {
  return el("article", { className: "gift-card", "data-gift-id": gift.giftId }, [
    el("h3", { className: "gift-card__title" }, [gift.title]),
    el("p", { className: "gift-card__description" }, [gift.description]),
    rewardList(gift),
    el("div", { className: `gift-card__meta${isUrgent(gift, now) ? " gift-card__meta--urgent" : ""}` }, [
      el("span", {}, [`配布日時：${formatJst(gift.startsAt)}`]),
      el("span", {}, ["受取期限：", el("strong", {}, [gift.expiresAt ? formatJst(gift.expiresAt) : "なし"])]),
    ]),
    el("button", {
      type: "button",
      className: "gift-card__claim",
      "data-tour": "giftClaim",
      onclick: () => onClaim(gift.giftId),
    }, ["受け取る"]),
  ]);
}

function historyCard(gift: GiftDefinition, claimedAt: number): HTMLElement {
  return el("article", { className: "gift-card gift-card--claimed" }, [
    el("h3", { className: "gift-card__title" }, [gift.title]),
    el("div", { className: "gift-card__meta" }, [
      el("span", {}, [el("strong", {}, [formatJst(claimedAt)]), " 受取済み"]),
    ]),
    rewardList(gift),
  ]);
}

/** 押した後に出す結果。**受け取った中身を並べる**(「受け取りました」だけにしない) */
function resultPanel(result: GiftClaimResult | GiftClaimAllResult): HTMLElement {
  if ("ok" in result) {
    if (!result.ok) {
      return el("div", { className: "gift-result gift-result--error", role: "status" }, [
        el("p", { className: "gift-result__head" }, ["受け取れませんでした"]),
        el("p", { className: "gift-result__note" }, [GIFT_FAILURE_MESSAGE[result.reason]]),
      ]);
    }
    return el("div", { className: "gift-result", role: "status" }, [
      el("p", { className: "gift-result__head" }, ["受け取りました！"]),
      el("ul", { className: "gift-result__items" }, result.rewards.map(rewardRow)),
    ]);
  }

  // まとめて受け取った時。**受け取れた中身を全部並べる**
  const all = result.claimed.flatMap((entry) => entry.rewards);
  return el("div", { className: `gift-result${result.claimed.length === 0 ? " gift-result--error" : ""}`, role: "status" }, nodes([
    el("p", { className: "gift-result__head" }, [describeClaimAll(result)]),
    all.length > 0 ? el("ul", { className: "gift-result__items" }, all.map(rewardRow)) : null,
  ]));
}

export function renderGiftBox(props: GiftBoxProps): HTMLElement {
  const now = props.now ?? Date.now();
  const open = openGifts(GIFT_DEFINITIONS, props.player, now);
  const history = claimedGiftHistory(GIFT_DEFINITIONS, props.player);

  const tabButton = (tab: GiftTab, label: string, count: number | null) =>
    el("button", {
      type: "button",
      className: "gift-tabs__button",
      role: "tab",
      "aria-selected": String(props.tab === tab),
      "data-tour": tab === "OPEN" ? "giftTabOpen" : "giftTabHistory",
      onclick: () => props.onChangeTab(tab),
    }, nodes([
      el("span", {}, [label]),
      count !== null && count > 0 ? el("span", { className: "gift-tabs__count" }, [String(count)]) : null,
    ]));

  const body = props.tab === "OPEN"
    ? nodes([
      open.length > 1
        ? el("button", {
          type: "button",
          className: "gift-claim-all",
          "data-tour": "giftClaimAll",
          onclick: props.onClaimAll,
        }, ["すべて受け取る"])
        : null,
      ...open.map((gift) => openCard(gift, now, props.onClaim)),
      open.length === 0
        ? el("p", { className: "gift-empty" }, ["受け取れるプレゼントはありません。", el("br", {}, []), "配布があると、ここへ届きます。"])
        : null,
    ])
    : nodes([
      ...history.map((entry) => historyCard(entry.gift, entry.claimedAt)),
      history.length === 0 ? el("p", { className: "gift-empty" }, ["まだ受け取ったプレゼントはありません。"]) : null,
    ]);

  return el("div", { className: "screen gift-screen" }, nodes([
    el("h2", { className: "gift-screen__title" }, ["プレゼントボックス"]),
    el("p", { className: "gift-screen__lead" }, ["運営から届いたものを受け取れます。受取期限を過ぎると受け取れなくなります。"]),
    el("div", { className: "gift-tabs", role: "tablist" }, [
      tabButton("OPEN", "未受取", open.length),
      tabButton("HISTORY", "受取履歴", null),
    ]),
    props.lastResult ? resultPanel(props.lastResult) : null,
    ...body,
  ]));
}
