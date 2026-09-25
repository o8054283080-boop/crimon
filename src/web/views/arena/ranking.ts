/**
 * ランキング。上位100人と、自分の周辺順位。
 *
 * ## 空の表を出さない
 *
 * 行が0のランキングは「誰も居ない」ように見えるが、実際には
 * 「繋がっていないので分からない」であって、意味がまるで違う。
 * **出せない時は理由を書いて、表そのものを出さない。**
 *
 * ## NPCは載せない
 *
 * 順位は実在の人だけのもの。`fetchArenaRanking` が実プレイヤーだけを返すので、
 * ここで候補一覧のNPCを混ぜ足さないこと。混ぜた瞬間、順位は嘘になる。
 */
import { el } from "../../dom.js";
import { findMonsterById } from "../../../data/monsters.js";
import { arenaTierForRating } from "../../../data/arena/ranks.js";
import { ArenaRankingEntry } from "../../../net/arenaSync.js";
import { arenaRankingView } from "./model.js";
import { PvpArenaProps } from "./props.js";
import { withPortrait } from "../../three/portrait.js";
import { screenHeader } from "../managementHeader.js";

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

function renderRow(entry: ArenaRankingEntry, mine: boolean): HTMLElement {
  const tier = arenaTierForRating(entry.rating);
  const lead = entry.leadDexId ? findMonsterById(entry.leadDexId) : undefined;
  return el("div", { className: `ar-rank__row${mine ? " is-me" : ""}`, style: `--tier:${tier.color}` }, nodes([
    el("span", { className: "ar-rank__no" }, [`${entry.rank}`]),
    lead ? withPortrait(el("span", { className: "ar-rank__lead" }, [lead.emoji]), lead, "box") : null,
    el("span", { className: "ar-rank__name" }, [entry.name]),
    el("span", { className: "ar-rank__tier" }, [tier.name]),
    el("span", { className: "ar-rank__rating" }, [entry.rating.toLocaleString("ja-JP")]),
    el("span", { className: "ar-rank__record" }, [`${entry.wins}勝${entry.losses}敗`]),
  ]));
}

/**
 * 表の中身だけ。**外枠は呼ぶ側が持つ。**
 *
 * アリーナの中の「ランキング」と、ホームから開く一覧の両方が同じ表を出す。
 * 片方だけ直すと、同じ順位が2つの見た目で並ぶことになるので、ここを1つにする。
 */
export function renderArenaRankingBody(input: {
  online: boolean;
  loading: boolean;
  top: readonly ArenaRankingEntry[];
  around: readonly ArenaRankingEntry[];
  myUserId: string | null;
}): HTMLElement[] {
  const view = arenaRankingView(input);
  if (view.unavailableText) {
    return [
      el("section", { className: "panel" }, nodes([
        el("p", { className: "ar-empty" }, [view.unavailableText]),
        !view.online
          ? el("p", { className: "ar-note" }, [
            "この端末の中だけで遊べる状態です。レート・コイン・報酬はすべて動きますが、他の人と順位を並べることはできません",
          ])
          : null,
      ])),
    ];
  }
  return nodes([
    view.around.length > 0
      ? el("section", { className: "panel ar-rank" }, [
        el("h2", {}, ["自分の周辺"]),
        el("div", { className: "ar-rank__list" }, view.around.map((entry) => renderRow(entry, entry.userId === input.myUserId))),
      ])
      : null,
    view.top.length > 0
      ? el("section", { className: "panel ar-rank" }, [
        el("h2", {}, [`上位 ${view.top.length} 人`]),
        el("div", { className: "ar-rank__list" }, view.top.map((entry) => renderRow(entry, entry.userId === input.myUserId))),
      ])
      : null,
  ]);
}

export function renderArenaRanking(props: PvpArenaProps): HTMLElement {
  const body = renderArenaRankingBody({
    online: props.online,
    loading: props.ranking.loading,
    top: props.ranking.top,
    around: props.ranking.around,
    myUserId: props.ranking.myUserId,
  });

  return el("div", { className: "screen ar-screen" }, nodes([
    screenHeader("ランキング", { onBack: () => props.onGo("TOP"), backLabel: "アリーナに戻る" }),
    ...body,
    props.online
      ? el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onReloadRanking }, ["🔄 読み込み直す"])
      : null,
  ]));
}
