import { el } from "../dom.js";
import { icon, IconName } from "../icons.js";

export type ScreenName =
  | "HOME"
  | "SUMMON"
  | "MONSTERS"
  | "EQUIPMENT"
  | "PARTY"
  | "STAGES"
  | "BATTLE"
  | "STAGE_RESULT"
  | "EQUIP_DUNGEON"
  | "DUNGEON_BATTLE"
  | "LEVEL_DUNGEON"
  | "LEVEL_DUNGEON_BATTLE"
  | "GOLD_DUNGEON"
  | "GOLD_DUNGEON_BATTLE"
  | "MONSTER_DEX"
  | "SHOP"
  | "MONSTER_TRAINING"
  | "MONSTER_CREATE"
  | "AUTO_FARM_RESULT";

/**
 * 下のタブ。
 *
 * 以前は7個あり、390px幅では「モンスター」が「モンス...」と切れていた。
 * 切れた文字は読めないので、あるだけ無駄になる。
 *
 * 5個に絞り、**いつでも戻りたい場所**だけを残した。
 * 召喚・ショップ・ダンジョンはホームの一覧から入る(あちらは
 * 「何をしに行くか」を選ぶ場所で、ここは「どこに居るか」を切り替える場所)。
 */
const TABS: { screen: ScreenName; name: IconName; label: string }[] = [
  { screen: "HOME", name: "home", label: "ホーム" },
  { screen: "STAGES", name: "map", label: "ステージ" },
  { screen: "MONSTERS", name: "monsters", label: "モンスター" },
  { screen: "EQUIPMENT", name: "equipment", label: "装備" },
  { screen: "PARTY", name: "party", label: "パーティ" },
];

export function renderBottomNav(current: ScreenName, onNavigate: (screen: ScreenName) => void): HTMLElement {
  const buttons = TABS.map((tab) =>
    el(
      "button",
      {
        type: "button",
        className: "bottom-nav__btn" + (tab.screen === current ? " bottom-nav__btn--active" : ""),
        // 巡回(tools/tour.mjs)がここを目印にする。**文言で探させると、
        // ラベルを変えるたびに巡回が壊れて「画面の崩れ」と誤報する**
        "data-tour": `tab:${tab.screen}`,
        onclick: () => onNavigate(tab.screen),
      },
      [
        el("span", { className: "bottom-nav__icon" }, [icon(tab.name)]),
        el("span", { className: "bottom-nav__label" }, [tab.label]),
      ],
    ),
  );
  return el("nav", { className: "bottom-nav" }, buttons);
}
