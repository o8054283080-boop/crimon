/**
 * ホームから開くランキング。**アリーナと試練の塔を1か所で見る。**
 *
 * ## なぜ作ったのか
 *
 * ホームの「ランキング」は**押せないまま置いてあった**(依頼主の指摘)。
 * 順位そのものは両方とも既にあり、アリーナの中と塔の中にそれぞれ
 * 入口が隠れていた——**見に行く道を知らないと辿り着けない。**
 *
 * ## 表は各画面のものを借りる
 *
 * ここで書き起こすと、同じ順位が2つの見た目で並ぶ。
 * `renderArenaRankingBody` と `renderTrialTowerRankingBody` を呼ぶだけにする。
 *
 * ## 切り替えは札で、読み込みは開いた側だけ
 *
 * 両方をいきなり取りに行くと、塔しか見ない人にもアリーナの通信が走る。
 * 開いた札のぶんだけ呼ぶ(呼び出し側が `onSelectTab` で面倒を見る)。
 */
import "../ui/rankings.css";
import { ArenaRankingEntry } from "../../net/arenaSync.js";
import { TrialTowerRankingEntry } from "../../net/trialTowerSync.js";
import { el } from "../dom.js";
import { renderArenaRankingBody } from "./arena/ranking.js";
import { renderTrialTowerRankingBody, renderTrialTowerRankingSelf } from "./trialTower.js";

/** どちらの順位を見ているか */
export type RankingTab = "ARENA" | "TOWER";

export interface RankingsProps {
  tab: RankingTab;
  onSelectTab: (tab: RankingTab) => void;
  arena: {
    online: boolean;
    loading: boolean;
    top: readonly ArenaRankingEntry[];
    around: readonly ArenaRankingEntry[];
    myUserId: string | null;
    myRank: number | null;
  };
  tower: {
    loading: boolean;
    offline: boolean;
    error: boolean;
    entries: readonly TrialTowerRankingEntry[];
    self: TrialTowerRankingEntry | null;
    /** 手元の最高到達階。サーバへ届いていなくても、これは必ず出せる */
    myBestFloor: number;
  };
  onReload: () => void;
}

function nodes(items: (HTMLElement | null)[]): HTMLElement[] {
  return items.filter((node): node is HTMLElement => node !== null);
}

function tabButton(props: RankingsProps, tab: RankingTab, label: string, detail: string): HTMLElement {
  const active = props.tab === tab;
  return el("button", {
    type: "button",
    className: `rankings-tab${active ? " rankings-tab--active" : ""}`,
    "data-tour": `rankings:${tab.toLowerCase()}`,
    ariaPressed: active ? "true" : "false",
    onclick: () => props.onSelectTab(tab),
  }, [
    el("strong", {}, [label]),
    el("small", {}, [detail]),
  ]);
}

export function renderRankings(props: RankingsProps): HTMLElement {
  const arenaBody = props.tab === "ARENA"
    ? renderArenaRankingBody({
      online: props.arena.online,
      loading: props.arena.loading,
      top: props.arena.top,
      around: props.arena.around,
      myUserId: props.arena.myUserId,
    })
    : [];

  const towerBody = props.tab === "TOWER"
    ? nodes([
      el("section", { className: "panel rankings-tower" }, nodes([
        /*
         * **自分の記録は、繋がっていなくても必ず出す。**
         * 順位はサーバのものだが、到達階は手元にある。
         * 「取得できませんでした」だけで終わると、自分の記録まで見えなくなる。
         */
        el("div", { className: "rankings-mine" }, [
          el("span", {}, ["あなたの最高到達階"]),
          el("strong", {}, [props.tower.myBestFloor > 0 ? `${props.tower.myBestFloor}F` : "まだ記録がありません"]),
        ]),
        renderTrialTowerRankingBody({
          loading: props.tower.loading,
          offline: props.tower.offline,
          error: props.tower.error,
          entries: props.tower.entries,
          self: props.tower.self,
          onReload: props.onReload,
        }),
        renderTrialTowerRankingSelf(props.tower.self),
      ])),
    ])
    : [];

  return el("div", { className: "screen rankings-screen" }, nodes([
    el("header", { className: "app-header" }, [el("h1", {}, ["ランキング"])]),
    el("div", { className: "rankings-tabs" }, [
      tabButton(props, "ARENA", "アリーナ", props.arena.myRank ? `あなた ${props.arena.myRank}位` : "対人戦のレート順"),
      tabButton(props, "TOWER", "試練の塔", props.tower.myBestFloor > 0 ? `あなた ${props.tower.myBestFloor}F` : "最高到達階の順"),
    ]),
    el("p", { className: "rankings-lead" }, [
      props.tab === "ARENA"
        ? "対人戦のレートの高い順。NPCは入りません"
        : "歴代最高階の高い順。同じ階では先に到達したプレイヤーが上位です",
    ]),
    ...arenaBody,
    ...towerBody,
    el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: props.onReload }, ["🔄 読み込み直す"]),
  ]));
}
