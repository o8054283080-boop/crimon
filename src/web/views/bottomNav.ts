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
  | "AUTO_FARM_RESULT"
  | "ARENA"
  | "ARENA_BATTLE"
  | "TRIAL_TOWER"
  | "TOWER_BATTLE"
  | "HOW_TO_PLAY";

/**
 * 下のタブ。
 *
 * 以前は7個あり、390px幅では「モンスター」が「モンス...」と切れていた。
 * 切れた文字は読めないので、あるだけ無駄になる。
 *
 * 5個に絞り、**いつでも戻りたい場所**だけを残した。
 * ステージとパーティはホーム内の大きな導線から入る。下部は日常的に
 * 行き来する5画面に固定し、画面幅によって項目を入れ替えない。
 */
const TABS: { screen: ScreenName; name: IconName; label: string }[] = [
  { screen: "HOME", name: "home", label: "ホーム" },
  { screen: "MONSTERS", name: "monsters", label: "モンスター" },
  { screen: "EQUIPMENT", name: "equipment", label: "装備" },
  { screen: "SUMMON", name: "summon", label: "召喚" },
  { screen: "SHOP", name: "shop", label: "ショップ" },
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
        ariaLabel: tab.label,
        ariaCurrent: tab.screen === current ? "page" : undefined,
      },
      [
        el("span", { className: "bottom-nav__icon" }, [icon(tab.name)]),
        el("span", { className: "bottom-nav__label" }, [tab.label]),
      ],
    ),
  );
  return el("nav", { className: "bottom-nav", ariaLabel: "メインナビゲーション" }, buttons);
}
