/**
 * アリーナ(非同期対人戦)の入口。
 *
 * アリーナは1画面には収まらない(対戦・防衛・ランキング・ショップ・履歴)。
 * ここは**どこを出すかを決めるだけ**にして、中身は `views/arena/` の各画面が持つ。
 *
 * ## 重ねずに、行き先を増やす
 *
 * 詳細も設定も、すべて「別の場所」として持つ。この案件では
 * `position:fixed` / `absolute` の浮いた札が下のボタンを覆う事故を3回出しており
 * (初心者ミッションの浮遊パネル・ホームの小窓・ログインボーナスの札)、
 * その全部が「押せないボタン」を作った。**案内も詳細も画面の流れの中に置く。**
 *
 * ## 画面は数字を作らない
 *
 * レート・コイン・購入上限・リベンジの可否は `game/arena/*` が決める。
 * ここから渡せるのは「押された」という事実だけで、
 * 「勝ちました」と言えば通る経路をこちら側には作らない。
 */
import "../ui/arena.css";
import { el } from "../dom.js";
import { ArenaViewName } from "./arena/model.js";
import { PvpArenaProps } from "./arena/props.js";
import { renderArenaTop } from "./arena/top.js";
import { renderArenaOpponentDetail, renderArenaOpponents } from "./arena/opponents.js";
import { renderArenaDefense, renderArenaOffenseTeam } from "./arena/teams.js";
import { renderArenaRanking } from "./arena/ranking.js";
import { renderArenaShop } from "./arena/shopView.js";
import { renderArenaHistory } from "./arena/history.js";

export type { ArenaViewName } from "./arena/model.js";
export type { PvpArenaProps, ArenaHistoryInput } from "./arena/props.js";

/** 行き先ごとの描画。`ArenaViewName` を増やしたらここに必ず1行増える */
const VIEWS: Record<ArenaViewName, (props: PvpArenaProps) => HTMLElement> = {
  TOP: renderArenaTop,
  OPPONENTS: renderArenaOpponents,
  OPPONENT_DETAIL: renderArenaOpponentDetail,
  DEFENSE: renderArenaDefense,
  OFFENSE_TEAM: renderArenaOffenseTeam,
  RANKING: renderArenaRanking,
  SHOP: renderArenaShop,
  HISTORY: renderArenaHistory,
};

export function renderPvpArena(props: PvpArenaProps): HTMLElement {
  const render = VIEWS[props.view];
  // 知らない行き先が来てもアリーナを開けなくしない。トップへ落とす
  if (!render) return renderArenaTop(props);
  try {
    return render(props);
  } catch (error) {
    /*
     * **1つの節が壊れてもアリーナ全体を閉じない。**
     *
     * 防衛の控えが古い形だった、図鑑から消えた個体が混ざっていた——
     * どれも実際に起こり得るのに、投げてしまうと画面が真っ白になり、
     * 遊んでいる人には「アリーナが消えた」としか見えない。
     */
    console.error("[arena] 画面の組み立てに失敗しました", error);
    return el("div", { className: "screen ar-screen" }, [
      el("header", { className: "app-header" }, [el("h1", {}, ["アリーナ"])]),
      el("p", { className: "panel ar-warn" }, ["この画面を開けませんでした。アリーナのトップへ戻ってください"]),
      el("button", { type: "button", className: "btn btn--ghost btn--large", onclick: () => props.onGo("TOP") }, ["◀ アリーナに戻る"]),
    ]);
  }
}
